import { describe, expect, it } from "vitest";
import { DemoMarketDataProvider, matchSymbols } from "@/lib/providers/demo-provider";
import { ProviderError } from "@/lib/providers/types";
import { getDemoSeries } from "@/lib/demo-data/series";
import { parseProfile } from "@/lib/profile/schema";
import { PERSONA_A } from "@/lib/profile/personas";
import { simulateScenario } from "@/lib/scenario";

describe("DemoMarketDataProvider", () => {
  it("合成序列固定且可重复", () => {
    const s = getDemoSeries();
    expect(s).toHaveLength(750);
    expect(s[s.length - 1].offset).toBe(0);
    // 固定种子：最后收盘价为确定值（若生成器被修改，此快照会提示）
    expect(s[s.length - 1].close).toMatchSnapshot();
  });

  it("周期切换返回对应长度且价格与全序列一致", async () => {
    const p = new DemoMarketDataProvider();
    const h1 = await p.getHistory("510300.SH", "1M");
    const h3 = await p.getHistory("510300.SH", "1Y");
    expect(h1.points).toHaveLength(21);
    expect(h3.points).toHaveLength(250);
    expect(h1.points.at(-1)!.close).toBe(h3.points.at(-1)!.close);
    expect(h1.points.every((x) => x.ma20 !== null)).toBe(true);
  });

  it("不支持的标的显式报错，而不是伪造分析", async () => {
    const p = new DemoMarketDataProvider();
    await expect(p.getSnapshot("600519.SH")).rejects.toMatchObject({ code: "UNSUPPORTED_SYMBOL" });
  });

  it("故障注入：error / unauthorized", async () => {
    await expect(new DemoMarketDataProvider("error").getSnapshot("510300.SH")).rejects.toBeInstanceOf(ProviderError);
    await expect(new DemoMarketDataProvider("unauthorized").getSnapshot("510300.SH")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("搜索支持代码、中文名与别名", () => {
    expect(matchSymbols("510300")[0].symbol).toBe("510300.SH");
    expect(matchSymbols("沪深300")[0].supported).toBe(true);
    expect(matchSymbols("茅台")[0].supported).toBe(false);
    expect(matchSymbols("不存在的标的")).toHaveLength(0);
  });
});

describe("InvestorProfile 校验", () => {
  it("合法画像通过", () => {
    expect(parseProfile(PERSONA_A)).not.toBeNull();
  });
  it("非法字段值被拒绝，不做猜测性修复", () => {
    expect(parseProfile({ ...PERSONA_A, horizon: "forever" })).toBeNull();
    expect(parseProfile({ ...PERSONA_A, consent: undefined })).toBeNull();
    expect(parseProfile("garbage")).toBeNull();
  });
});

describe("情景模拟公式", () => {
  it("复利与回撤锁定损失计算正确", () => {
    const r = simulateScenario({ principal: 100000, annualReturn: 5, years: 10, drawdown: 20, withdrawal: 40000, monthly: 0 });
    expect(r.finalValue).toBeCloseTo(100000 * 1.05 ** 10, 0);
    expect(r.troughValue).toBeCloseTo(80000, 0);
    // 锁定损失 = W × d / (1 − d) = 40000 × 0.2 / 0.8
    expect(r.lockedLoss).toBeCloseTo(10000, 0);
    expect(r.unitsSoldPct).toBeCloseTo(50, 1);
  });
  it("取款超过回撤后市值时提示无法满足", () => {
    const r = simulateScenario({ principal: 50000, annualReturn: 0, years: 1, drawdown: 50, withdrawal: 30000, monthly: 0 });
    expect(r.shortfall).toBeCloseTo(5000, 0);
  });
  it("零回报定投不出现除零", () => {
    const r = simulateScenario({ principal: 0, annualReturn: 0, years: 2, drawdown: 0, withdrawal: 0, monthly: 1000 });
    expect(r.finalValue).toBeCloseTo(24000, 0);
    expect(r.totalContribution).toBe(24000);
  });
});
