"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  CircleDashed,
  Columns2,
  FileSearch,
  Fingerprint,
  Loader2,
  Lock,
  MinusCircle,
  Send,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InvestorProfile, LensId } from "@/types/profile";
import type { AgentEvent, AgentResult, AgentStage, AnswerFinding, ResearchPlan, ToolCallRecord } from "@/lib/agent/schema";
import { STAGE_LABELS } from "@/lib/agent/schema";
import { runAgent, useStatus } from "@/lib/client/agent";
import { PERSONAS } from "@/lib/profile/personas";
import { Badge, SourceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeverityMeter } from "@/components/ui/primitives";
import { StateView } from "@/components/ui/states";
import { cn } from "@/lib/cn";

const STAGES: AgentStage[] = ["understand", "plan", "retrieve", "verify", "personalize", "respond"];
/** 服务端限流、每日预算与并发限制（HTTP 429）。 */
const LIMIT_CODES = new Set(["RATE_LIMITED", "BUDGET_EXHAUSTED", "TOO_MANY_CONCURRENT"]);

const PRESETS = [
  "我想长期研究沪深300 ETF，目前有哪些最值得关注的风险和证据？",
  "如果一年内要用这笔钱，这只 ETF 的回撤意味着什么？",
  "现在的估值处在什么位置？数据够不够支撑判断？",
  "最近有哪些资讯值得注意？它们能说明什么、不能说明什么？",
];

type StageState = { status: "pending" | "running" | "done" | "failed" | "skipped"; detail?: string };

interface RunState {
  running: boolean;
  stages: Record<AgentStage, StageState>;
  tools: ToolCallRecord[];
  plan: ResearchPlan | null;
  result: AgentResult | null;
  error: { code: string; message: string; stage?: AgentStage } | null;
  lensLabel: string;
  /** 模型流式生成的真实进度（字符计数，不含推理内容）。 */
  llm: { stage: AgentStage; model: string; reasoningChars: number; contentChars: number } | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const initialStages = (): Record<AgentStage, StageState> =>
  Object.fromEntries(STAGES.map((s) => [s, { status: "pending" }])) as Record<AgentStage, StageState>;

const emptyRun = (lensLabel: string): RunState => ({
  running: false,
  stages: initialStages(),
  tools: [],
  plan: null,
  result: null,
  error: null,
  lensLabel,
  llm: null,
  startedAt: null,
  finishedAt: null,
});

export function AgentPanel({
  symbol,
  profile,
  lens,
  lensLabel,
  onEvidence,
}: {
  symbol: string;
  profile: InvestorProfile | null;
  lens: LensId | null;
  lensLabel: string;
  onEvidence: (id: string) => void;
}) {
  const status = useStatus();
  const [question, setQuestion] = useState("");
  const [run, setRun] = useState<RunState>(() => emptyRun(lensLabel));
  const [compare, setCompare] = useState<{ A: RunState; B: RunState } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 运行令牌：取消或开始新研究后，旧运行的迟到事件一律忽略
  const runToken = useRef(0);
  const lastSnapshot = useRef<string | null>(null);

  const execute = useCallback(
    async (q: string, p: InvestorProfile | null, label: string, set: (fn: (s: RunState) => RunState) => void, opts: { snapshotId?: string | null; followUp?: { question: string; summary: string } | null } = {}) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const token = ++runToken.current;
      const guarded = (fn: (s: RunState) => RunState) => {
        if (runToken.current === token) set(fn);
      };
      set(() => ({ ...emptyRun(label), running: true, startedAt: Date.now() }));
      let final: AgentResult | null = null;
      await runAgent(
        { symbol, question: q, profile: p, snapshotId: opts.snapshotId ?? null, followUp: opts.followUp ?? null },
        (e: AgentEvent) => {
          if (e.type === "stage") guarded((s) => ({ ...s, stages: { ...s.stages, [e.stage]: { status: e.status, detail: e.detail } } }));
          else if (e.type === "tool") guarded((s) => ({ ...s, tools: [...s.tools.filter((t) => t.id !== e.call.id), e.call] }));
          else if (e.type === "plan") guarded((s) => ({ ...s, plan: e.plan }));
          else if (e.type === "llm") guarded((s) => ({ ...s, llm: { stage: e.stage, model: e.model, reasoningChars: e.reasoningChars, contentChars: e.contentChars } }));
          else if (e.type === "result") {
            if (runToken.current !== token) return;
            final = e.result;
            lastSnapshot.current = e.result.snapshotId;
            guarded((s) => ({ ...s, result: e.result }));
          } else if (e.type === "error") guarded((s) => ({ ...s, error: { code: e.code, message: e.message, stage: e.stage } }));
        },
        ctrl.signal,
      );
      guarded((s) => ({ ...s, running: false, finishedAt: Date.now() }));
      return (runToken.current === token ? final : null) as AgentResult | null;
    },
    [symbol],
  );

