import type { FinancialsSnapshot } from "@/types/market";
import type { InvestorProfile } from "@/types/profile";
import { ProviderError, type MarketDataProvider } from "@/lib/providers/types";
import { DemoResearchService } from "@/lib/research/demo-research-service";
import { deriveSignals } from "@/lib/personalization/signals";
import { extractJson, LLMError, type LLMMessage, type LLMProvider } from "@/lib/llm/provider";
import { logEvent } from "@/lib/server/log";
import { buildNumberWhitelist, verifyAnswer } from "./guards";
import { minimalProfile, plannerMessages, repairMessage, writerMessages } from "./prompts";
import {
  answerSchema,
  FOCUS_TAGS,
  planSchema,
  STAGE_LABELS,
  TOOL_LABELS,
  TOOL_NAMES,
  type AgentEvent,
  type AgentResult,
  type AgentStage,
  type AgentTimings,
  type LLMCallRecord,
  type ResearchPlan,
  type ToolCallRecord,
  type ToolName,
} from "./schema";
import { getSnapshot as getPinned, putSnapshot } from "./snapshot-store";

/**
 * 受控研究 Agent：Understand → Plan → Retrieve → Verify → Personalize → Respond。
 * - 固定流程，不做开放式循环；模型调用 ≤ 4 次（规划与回答各最多 1 次修复重试），数据工具每次运行每类 ≤ 1 次。
 * - 工具只读白名单，没有任何交易能力。
 * - 事实只来自 MarketDataProvider；模型只负责解释，输出经护栏校验后返回。
 */
export const AGENT_LIMITS = { maxLLMCalls: 4, maxQuestionLength: 300 } as const;

export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public stage?: AgentStage,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export interface AgentInput {
  symbol: string;
  question: string;
  profile: InvestorProfile | null;
  /** 复用已有事实快照（A/B 对比时保证同一份事实）。 */
  snapshotId?: string | null;
  followUp?: { question: string; summary: string } | null;
}

export interface AgentDeps {
  provider: MarketDataProvider;
  llm: LLMProvider | null;
  emit?: (e: AgentEvent) => void;
  signal?: AbortSignal;
}

const REQUIRED_TOOLS: ToolName[] = ["market_snapshot", "price_history"];

export function fallbackPlan(question: string, newsAvailable: boolean, note: string): ResearchPlan {
  const steps: ResearchPlan["steps"] = [
    { tool: "market_snapshot", purpose: "确认最新行情与时点" },
    { tool: "price_history", purpose: "计算回撤与波动，评估持有过程风险" },
    { tool: "fund_profile_valuation", purpose: "核实规模与估值分位" },
  ];
  if (newsAvailable) steps.push({ tool: "fund_news", purpose: "检索近期基金资讯作为线索" });
  return { intent: question.slice(0, 60), outOfScope: false, outOfScopeReason: null, focusTags: [], steps, source: "fallback", notes: [note] };
}

/** 规范化模型给出的计划：过滤未知工具 / 标签，补齐必需工具，限制 2–4 步。 */
export function normalizePlan(raw: unknown, newsAvailable: boolean): ResearchPlan {
  const p = planSchema.parse(raw);
  const notes: string[] = [];
  const allowed = new Set<string>(TOOL_NAMES.filter((t) => t !== "fund_news" || newsAvailable));
  const steps: ResearchPlan["steps"] = [];
  for (const s of p.steps) {
    if (!allowed.has(s.tool)) {
      notes.push(`已忽略不在白名单内的工具：${s.tool.slice(0, 40)}`);
      continue;
    }
    if (steps.some((x) => x.tool === s.tool)) continue;
    steps.push({ tool: s.tool as ToolName, purpose: s.purpose });
  }
  for (const t of [...REQUIRED_TOOLS].reverse()) {
    if (!steps.some((s) => s.tool === t)) {
      steps.unshift({ tool: t, purpose: t === "market_snapshot" ? "确认最新行情与时点" : "计算回撤与波动" });
      notes.push(`已补充必需的核验步骤：${TOOL_LABELS[t]}`);
    }
  }
  if (steps.length > 4) {
    notes.push(`计划超过 4 步，已截断为 4 步`);
    steps.splice(4);
  }
  const tags = new Set<string>(FOCUS_TAGS);
  return {
    intent: p.intent,
    outOfScope: p.outOfScope,
    outOfScopeReason: p.outOfScopeReason ?? null,
    focusTags: p.focusTags.filter((t): t is ResearchPlan["focusTags"][number] => tags.has(t)).slice(0, 4),
    steps,
    source: "llm",
    notes,
  };
}

