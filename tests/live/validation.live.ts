/**
 * 产品价值对比实验（npm run validate:product）：真实扶摇数据 + 真实 LLM。
 * 条件 G：不使用画像的研究助手（同一 Agent，profile = null）
 * 条件 P：使用 Genesis 画像的 InvestLens（虚构画像 A / B）
 * 同一问题、同一事实快照、同一模型。评价指标由开发者预先定义并自动计算 —— 不是真实用户研究。
 */
import { describe, expect, it } from "vitest";
import { loadEnvLocal, saveRecord } from "./env";

loadEnvLocal();
const hasCreds = !!(process.env.FUYAO_API_KEY && process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL);

const QUESTIONS = ["我想长期研究沪深300 ETF，目前有哪些最值得关注的风险和证据？", "这只 ETF 现在值得关注吗？我应该先看什么？"];

/** 每个虚构画像的「实际研究需求」：由画像约束预先推导（实验前定义，不依据输出调整）。 */
const NEEDS = {
  A: {
    tags: ["liquidity", "sequence", "drawdown", "capacity", "volatility"],
    criticalRisks: ["r-timing", "r-drawdown"],
    topRisk: "r-timing",
    profileTerms: ["1 年以内", "1年以内", "大额支出", "很可能需要大部分", "暂时没有", "应急储备", "5% – 10%", "5%–10%", "5%-10%", "12 个月", "12个月", "用钱"],
  },
  B: {
    tags: ["valuation", "cost", "behavior", "long", "tracking"],
    criticalRisks: ["r-valuation", "r-tracking", "r-behavior"],
    topRisk: "r-valuation",
    profileTerms: ["10 年以上", "10年以上", "养老", "独立存放", "应急储备", "长期", "20% – 35%", "20%–35%", "按计划持有"],
  },
} as const;

describe.skipIf(!hasCreds)("产品价值对比实验", () => {
  it("通用助手 vs 画像化研究（A / B），同一事实快照", async () => {
    const { FuyaoMarketDataProvider } = await import("@/lib/providers/fuyao-provider");
    const { getLLMProvider } = await import("@/lib/llm/provider");
    const { runResearchAgent } = await import("@/lib/agent/research-agent");
    const { putSnapshot } = await import("@/lib/agent/snapshot-store");
    const { MODULES } = await import("@/lib/demo-data/research-content");
    const { PERSONAS } = await import("@/lib/profile/personas");

    const provider = new FuyaoMarketDataProvider();
    const fin = await provider.getFinancials("510300.SH");
    const snap = putSnapshot("510300.SH", fin);
    const llm = getLLMProvider()!;
    const tagsOf = new Map(MODULES.map((m) => [m.title, m.tags as readonly string[]]));

    type Run = Awaited<ReturnType<typeof runResearchAgent>>;
    const evaluate = (r: Run, persona: "A" | "B") => {
      const need = NEEDS[persona];
      const a = r.answer;
      const top3Modules = r.research.modules.slice(0, 3).map((m) => m.title);
      const moduleRelevance = top3Modules.filter((t) => (tagsOf.get(t) ?? []).some((x) => (need.tags as readonly string[]).includes(x))).length / 3;
      const risks = a?.risks ?? [];
      const top3Risks = risks.slice(0, 3).map((x) => x.riskId);
      const riskRelevance = top3Risks.filter((id) => (need.criticalRisks as readonly string[]).includes(id)).length / 3;
      const topRiskPos = risks.findIndex((x) => x.riskId === need.topRisk);
      const personalExplanations = risks.filter((x) => need.profileTerms.some((t) => x.explanation.includes(t))).length;
      const objectiveHigh = r.research.risks.filter((x) => x.objectiveSeverity >= 2).map((x) => x.id);
      const negativeCovered = objectiveHigh.every((id) => risks.some((x) => x.riskId === id));
      return {
        status: r.status,
        top3Modules,
        moduleRelevance: Math.round(moduleRelevance * 100),
        top3Risks,
        riskRelevance: Math.round(riskRelevance * 100),
        criticalRiskPosition: topRiskPos < 0 ? null : topRiskPos + 1,
        personalExplanationRate: risks.length ? Math.round((personalExplanations / risks.length) * 100) : 0,
        negativeFactsCovered: negativeCovered,
        objectiveHighRisks: objectiveHigh,
        evidenceValid: r.verification.invalidEvidenceIds.length === 0,
        unverifiedNumbers: r.verification.unverifiedNumbers,
        complianceRemoved: r.verification.complianceRemoved.length,
        totalMs: r.timings?.totalMs ?? null,
        summary: a?.summary ?? null,
      };
    };

    const results: Record<string, unknown>[] = [];
    for (const question of QUESTIONS) {
      const g = await runResearchAgent({ symbol: "510300.SH", question, profile: null, snapshotId: snap.id }, { provider, llm });
      const pa = await runResearchAgent({ symbol: "510300.SH", question, profile: PERSONAS.A, snapshotId: snap.id }, { provider, llm });
      const pb = await runResearchAgent({ symbol: "510300.SH", question, profile: PERSONAS.B, snapshotId: snap.id }, { provider, llm });
      results.push({
        question,
        sameFacts: JSON.stringify(g.research.facts) === JSON.stringify(pa.research.facts) && JSON.stringify(pa.research.facts) === JSON.stringify(pb.research.facts),
        forPersonaA: { generic: evaluate(g, "A"), personalized: evaluate(pa, "A") },
        forPersonaB: { generic: evaluate(g, "B"), personalized: evaluate(pb, "B") },
      });
      console.log(`[validate] ${question.slice(0, 16)}… done`);
    }

    saveRecord(`product-validation-${new Date().toISOString().slice(0, 10)}.json`, {
      kind: "automated-evaluation",
      note: "开发者预先定义的自动指标，非真实用户研究；n 较小，仅用于说明方向。",
      at: new Date().toISOString(),
      model: llm.model,
      snapshotId: snap.id,
      needs: NEEDS,
      results,
    });
    expect(results.every((r) => r.sameFacts)).toBe(true);
  }, 1_800_000);
});