  const submit = (q: string, followUp?: { question: string; summary: string } | null) => {
    if (!q.trim() || run.running) return;
    setQuestion(q);
    setCompare(null);
    void execute(q, profile, lensLabel, setRun, { snapshotId: lastSnapshot.current, followUp });
  };

  const runCompare = async () => {
    const q = question.trim() || PRESETS[0];
    setQuestion(q);
    setRun(emptyRun(lensLabel));
    let A = emptyRun("画像 A");
    let B = emptyRun("画像 B");
    setCompare({ A, B });
    const a = await execute(q, PERSONAS.A, "画像 A", (fn) => setCompare((c) => (c ? { ...c, A: (A = fn(c.A)) } : c)));
    if (!a) return;
    await execute(q, PERSONAS.B, "画像 B", (fn) => setCompare((c) => (c ? { ...c, B: (B = fn(c.B)) } : c)), { snapshotId: a.snapshotId });
  };

  const cancel = () => {
    abortRef.current?.abort();
    runToken.current++;
    const stop = (s: RunState): RunState => (s.running ? { ...s, running: false, error: { code: "CANCELLED", message: "研究已取消，未生成任何结论。" } } : s);
    setRun(stop);
    setCompare((c) => (c ? { A: stop(c.A), B: stop(c.B) } : c));
  };
  const busy = run.running || !!(compare && (compare.A.running || compare.B.running));

  if (status && !status.llmConfigured) {
    return (
      <StateView
        kind="unauthorized"
        title="AI 研究未启用：服务端没有配置大模型"
        description={
          <>
            InvestLens 不会在没有真实模型的情况下生成任何「AI 结论」。在项目根目录创建 <code className="num text-fg-2">.env.local</code>，填写
            <code className="num mx-1 text-fg-2">LLM_API_KEY</code>、<code className="num mx-1 text-fg-2">LLM_BASE_URL</code>（OpenAI 兼容地址）、
            <code className="num mx-1 text-fg-2">LLM_MODEL</code> 后重启服务。下方研究模块仍由确定性规则基于{status.dataMode === "fuyao" ? "真实行情" : "演示数据"}生成。
          </>
        }
        code="LLM_NOT_CONFIGURED"
        compact
      />
    );
  }

  return (
    <div className="space-y-4 px-5 pb-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="agent-q" className="sr-only">
          研究问题
        </label>
        <input
          id="agent-q"
          value={question}
          maxLength={300}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="用自然语言提问，例如：我想长期研究沪深300 ETF，有哪些最值得关注的风险？"
          className="h-10 min-w-0 flex-1 rounded-md border border-line-soft bg-bg-deep/60 px-3 text-[13px] placeholder:text-faint focus:border-brand/50 focus:outline-none"
          disabled={busy}
        />
        <div className="flex gap-2">
          {busy ? (
            // key 不同：避免 React 复用同一个 <button>，否则点击取消后该元素会在默认动作执行前变成 submit 按钮并重新提交表单
            <Button
              key="cancel"
              type="button"
              variant="danger"
              onClick={(e) => {
                e.preventDefault();
                cancel();
              }}
            >
              <Square className="h-3.5 w-3.5" /> 取消
            </Button>
          ) : (
            <Button key="submit" type="submit" variant="primary" disabled={!question.trim()}>
              <Send className="h-3.5 w-3.5" /> 开始研究
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={runCompare} disabled={busy} title="同一问题、同一份事实快照，分别用虚构画像 A 和 B 研究">
            <Columns2 className="h-3.5 w-3.5" /> A/B 对比
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => submit(p)}
            className="rounded-full border border-line-soft px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:border-brand/40 hover:text-fg disabled:opacity-40"
          >
            {p}
          </button>
        ))}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
        <span className="inline-flex items-center gap-1">
          <Bot className="h-3.5 w-3.5 text-brand" /> {status?.llmModel ? `模型：${status.llmModel}` : "模型状态读取中"}
        </span>
        <SourceBadge isDemo={status ? status.dataMode === "demo" : null} />
        <span>当前视角：{lensLabel}{lens === null ? "（未使用画像）" : ""}</span>
      </p>

      {compare ? (
        <CompareRuns a={compare.A} b={compare.B} onEvidence={onEvidence} />
      ) : (
        (run.running || run.result || run.error) && (
          <RunView
            run={run}
            onEvidence={onEvidence}
            onFollowUp={(q) => run.result && submit(q, { question: run.result.question, summary: run.result.answer?.summary ?? "" })}
          />
        )
      )}
    </div>
  );
}

