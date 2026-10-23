/**
 * 模型对比基准（npm run bench:models）：真实扶摇数据 + 真实 DeepSeek。
 * 同一问题、同一份事实快照、画像 A / B，比较不同模型与思考模式配置的
 * 耗时、完整性、证据准确率、数值一致性、合规与 token 成本。结果写入 docs/live-verification/。
 */
import { describe, expect, it } from "vitest";
import { loadEnvLocal, saveRecord } from "./env";

loadEnvLocal();

const hasCreds = !!(process.env.FUYAO_API_KEY && process.env.LLM_API_KEY && process.env.LLM_BASE_URL);

/** DeepSeek 官方定价（元 / 百万 tokens，2026-10-22 自 api-docs.deepseek.com/zh-cn/quick_start/pricing 读取）。输入按缓存未命中计（上限估计）。 */
const PRICE: Record<string, { inPeak: number; inOff: number; outPeak: number; outOff: number }> = {
  "deepseek-flash": { inPeak: 2, inOff: 1, outPeak: 8, outOff: 4 },
  "deepseek-v4-pro": { inPeak: 9, inOff: 4.5, outPeak: 27, outOff: 13.5 },
};

interface Cfg {
  id: string;
  label: string;
  model: string;
  plannerModel?: string;
  extraBody?: Record<string, unknown> | null;
  plannerExtraBody?: Record<string, unknown> | null;
}

const CONFIGS: Cfg[] = [
  { id: "pro-high", label: "v4-pro · 思考（默认 high）", model: "deepseek-v4-pro" },
  { id: "pro-low", label: "v4-pro · 思考 low", model: "deepseek-v4-pro", extraBody: { reasoning_effort: "low" } },
  { id: "flash-high", label: "flash · 思考（默认 high）", model: "deepseek-flash" },
  { id: "flash-low", label: "flash · 思考 low", model: "deepseek-flash", extraBody: { reasoning_effort: "low" } },
  { id: "flash-off", label: "flash · 关闭思考", model: "deepseek-flash", extraBody: { thinking: { type: "disabled" } } },
];

const QUESTION = "我想长期研究沪深300 ETF，目前有哪些最值得关注的风险和证据？";