export async function runResearchAgent(input: AgentInput, deps: AgentDeps): Promise<AgentResult> {
  const t0 = Date.now();
  const since = () => Date.now() - t0;
  let firstEventMs: number | null = null;
  const rawEmit = deps.emit ?? (() => {});
  const emit = (e: AgentEvent) => {
    if (firstEventMs === null) firstEventMs = since();
    rawEmit(e);
  };
  const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const question = input.question.trim().slice(0, AGENT_LIMITS.maxQuestionLength);
  if (!question) throw new AgentError("BAD_REQUEST", "请输入研究问题");
  if (!deps.llm) throw new AgentError("NOT_CONFIGURED", "未配置 LLM（LLM_API_KEY / LLM_BASE_URL / LLM_MODEL），不会生成任何 AI 研究结论。", "understand");

  const llm = deps.llm;
  const plannerModel = llm.plannerModel || llm.model;
  let llmCalls = 0;
  let llmLatency = 0;
  const callLog: LLMCallRecord[] = [];
  const timings: Omit<AgentTimings, "totalMs" | "firstEventMs"> = { dataMs: null, planMs: null, verifyMs: null, personalizeMs: null, respondLlmMs: null, guardsMs: null };
  const tools: ToolCallRecord[] = [];
  // 内部取消：用户取消或数据获取失败时，中止仍在进行的模型调用
  const inner = new AbortController();
  const onOuterAbort = () => inner.abort();
  deps.signal?.addEventListener("abort", onOuterAbort, { once: true });
  const checkCancel = (stage: AgentStage) => {
    if (deps.signal?.aborted) throw new AgentError("CANCELLED", "研究已取消", stage);
  };
  const stage = (s: AgentStage, status: "running" | "done" | "failed" | "skipped", detail?: string) =>
    emit({ type: "stage", stage: s, status, detail: detail ?? STAGE_LABELS[s] });
  const llmSummary = () => ({ model: llm.model, plannerModel, calls: llmCalls, latencyMs: llmLatency, callLog });
  const finalTimings = (): AgentTimings => ({ ...timings, totalMs: since(), firstEventMs: firstEventMs ?? 0 });

  /** 调用模型并解析 JSON；格式错误时最多修复一次。流式进度以真实字符计数上报。 */
  const callJson = async (messages: LLMMessage[], label: AgentStage, model: string, extraBody?: Record<string, unknown> | null): Promise<unknown> => {
    let msgs = messages;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (llmCalls >= AGENT_LIMITS.maxLLMCalls) throw new AgentError("LIMIT", "已达到本次研究的模型调用上限", label);
      checkCancel(label);
      llmCalls++;
      const res = await llm.complete({
        messages: msgs,
        json: true,
        signal: inner.signal,
        model,
        ...(extraBody !== undefined ? { extraBody } : {}),
        onProgress: (p) => emit({ type: "llm", stage: label, model, reasoningChars: p.reasoningChars, contentChars: p.contentChars, elapsedMs: p.elapsedMs }),
      });
      llmLatency += res.latencyMs;
      callLog.push({ stage: label, model: res.model, latencyMs: res.latencyMs, firstChunkMs: res.firstChunkMs, ...res.usage });
      try {
        return extractJson(res.content);
      } catch (e) {
        if (attempt === 1) throw e;
        msgs = [...messages, { role: "assistant", content: res.content.slice(0, 2000) }, repairMessage((e as Error).message)];
      }
    }
    throw new LLMError("MALFORMED", "模型输出无法解析");
  };

  const profileMin = minimalProfile(input.profile);
  const signals = input.profile ? deriveSignals(input.profile) : null;
  const pinned = getPinned(input.snapshotId, input.symbol);
  const live = !deps.provider.info.isDemo;
  const newsAvailable = live; // 资讯仅在扶摇模式可用

  const record = (call: ToolCallRecord) => {
    const i = tools.findIndex((t) => t.id === call.id);
    if (i >= 0) tools[i] = call;
    else tools.push(call);
    emit({ type: "tool", call });
  };
  const timed = async <T>(id: string, tool: string, label: string, fn: () => Promise<T>, done: (v: T) => string): Promise<T> => {
    record({ id, tool, label, status: "running", detail: "调用中…" });
    const s0 = Date.now();
    try {
      const v = await fn();
      record({ id, tool, label, status: "done", detail: done(v), ms: Date.now() - s0 });
      return v;
    } catch (e) {
      record({ id, tool, label, status: "failed", detail: e instanceof Error ? e.message : String(e), ms: Date.now() - s0 });
      throw e;
    }
  };

  try {
    /* ---------- A + B. Understand & Plan  ‖  C. Retrieve（两者互不依赖，并行执行） ---------- */
    stage("understand", "running", `理解问题，读取已授权的 ${profileMin.used.length} 个画像字段`);
    stage("retrieve", "running", pinned ? "复用对照画像的事实快照" : "并行调用金融数据工具");

    const planP = (async (): Promise<ResearchPlan> => {
      const p0 = Date.now();
      try {
        const raw = await callJson(
          plannerMessages({ question, symbol: input.symbol, liveData: live, newsAvailable, profileUsed: profileMin.used, signals, followUp: input.followUp }),
          "plan",
          plannerModel,
          llm.plannerExtraBody,
        );
        return normalizePlan(raw, newsAvailable);
      } catch (e) {
        if (e instanceof AgentError) throw e;
        if (e instanceof LLMError && (e.code === "UNAUTHORIZED" || e.code === "NOT_CONFIGURED" || e.code === "CANCELLED")) {
          throw new AgentError(e.code === "CANCELLED" && deps.signal?.aborted ? "CANCELLED" : e.code, e.message, "understand");
        }
        const code = e instanceof LLMError ? e.code : "MALFORMED";
        return fallbackPlan(question, newsAvailable, `模型规划失败（${code}），已使用默认研究计划`);
      } finally {
        timings.planMs = Date.now() - p0;
      }
    })();

    const dataP = (async (): Promise<{ fin: FinancialsSnapshot; snapshotId: string }> => {
      const d0 = Date.now();
      try {
        if (pinned) {
          for (const t of ["market_snapshot", "price_history", "fund_profile_valuation"] as ToolName[]) {
            record({ id: t, tool: t, label: TOOL_LABELS[t], status: "skipped", detail: `复用事实快照 ${pinned.id.split("-").slice(-2).join("-")}（与对照画像相同）` });
          }
          return { fin: pinned.fin, snapshotId: pinned.id };
        }
        const src = live ? "扶摇" : "演示数据集";
        // 三类工具并行；Provider 内的进行中请求共享保证同一资源只访问一次上游
        const [, , fin] = await Promise.all([
          timed("market_snapshot", "market_snapshot", TOOL_LABELS.market_snapshot, () => deps.provider.getSnapshot(input.symbol), (s) => `${src} · 最新价 ${s.last ?? "未知"} · ${s.asOfLabel}`),
          timed("price_history", "price_history", TOOL_LABELS.price_history, () => deps.provider.getHistory(input.symbol, "3Y"), (h) => `${src} · ${h.points.length} 个交易日`),
          timed(
            "fund_profile_valuation",
            "fund_profile_valuation",
            TOOL_LABELS.fund_profile_valuation,
            () => deps.provider.getFinancials(input.symbol),
            (f) => {
              const d = (f.degraded ?? []).filter((x) => x.capability !== "基金资讯");
              return d.length ? `部分不可用：${d.map((x) => `${x.capability}（${x.code}）`).join("、")}` : `${src} · ${f.facts.length} 项事实`;
            },
          ),
        ]);
        return { fin, snapshotId: putSnapshot(input.symbol, fin).id };
      } finally {
        timings.dataMs = Date.now() - d0;
      }
    })();
    // 避免未处理的拒绝；真正的错误在下面按顺序处理
    planP.catch(() => {});
    dataP.catch(() => {});

    let fin: FinancialsSnapshot;
    let snapshotId: string;
    try {
      ({ fin, snapshotId } = await dataP);
    } catch (e) {
      inner.abort(); // 数据失败时不再等待模型规划
      if (deps.signal?.aborted) throw new AgentError("CANCELLED", "研究已取消", "retrieve");
      const code = e instanceof ProviderError ? e.code : "UPSTREAM_ERROR";
      stage("retrieve", "failed", e instanceof Error ? e.message : String(e));
      throw new AgentError(code, e instanceof Error ? e.message : "数据获取失败", "retrieve");
    }
    stage("retrieve", "done", pinned ? "复用对照画像的事实快照，未重复调用" : `${tools.filter((t) => t.status === "done").length} 次并行工具调用（${live ? "扶摇真实接口" : "演示数据集"}）`);

    let plan: ResearchPlan;
    try {
      plan = await planP;
    } catch (e) {
      if (e instanceof AgentError && e.code !== "CANCELLED") stage("understand", "failed", e.message);
      throw e;
    }
    stage("understand", "done", plan.intent);
    emit({ type: "plan", plan });
    stage("plan", "done", `${plan.steps.length} 步研究计划${plan.source === "fallback" ? "（降级：默认计划）" : ""}${plannerModel !== llm.model ? ` · ${plannerModel}` : ""}`);
    if (newsAvailable && !pinned) {
      const newsFail = fin.degraded?.find((x) => x.capability === "基金资讯");
      const wanted = plan.steps.some((s) => s.tool === "fund_news");
      record({
        id: "fund_news",
        tool: "fund_news",
        label: TOOL_LABELS.fund_news,
        status: newsFail ? "failed" : wanted ? "done" : "skipped",
        detail: newsFail ? `${newsFail.code}：${newsFail.message}` : wanted ? `${fin.news?.length ?? 0} 篇资讯（外部不可信输入，仅作线索）` : "计划未使用资讯",
      });
    }
    checkCancel("verify");

    /* ---------------- D. Verify ---------------- */
    const v0 = Date.now();
    stage("verify", "running");
    const known = fin.facts.filter((f) => f.value !== null);
    const stale = fin.facts.filter((f) => f.status === "stale");
    if (!fin.facts.some((f) => f.id === "f-last" && f.value !== null)) {
      stage("verify", "failed", "缺少最新价，无法支撑研究结论");
      throw new AgentError("EMPTY", "关键行情数据缺失（最新价），不生成研究结论", "verify");
    }
    stage(
      "verify",
      "done",
      `${fin.facts.length} 项事实：${known.length} 项有值、${fin.facts.length - known.length} 项未知${stale.length ? `、${stale.length} 项可能过期` : ""}；${fin.evidence?.length ?? 0} 条证据`,
    );
    timings.verifyMs = Date.now() - v0;

    /* ---------------- E. Personalize（规则引擎，确定性） ---------------- */
    const p0 = Date.now();
    stage("personalize", "running");
    const research = new DemoResearchService(deps.provider).fromFinancials(fin, { symbol: input.symbol, question, profile: input.profile });
    stage(
      "personalize",
      "done",
      input.profile ? `命中 ${research.appliedRules.length} 条规则：${research.appliedRules.map((r) => r.ruleName).join("、") || "无"}` : "未使用画像（通用视角）",
    );
    timings.personalizeMs = Date.now() - p0;
    checkCancel("respond");

    const base = {
      runId,
      symbol: input.symbol,
      question,
      plan,
      research,
      snapshotId,
      profileFieldsUsed: profileMin.used,
      profileFieldsWithheld: profileMin.withheld,
      tools,
      createdAt: new Date().toISOString(),
    };
    const emptyVerification = { invalidEvidenceIds: [], unverifiedNumbers: [], complianceRemoved: [], restoredRisks: [], passed: true };

    if (plan.outOfScope) {
      stage("respond", "skipped", plan.outOfScopeReason ?? "问题超出投资研究范围");
      return { ...base, status: "out_of_scope", answer: null, verification: emptyVerification, llm: llmSummary(), timings: finalTimings(), error: null };
    }

    /* ---------------- F. Respond ---------------- */
    stage("respond", "running", `模型 ${llm.model} 生成结论`);
    const r0 = Date.now();
    try {
      const raw = await callJson(writerMessages({ question, plan, research, profileUsed: profileMin.used, news: fin.news ?? [], followUp: input.followUp }), "respond", llm.model);
      timings.respondLlmMs = Date.now() - r0;
      const g0 = Date.now();
      const parsed = answerSchema.safeParse(raw);
      if (!parsed.success) throw new LLMError("MALFORMED", "模型输出不符合研究结论结构");
      // 白名单：事实数值 + 用户问题、画像取值、证据标题、标的代码与文本型事实（如跟踪指数「沪深300」）中出现的数字
      const whitelist = buildNumberWhitelist(research.facts, [
        question,
        input.symbol,
        ...profileMin.used.map((f) => f.value),
        ...research.evidence.map((e) => e.title),
        ...research.facts.filter((f) => typeof f.value === "string").map((f) => String(f.value)),
      ]);
      const { answer, verification } = verifyAnswer(parsed.data, { facts: research.facts, evidence: research.evidence, ruleRisks: research.risks, numberWhitelist: whitelist });
      timings.guardsMs = Date.now() - g0;
      stage(
        "respond",
        "done",
        verification.passed
          ? "结论已通过证据与合规校验"
          : `已校验：${verification.invalidEvidenceIds.length} 个无效引用、${verification.unverifiedNumbers.length} 个未核验数值、${verification.complianceRemoved.length} 处合规删除`,
      );
      logEvent("agent.complete", { runId, llmCalls, totalMs: since(), invalidRefs: verification.invalidEvidenceIds.length, compliance: verification.complianceRemoved.length });
      return { ...base, status: "complete", answer, verification, llm: llmSummary(), timings: finalTimings(), error: null };
    } catch (e) {
      if (timings.respondLlmMs === null) timings.respondLlmMs = Date.now() - r0;
      if (e instanceof AgentError && e.code === "CANCELLED") throw e;
      if ((e instanceof LLMError && e.code === "CANCELLED") || deps.signal?.aborted) throw new AgentError("CANCELLED", "研究已取消", "respond");
      const code = e instanceof LLMError ? e.code : e instanceof AgentError ? e.code : "MALFORMED";
      const message = e instanceof Error ? e.message : "生成失败";
      stage("respond", "failed", message);
      logEvent("agent.respond_failed", { runId, code });
      // 不输出任何替代结论：只返回已核验的数据与规则视图，并明确告知失败
      return { ...base, status: "degraded", answer: null, verification: emptyVerification, llm: llmSummary(), timings: finalTimings(), error: { stage: "respond", code, message } };
    }
  } finally {
    deps.signal?.removeEventListener("abort", onOuterAbort);
  }
}
