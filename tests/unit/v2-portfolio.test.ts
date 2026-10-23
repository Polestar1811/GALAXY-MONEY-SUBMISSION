import { afterEach, describe, expect, it, vi } from "vitest";
import { isUnfinishedTodayBar } from "@/lib/time";
import { snapshotTiming } from "@/lib/providers/fuyao-provider";
import { metricsOf, normalizeWeights, runBacktest, scenarioLoss, type PriceSeries } from "@/lib/portfolio/backtest";
import { backtestPortfolio } from "@/lib/portfolio/service";
import { DemoMarketDataProvider } from "@/lib/providers/demo-provider";
import type { MarketDataProvider } from "@/lib/providers/types";

const DAY = 86_400_000;
// 2024-01-02 起的连续交易日（只为测试，忽略周末）
const T0 = Date.UTC(2024, 0, 2) - 8 * 3600_000;
const series = (symbol: string, closes: number[], skip: number[] = []): PriceSeries => ({
  symbol,
  points: closes.map((c, i) => ({ t: T0 + i * DAY, close: c })).filter((_, i) => !skip.includes(i)),
});

describe("组合回测计算", () => {
  it("不再平衡时，组合净值 = Σ 初始权重 × 各资产相对涨幅（买入持有）", () => {
    const a = series("A", [1, 1.1, 1.21, 1.1, 1.3]);
    const b = series("B", [2, 2, 1.9, 2.1, 2.2]);
    const r = runBacktest({ series: [a, b], weights: { A: 60, B: 40 }, rebalance: "none", minDays: 3 });
    if (!r.ok) throw new Error(r.reason);
    r.nav.forEach((p, i) => expect(p.v).toBeCloseTo(0.6 * (a.points[i].close / 1) + 0.4 * (b.points[i].close / 2), 10));
    expect(r.metrics.cumulativeReturn).toBeCloseTo(0.6 * 0.3 + 0.4 * 0.1, 10);
  });

  it("按月再平衡与「各资产累计涨幅加权」不同（不会用后者冒充组合收益）", () => {
    // 跨月：第 0–29 天在 1 月，之后进入 2 月
    const n = 60;
    const up = Array.from({ length: n }, (_, i) => (i < 30 ? 1 + i * 0.02 : 1.58 - (i - 30) * 0.02));
    const flat = Array.from({ length: n }, () => 1);
    const r = runBacktest({ series: [series("U", up), series("F", flat)], weights: { U: 50, F: 50 }, rebalance: "monthly", minDays: 10 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.rebalances).toBeGreaterThanOrEqual(1);
    const naive = 0.5 * (up[n - 1] / up[0] - 1);
    expect(Math.abs(r.metrics.cumulativeReturn - naive)).toBeGreaterThan(0.001);
  });

  it("只使用共同交易日，统一起止日期，并记录被丢弃的日期数", () => {
    const a = series("A", [1, 1, 1, 1, 1, 1], [1]);
    const b = series("B", [1, 1, 1, 1, 1, 1], [4]);
    const r = runBacktest({ series: [a, b], weights: { A: 1, B: 1 }, rebalance: "none", minDays: 3 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.days).toBe(4);
    expect(r.droppedDays).toEqual({ A: 1, B: 1 });
    expect(r.start).toBe(T0);
  });

  it("共同区间不足或缺少序列时拒绝计算，不生成结果", () => {
    const short = runBacktest({ series: [series("A", [1, 1.1])], weights: { A: 1 }, rebalance: "none" });
    expect(short.ok).toBe(false);
    const missing = runBacktest({ series: [series("A", [1, 1.1, 1.2])], weights: { A: 1, X: 1 }, rebalance: "none", minDays: 2 });
    expect(missing).toMatchObject({ ok: false });
    expect(normalizeWeights({ A: 0 })).toBeNull();
  });

  it("最大回撤、年化与波动率", () => {
    const nav = [1, 1.2, 0.9, 1.0, 1.3].map((v, i) => ({ t: T0 + i * 100 * DAY, v }));
    const m = metricsOf(nav);
    expect(m.maxDrawdown).toBeCloseTo(0.9 / 1.2 - 1, 10);
    expect(m.maxDrawdownPeak).toBe(nav[1].t);
    expect(m.maxDrawdownTrough).toBe(nav[2].t);
    expect(m.annualizedReturn).not.toBeNull();
    expect(m.annualizedVolatility).toBeGreaterThan(0);
    expect(metricsOf(nav.slice(0, 2).map((p, i) => ({ ...p, t: T0 + i * DAY }))).annualizedReturn).toBeNull();
  });

  it("用户指定的情景：金额 × 权重 × 假设跌幅", () => {
    const s = scenarioLoss({ amount: 100_000, weights: { E: 60, B: 40 }, shocks: { equity: -0.2, bond: 0 }, classOf: (x) => (x === "E" ? "equity" : "bond") });
    expect(s.change).toBeCloseTo(-12_000, 6);
    expect(s.after).toBeCloseTo(88_000, 6);
    expect(s.changePct).toBeCloseTo(-0.12, 10);
  });
});

describe("交易时段内当天未收盘的 K 线（独立复核发现）", () => {
  afterEach(() => vi.useRealTimers());

  it("北京时间 15:05 前，当天的 K 线不是收盘价；收盘后或往日 K 线不受影响", () => {
    const day = Date.parse("2026-10-23T00:00:00+08:00");
    expect(isUnfinishedTodayBar(day, Date.parse("2026-10-23T13:22:00+08:00"))).toBe(true);
    expect(isUnfinishedTodayBar(day, Date.parse("2026-10-23T15:30:00+08:00"))).toBe(false);
    expect(isUnfinishedTodayBar(Date.parse("2026-10-22T00:00:00+08:00"), Date.parse("2026-10-23T10:00:00+08:00"))).toBe(false);
  });

  it("盘中：快照价等于当天未完成 K 线时，不标为「收盘」", () => {
    const bars = [{ dateMs: Date.parse("2026-10-23T00:00:00+08:00"), close: 4.145 }];
    const t = snapshotTiming(4.145, Date.parse("2026-10-23T13:22:00+08:00"), bars);
    expect(t.label).not.toContain("收盘");
    expect(t.label).toMatch(/快照获取于.*非成交时间/);
  });

  it("组合回测在交易时段内不使用当天未收盘的 K 线", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T13:22:00+08:00"));
    const today = Date.parse("2026-10-23T00:00:00+08:00");
    const pts = Array.from({ length: 300 }, (_, i) => ({ t: today - (299 - i) * DAY, close: 1 + i * 0.001 }));
    const provider = { info: { id: "fuyao", label: "mock", isDemo: false }, getDailyCloses: async (s: string) => ({ symbol: s, points: pts, requestId: null }) } as unknown as MarketDataProvider;
    const r = await backtestPortfolio(provider, { "511010.SH": 100 }, "none");
    if (!r.portfolio.ok) throw new Error("expected ok");
    expect(r.portfolio.end).toBe(today - DAY);
    expect(r.portfolio.days).toBe(299);
  });
});

describe("组合服务", () => {
  it("演示数据模式：明确阻止，不生成任何组合历史结果", async () => {
    const r = await backtestPortfolio(new DemoMarketDataProvider(), { "510300.SH": 50, "511010.SH": 50 }, "monthly");
    expect(r.portfolio.ok).toBe(false);
    expect(r.dataMode).toBe("demo");
  });

  it("真实数据源（Mock 序列）：组合与基准使用同一共同区间", async () => {
    const mk = (symbol: string, skip: number[]) => ({ symbol, points: Array.from({ length: 300 }, (_, i) => ({ t: T0 + i * DAY, close: 1 + i * 0.001 })).filter((_, i) => !skip.includes(i)), requestId: "r" });
    const provider = {
      info: { id: "fuyao", label: "mock", isDemo: false },
      getDailyCloses: async (s: string) => mk(s, s === "510300.SH" ? [5] : s === "511010.SH" ? [7] : []),
    } as unknown as MarketDataProvider;
    const r = await backtestPortfolio(provider, { "511010.SH": 50, "518880.SH": 50 }, "monthly");
    if (!r.portfolio.ok || !r.benchmark?.ok) throw new Error("expected ok");
    expect(r.portfolio.start).toBe(r.benchmark.start);
    expect(r.portfolio.days).toBe(r.benchmark.days);
    expect(r.portfolio.days).toBe(298);
    await expect(backtestPortfolio(provider, { "600519.SH": 100 }, "none")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
