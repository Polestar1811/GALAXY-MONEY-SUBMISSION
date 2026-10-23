import { describe, expect, it } from "vitest";
import { DemoResearchService } from "@/lib/research/demo-research-service";
import { DemoMarketDataProvider } from "@/lib/providers/demo-provider";
import { PERSONA_A, PERSONA_B, emptyUserProfile } from "@/lib/profile/personas";
import { deriveSignals } from "@/lib/personalization/signals";

const service = new DemoResearchService(new DemoMarketDataProvider());
const SYMBOL = "510300.SH";

describe("个性化效果：至少三个研究区域随画像变化", () => {
  it("画像信号推导正确", () => {
    const a = deriveSignals(PERSONA_A);
    const b = deriveSignals(PERSONA_B);
    expect(a).toMatchObject({ horizon: "short", liquidityPressure: "high", capacity: "low", willingnessExceedsCapacity: true });
    expect(b).toMatchObject({ horizon: "long", liquidityPressure: "low", capacity: "high", willingnessExceedsCapacity: false });
  });

  it("模块顺序、风险排序、待验证问题、研究焦点与解释均不同", async () => {
    const [a, b] = await Promise.all([
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_A }),
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_B }),
    ]);
    const changed = {
      moduleOrder: a.modules.map((m) => m.id).join() !== b.modules.map((m) => m.id).join(),
      riskOrder: a.risks.map((r) => r.id).join() !== b.risks.map((r) => r.id).join(),
      questionOrder: a.openQuestions.map((q) => q.id).join() !== b.openQuestions.map((q) => q.id).join(),
      focus: a.focus.headline !== b.focus.headline,
      lensNotes: a.modules.some((m) => b.modules.find((x) => x.id === m.id)!.lensNote !== m.lensNote),
    };
    expect(Object.values(changed).filter(Boolean).length).toBeGreaterThanOrEqual(3);
    expect(changed).toStrictEqual({ moduleOrder: true, riskOrder: true, questionOrder: true, focus: true, lensNotes: true });
  });

  it("A 优先「用钱时点 × 回撤」，B 优先估值与成本", async () => {
    const [a, b] = await Promise.all([
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_A }),
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_B }),
    ]);
    expect(a.modules[0].id).toBe("m-drawdown");
    expect(a.risks[0].id).toBe("r-timing");
    expect(a.risks[0].severity).toBe(3);
    expect(["m-valuation", "m-cost"]).toContain(b.modules[0].id);
    expect(b.risks.find((r) => r.id === "r-timing")!.severity).toBe(1);
  });

  it("风险的客观严重程度只由事实决定（A/B 相同），个人相关度可以不同", async () => {
    const [a, b] = await Promise.all([
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_A }),
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_B }),
    ]);
    for (const r of a.risks) {
      const rb = b.risks.find((x) => x.id === r.id)!;
      expect(rb.objectiveSeverity).toBe(r.objectiveSeverity);
      expect(rb.summary).toBe(r.summary);
    }
    expect(a.risks.some((r) => b.risks.find((x) => x.id === r.id)!.severity !== r.severity)).toBe(true);
    expect(a.inferences).toStrictEqual(b.inferences);
  });

  it("每个被前置的模块都能解释「为什么看到这条」", async () => {
    const a = await service.research({ symbol: SYMBOL, question: "", profile: PERSONA_A });
    expect(a.modules[0].reasons.length).toBeGreaterThan(0);
    expect(a.modules[0].reasons[0].trigger).toMatch(/资金需要|期限|承受/);
    expect(a.appliedRules.map((r) => r.ruleId)).toEqual(expect.arrayContaining(["R1-liquidity", "R6-gap"]));
  });

  it("跳过的字段不会产生推断", () => {
    const p = { ...emptyUserProfile(), horizon: "gt10y" as const, skipped: ["lossCapacity" as const] };
    const s = deriveSignals(p);
    expect(s.capacity).toBe("unknown");
    expect(s.liquidityPressure).toBe("unknown");
    expect(s.willingnessExceedsCapacity).toBe(false);
  });

  it("模板中的画像占位符来自用户回答，不残留占位符", async () => {
    const a = await service.research({ symbol: SYMBOL, question: "", profile: PERSONA_A });
    const all = JSON.stringify(a);
    expect(all).not.toMatch(/\{p:|\{f-/);
    expect(a.risks.find((r) => r.id === "r-behavior")!.lensNote).toContain("5% – 10%");
  });
});
