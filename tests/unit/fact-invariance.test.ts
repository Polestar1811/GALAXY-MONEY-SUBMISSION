import { describe, expect, it } from "vitest";
import { DemoResearchService } from "@/lib/research/demo-research-service";
import { DemoMarketDataProvider } from "@/lib/providers/demo-provider";
import { PERSONA_A, PERSONA_B } from "@/lib/profile/personas";
import { factFingerprint } from "@/lib/personalization/engine";

const service = new DemoResearchService(new DemoMarketDataProvider());
const SYMBOL = "510300.SH";

describe("事实不变性：A/B 画像切换不改变事实层", () => {
  it("A、B 与通用视角返回完全相同的事实对象、数值、时点与来源", async () => {
    const [a, b, none] = await Promise.all([
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_A }),
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_B }),
      service.research({ symbol: SYMBOL, question: "", profile: null }),
    ]);
    expect(a.facts).toStrictEqual(b.facts);
    expect(a.facts).toStrictEqual(none.facts);
    expect(a.evidence).toStrictEqual(b.evidence);
    expect(a.factFingerprint).toBe(b.factFingerprint);
    expect(a.factFingerprint).toBe(factFingerprint(none.facts));
  });

  it("简报与研究页共享同一事实层", async () => {
    const [r, br] = await Promise.all([
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_A }),
      service.brief({ symbol: SYMBOL, profile: PERSONA_B }),
    ]);
    expect(br.facts).toStrictEqual(r.facts);
    expect(br.factFingerprint).toBe(r.factFingerprint);
  });

  it("模块中的事实引用与数值在 A/B 间一致（只改变顺序与解释）", async () => {
    const [a, b] = await Promise.all([
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_A }),
      service.research({ symbol: SYMBOL, question: "", profile: PERSONA_B }),
    ]);
    for (const m of a.modules) {
      const mb = b.modules.find((x) => x.id === m.id)!;
      expect(mb.summary).toBe(m.summary);
      expect(mb.bullets).toStrictEqual(m.bullets);
      expect(mb.factIds).toStrictEqual(m.factIds);
    }
  });

  it("所有事实都标记为演示且没有伪造的真实时点或 URL", async () => {
    const r = await service.research({ symbol: SYMBOL, question: "", profile: null });
    for (const f of r.facts) {
      expect(f.isDemo).toBe(true);
      expect(f.asOf).toBeNull();
      expect(f.source.url).toBeNull();
      expect(f.source.kind).not.toBe("api");
    }
    expect(r.engine.isLLM).toBe(false);
  });

  it("缺失值保持 null 且状态为 unknown，不被填充为 0", async () => {
    const r = await service.research({ symbol: SYMBOL, question: "", profile: null });
    const premium = r.facts.find((f) => f.id === "f-premium")!;
    expect(premium.value).toBeNull();
    expect(premium.status).toBe("unknown");
  });
});