describe.skipIf(!hasCreds)("模型对比基准（真实数据 + 真实 LLM）", () => {
  it("同问题、同快照、画像 A / B × 5 种配置", async () => {
    const { FuyaoMarketDataProvider, clearFuyaoCache } = await import("@/lib/providers/fuyao-provider");
    const { OpenAICompatibleProvider } = await import("@/lib/llm/provider");
    const { runResearchAgent } = await import("@/lib/agent/research-agent");
    const { putSnapshot } = await import("@/lib/agent/snapshot-store");
    const { extractNumbers } = await import("@/lib/agent/guards");
    const { PERSONA_A, PERSONA_B } = await import("@/lib/profile/personas");
    const { factFingerprint } = await import("@/lib/personalization/engine");

    // 冷启动数据获取耗时（独立测量一次），之后所有配置复用同一事实快照
    clearFuyaoCache();
    const provider = new FuyaoMarketDataProvider();
    const d0 = Date.now();
    const fin = await provider.getFinancials("510300.SH");
    const coldDataMs = Date.now() - d0;
    const snap = putSnapshot("510300.SH", fin);

    const peak = (() => {
      const now = new Date(Date.now() + 8 * 3600_000); // 北京时间
      const day = now.getUTCDay();
      const h = now.getUTCHours();
      return day >= 1 && day <= 5 && ((h >= 9 && h < 12) || (h >= 14 && h < 18));
    })();

    const rows: Record<string, unknown>[] = [];
    for (const cfg of CONFIGS) {
      const llm = new OpenAICompatibleProvider({
        apiKey: process.env.LLM_API_KEY!,
        baseUrl: process.env.LLM_BASE_URL!.replace(/\/+$/, ""),
        model: cfg.model,
        plannerModel: cfg.plannerModel ?? null,
        timeoutMs: 150_000,
        maxTokens: 8000,
        jsonMode: true,
        stream: true,
        extraBody: cfg.extraBody ?? null,
        plannerExtraBody: cfg.plannerExtraBody ?? null,
      });
      for (const [pid, profile] of [["A", PERSONA_A], ["B", PERSONA_B]] as const) {
        const start = Date.now();
        let firstProgressMs: number | null = null;
        let firstStageDoneMs: number | null = null;
        let error: string | null = null;
        let r: Awaited<ReturnType<typeof runResearchAgent>> | null = null;
        try {
          r = await runResearchAgent(
            { symbol: "510300.SH", question: QUESTION, profile, snapshotId: snap.id },
            {
              provider,
              llm,
              emit: (e) => {
                if (e.type === "llm" && firstProgressMs === null) firstProgressMs = Date.now() - start;
                if (e.type === "stage" && e.status === "done" && firstStageDoneMs === null) firstStageDoneMs = Date.now() - start;
              },
            },
          );
        } catch (e) {
          error = e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e);
        }
        const a = r?.answer ?? null;
        const cited = a ? [...a.findings.flatMap((f) => f.evidenceIds), ...a.risks.flatMap((x) => x.evidenceIds)] : [];
        const invalid = r?.verification.invalidEvidenceIds.length ?? 0;
        const numbersChecked = a ? [a.summary, ...a.findings.map((f) => f.statement), ...a.risks.map((x) => x.explanation)].flatMap(extractNumbers).length : 0;
        const completeness = a
          ? [r!.status === "complete", r!.plan.source === "llm", a.findings.length >= 3, a.risks.length >= 3, a.uncertainties.length >= 1, a.informationGaps.length >= 1, a.followUps.length >= 2].filter(Boolean).length / 7
          : 0;
        const tok = (r?.llm?.callLog ?? []).reduce(
          (s, c) => ({ prompt: s.prompt + (c.promptTokens ?? 0), completion: s.completion + (c.completionTokens ?? 0), reasoning: s.reasoning + (c.reasoningTokens ?? 0) }),
          { prompt: 0, completion: 0, reasoning: 0 },
        );
        const cost = (r?.llm?.callLog ?? []).reduce((s, c) => {
          const p = PRICE[c.model] ?? PRICE[cfg.model];
          const pin = peak ? p.inPeak : p.inOff;
          const pout = peak ? p.outPeak : p.outOff;
          return s + ((c.promptTokens ?? 0) * pin + (c.completionTokens ?? 0) * pout) / 1e6;
        }, 0);
        rows.push({
          config: cfg.id,
          label: cfg.label,
          persona: pid,
          status: r?.status ?? "error",
          error: error ?? (r?.error ? `${r.error.stage}/${r.error.code}: ${r.error.message}` : null),
          totalMs: Date.now() - start,
          firstStageDoneMs,
          firstProgressMs,
          planMs: r?.timings?.planMs ?? null,
          respondLlmMs: r?.timings?.respondLlmMs ?? null,
          guardsMs: r?.timings?.guardsMs ?? null,
          llmCalls: r?.llm?.calls ?? 0,
          planSource: r?.plan.source ?? null,
          topModule: r?.research.modules[0]?.title ?? null,
          factFingerprint: r?.research.factFingerprint ?? null,
          completeness: Math.round(completeness * 100),
          findings: a?.findings.length ?? 0,
          factFindings: a?.findings.filter((f) => f.kind === "fact").length ?? 0,
          unverifiedFindings: a?.findings.filter((f) => f.kind === "unverified").length ?? 0,
          citedEvidence: cited.length,
          invalidEvidence: invalid,
          evidenceAccuracy: cited.length + invalid ? Math.round((cited.length / (cited.length + invalid)) * 100) : null,
          numbersChecked,
          unverifiedNumbers: r?.verification.unverifiedNumbers ?? [],
          complianceRemoved: r?.verification.complianceRemoved.length ?? 0,
          restoredRisks: r?.verification.restoredRisks ?? [],
          tokens: tok,
          costCNY: Math.round(cost * 10000) / 10000,
          summary: a?.summary ?? null,
        });
        // 进度输出（便于长时间运行时观察）
        console.log(`[bench] ${cfg.id} ${pid} ${r?.status ?? "error"} ${Math.round((Date.now() - start) / 1000)}s`);
      }
    }

    const fps = new Set(rows.map((x) => x.factFingerprint).filter(Boolean));
    saveRecord(`model-benchmark-${new Date().toISOString().slice(0, 10)}.json`, {
      kind: "real-benchmark",
      at: new Date().toISOString(),
      pricingPeriod: peak ? "高峰时段" : "空闲时段",
      pricingSource: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing（2026-10-22 读取；输入按缓存未命中计）",
      question: QUESTION,
      snapshotId: snap.id,
      factFingerprint: factFingerprint(fin.facts),
      coldDataMs,
      allRunsSameFacts: fps.size === 1,
      rows,
    });
    expect(fps.size).toBe(1);
  }, 1_800_000);
});