/* ---------------- 进度 ---------------- */

function StageIcon({ s }: { s: StageState["status"] }) {
  if (s === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />;
  if (s === "done") return <Check className="h-3.5 w-3.5 text-teal" />;
  if (s === "failed") return <X className="h-3.5 w-3.5 text-danger" />;
  if (s === "skipped") return <MinusCircle className="h-3.5 w-3.5 text-faint" />;
  return <CircleDashed className="h-3.5 w-3.5 text-line" />;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const fmtSec = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
const fmtChars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function Progress({ run }: { run: RunState }) {
  const now = useNow(run.running);
  const elapsed = run.startedAt ? (run.finishedAt ?? now) - run.startedAt : 0;
  const llmStage = (st: AgentStage) => run.llm && (run.llm.stage === st || (st === "understand" && run.llm.stage === "plan"));
  return (
    <div className="space-y-2">
      {run.startedAt && (
        <div className="flex items-center justify-between text-[11.5px] text-faint">
          <span>{run.running ? "研究进行中（真实耗时）" : "本次研究耗时"}</span>
          <span className="num text-fg-2" data-testid="agent-elapsed">
            {fmtSec(elapsed)}
          </span>
        </div>
      )}
    <ol className="space-y-1.5" aria-label="研究进度" aria-live="polite">
      {STAGES.map((st, i) => {
        const s = run.stages[st];
        return (
          <li key={st}>
            <div className="flex items-start gap-2.5 text-[12.5px]">
              <span className="mt-0.5">
                <StageIcon s={s.status} />
              </span>
              <span className="num w-4 shrink-0 text-[10.5px] text-faint">{i + 1}</span>
              <span className={cn("shrink-0", s.status === "pending" ? "text-faint" : "text-fg-2")}>{STAGE_LABELS[st]}</span>
              {s.detail && s.status !== "pending" && <span className="min-w-0 truncate text-muted">· {s.detail}</span>}
            </div>
            {s.status === "running" && llmStage(st) && run.llm && (
              <p className="mt-1 ml-[46px] text-[11.5px] text-muted" data-testid="llm-progress">
                <span className="num text-faint">{run.llm.model}</span> · {run.llm.contentChars > 0
                  ? `正在输出 ${fmtChars(run.llm.contentChars)} 字`
                  : run.llm.reasoningChars > 0
                    ? `模型推理中 · 已接收 ${fmtChars(run.llm.reasoningChars)} 字`
                    : "等待模型首个响应"}
                <span className="text-faint">（真实流式计数，推理内容不展示）</span>
              </p>
            )}
            {st === "retrieve" && run.tools.length > 0 && (
              <ul className="mt-1 mb-1 ml-[46px] space-y-1">
                {run.tools.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-[11.5px]">
                    <StageIcon s={t.status} />
                    <span className="num shrink-0 text-faint">{t.tool}</span>
                    <span className="min-w-0 flex-1 truncate text-muted" title={t.detail}>
                      {t.detail}
                    </span>
                    {t.ms !== undefined && <span className="num shrink-0 text-faint">{t.ms}ms</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
    </div>
  );
}

/* ---------------- 结果 ---------------- */

const KIND: Record<AnswerFinding["kind"], { label: string; tone: "teal" | "brand" | "warn" }> = {
  fact: { label: "已验证事实", tone: "teal" },
  inference: { label: "基于事实的推断", tone: "brand" },
  unverified: { label: "未验证", tone: "warn" },
};

function EvidenceChips({ ids, onEvidence }: { ids: string[]; onEvidence: (id: string) => void }) {
  if (!ids.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onEvidence(id)}
          className="inline-flex items-center gap-0.5 rounded border border-line-soft px-1 py-px font-mono text-[10.5px] text-muted transition-colors hover:border-brand/50 hover:text-fg"
          title="在证据区中查看"
        >
          <FileSearch className="h-2.5 w-2.5" />
          {id}
        </button>
      ))}
    </span>
  );
}

function RunView({ run, onEvidence, onFollowUp }: { run: RunState; onEvidence: (id: string) => void; onFollowUp?: (q: string) => void }) {
  const r = run.result;
  const [showPlan, setShowPlan] = useState(false);
  return (
    <div className="space-y-4 rounded-xl border border-line-soft bg-surface-2/40 p-4">
      <Progress run={run} />

      {run.error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2.5 text-[12.5px] text-fg-2">
          <span className="font-medium text-[#FF9AA2]">{LIMIT_CODES.has(run.error.code) ? "已达到使用限制" : "研究未完成"}</span>
          <span className="num ml-2 text-[11px] text-faint">{run.error.code}</span>
          <p className="mt-1 text-muted">{run.error.message}</p>
          <p className="mt-1 text-[11.5px] text-faint">未生成任何替代结论。</p>
        </div>
      )}

      <AnimatePresence>
        {r && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="brand">{run.lensLabel}</Badge>
              <SourceBadge isDemo={r.research.dataSource?.isDemo ?? true} />
              {r.llm && <Badge tone="neutral">LLM · {r.llm.model} · {r.llm.calls} 次调用</Badge>}
              <Badge tone="neutral">
                <Fingerprint className="h-3 w-3" /> 事实快照 {r.research.factFingerprint}
              </Badge>
              {r.answer &&
                (r.verification.passed ? (
                  <Badge tone="teal">
                    <ShieldCheck className="h-3 w-3" /> 证据与合规校验通过
                  </Badge>
                ) : (
                  <Badge tone="warn">
                    <AlertTriangle className="h-3 w-3" /> 已自动校正 {r.verification.invalidEvidenceIds.length + r.verification.unverifiedNumbers.length + r.verification.complianceRemoved.length} 处
                  </Badge>
                ))}
            </div>

            {r.status === "out_of_scope" && (
              <p className="rounded-lg border border-info/25 bg-info/[0.07] px-3 py-2 text-[13px] text-fg-2">
                这个问题超出了投资研究范围：{r.plan.outOfScopeReason ?? "无法作为研究任务执行"}。InvestLens 不执行交易，也不替你做投资决定。
              </p>
            )}
            {r.status === "degraded" && r.error && (
              <p className="rounded-lg border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[12.5px] text-fg-2">
                数据已获取并核验，但模型生成结论失败（{r.error.code}）：{r.error.message}。不会显示任何未经生成与校验的结论，下方研究模块为规则视图。
              </p>
            )}

            {r.answer && (
              <>
                <p className="text-[14px] leading-relaxed text-fg">{r.answer.summary}</p>

                <div>
                  <div className="kicker mb-2">关键结论</div>
                  <ul className="space-y-2">
                    {r.answer.findings.map((f) => (
                      <li key={f.id} className="text-[13px] leading-relaxed text-fg-2">
                        <Badge tone={KIND[f.kind].tone} className="mr-1.5 align-middle">
                          {KIND[f.kind].label}
                        </Badge>
                        {f.statement}
                        <EvidenceChips ids={f.evidenceIds} onEvidence={onEvidence} />
                        {f.issues.length > 0 && <span className="mt-0.5 block text-[11px] text-warn">校验：{f.issues.join("；")}</span>}
                      </li>
                    ))}
                  </ul>
                </div>

                {r.answer.risks.length > 0 && (
                  <div>
                    <div className="kicker mb-2">风险（顺序与等级由规则引擎决定）</div>
                    <ul className="space-y-2">
                      {r.answer.risks.map((x) => (
                        <li key={x.riskId} className="rounded-lg border border-line-soft bg-bg-deep/30 px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold">{x.title}</span>
                            <ObjectiveChip level={x.objectiveSeverity} />
                            <SeverityMeter level={x.personalRelevance} />
                            {x.source === "rules" && <Badge tone="neutral">规则补回</Badge>}
                          </div>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                            {x.explanation}
                            <EvidenceChips ids={x.evidenceIds} onEvidence={onEvidence} />
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  {r.answer.uncertainties.length > 0 && (
                    <div>
                      <div className="kicker mb-1.5">不确定性</div>
                      <ul className="space-y-1 text-[12.5px] leading-relaxed text-fg-2">
                        {r.answer.uncertainties.map((u) => (
                          <li key={u}>· {u}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.answer.informationGaps.length > 0 && (
                    <div>
                      <div className="kicker mb-1.5">信息缺口</div>
                      <ul className="space-y-1 text-[12.5px] leading-relaxed text-fg-2">
                        {r.answer.informationGaps.map((u) => (
                          <li key={u}>· {u}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {r.answer.followUps.length > 0 && onFollowUp && (
                  <div>
                    <div className="kicker mb-1.5">继续追问</div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.answer.followUps.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => onFollowUp(q)}
                          className="rounded-full border border-brand/30 bg-brand-soft/40 px-3 py-1.5 text-left text-[12px] text-fg-2 transition-colors hover:border-brand/60 hover:text-fg"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-3 text-[11.5px]">
              <Lock className="h-3 w-3 text-teal" />
              <span className="text-muted">发送给模型的画像字段：</span>
              {r.profileFieldsUsed.length ? (
                r.profileFieldsUsed.map((f) => (
                  <span key={f.field} className="rounded border border-line-soft px-1.5 py-0.5 text-fg-2">
                    {f.label}：{f.value}
                  </span>
                ))
              ) : (
                <span className="text-faint">无（通用视角）</span>
              )}
              {r.profileFieldsWithheld.length > 0 && <span className="text-faint">· 未发送：{r.profileFieldsWithheld.join("、")}</span>}
            </div>

            <button type="button" onClick={() => setShowPlan((v) => !v)} aria-expanded={showPlan} className="inline-flex items-center gap-1 text-[12px] text-faint hover:text-fg-2">
              研究计划与校验明细 <ChevronDown className={cn("h-3 w-3 transition-transform", showPlan && "rotate-180")} />
            </button>
            {showPlan && (
              <div className="space-y-2 rounded-lg border border-line-soft bg-bg-deep/30 p-3 text-[12px] text-fg-2">
                <p>
                  <span className="text-muted">意图：</span>
                  {r.plan.intent}
                  {r.plan.source === "fallback" && <Badge tone="warn" className="ml-2">默认计划（模型规划失败）</Badge>}
                </p>
                <ol className="space-y-0.5">
                  {r.plan.steps.map((s, i) => (
                    <li key={s.tool}>
                      {i + 1}. <span className="num text-faint">{s.tool}</span> — {s.purpose}
                    </li>
                  ))}
                </ol>
                {r.plan.notes.map((n) => (
                  <p key={n} className="text-faint">· {n}</p>
                ))}
                <p className="text-muted">
                  无效证据引用：{r.verification.invalidEvidenceIds.join("、") || "无"} · 未核验数值：{r.verification.unverifiedNumbers.join("、") || "无"} · 合规删除：
                  {r.verification.complianceRemoved.length} · 补回风险：{r.verification.restoredRisks.join("、") || "无"}
                </p>
                {r.timings && (
                  <p className="num text-faint" data-testid="agent-timings">
                    阶段耗时：数据 {r.timings.dataMs === null ? "—" : fmtSec(r.timings.dataMs)} ‖ 规划 {r.timings.planMs === null ? "—" : fmtSec(r.timings.planMs)}（并行）→ 校验{" "}
                    {r.timings.verifyMs === null ? "—" : `${r.timings.verifyMs}ms`} → 个性化 {r.timings.personalizeMs === null ? "—" : `${r.timings.personalizeMs}ms`} → 生成{" "}
                    {r.timings.respondLlmMs === null ? "—" : fmtSec(r.timings.respondLlmMs)} → 护栏 {r.timings.guardsMs === null ? "—" : `${r.timings.guardsMs}ms`} · 总计 {fmtSec(r.timings.totalMs)}
                    {r.llm?.callLog?.length ? ` · tokens 输入 ${r.llm.callLog.reduce((s, c) => s + (c.promptTokens ?? 0), 0)} / 输出 ${r.llm.callLog.reduce((s, c) => s + (c.completionTokens ?? 0), 0)}` : ""}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ObjectiveChip({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-line-soft px-1.5 py-0.5 text-[10.5px] text-muted" title="客观严重程度：只由市场事实决定，所有画像相同">
      客观
      <b className={cn("font-medium", level === 3 ? "text-risk" : level === 2 ? "text-warn" : "text-fg-2")}>{level === 3 ? "高" : level === 2 ? "中" : "低"}</b>
    </span>
  );
}

function CompareRuns({ a, b, onEvidence }: { a: RunState; b: RunState; onEvidence: (id: string) => void }) {
  const fa = a.result?.research.factFingerprint;
  const fb = b.result?.research.factFingerprint;
  return (
    <div className="space-y-3">
      {fa && fb && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-teal/25 bg-teal-soft/50 px-3 py-2 text-[12px] text-fg-2" data-testid="ai-compare-fingerprint">
          <Fingerprint className="h-3.5 w-3.5 text-teal" />
          两次研究使用同一事实快照：<span className="num text-fg">{a.result?.snapshotId === b.result?.snapshotId ? "是" : "否"}</span>· 指纹
          <span className="num text-fg">{fa}</span> / <span className="num text-fg">{fb}</span>
          {fa === fb ? <span className="text-teal">一致</span> : <span className="text-danger">不一致</span>}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <RunView run={a} onEvidence={onEvidence} />
        <RunView run={b} onEvidence={onEvidence} />
      </div>
    </div>
  );
}
