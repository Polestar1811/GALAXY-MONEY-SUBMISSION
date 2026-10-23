/**
 * 组合回测的独立复核（真实扶摇数据）。
 * - 原始数据：直接请求扶摇 /api/fund/market/historical（不经过项目的 Fuyao 客户端与缓存）；
 * - 独立算法：按「份额」计算（每次再平衡时按收盘价重新计算各资产份额，净值 = Σ 份额 × 收盘价），
 *   与产品中的「按日收益逐日累乘市值」实现互不共用代码；
 * - 在同一份数据上与产品的 runBacktest 比较累计收益、年化、最大回撤、波动与再平衡次数；
 * - 复权检查：最新收盘价 = 快照价（前复权序列的最新价不被调整），以及单日异常涨跌；
 * - 费用：按换手率估算交易佣金对结果的影响（产品默认不计交易成本）。
 * 结果写入 docs/live-verification/backtest-audit-<日期>.json。
 */
import { describe, expect, it } from "vitest";
import { loadEnvLocal, saveRecord } from "./env";

loadEnvLocal();
const KEY = process.env.FUYAO_API_KEY?.trim();
const DAY = 86_400_000;

async function rawCloses(symbol: string, start: number, end: number) {
  const url = `https://fuyao.aicubes.cn/api/fund/market/historical?thscode=${symbol}&interval=1d&start=${start}&end=${end}`;
  const r = await fetch(url, { headers: { "X-api-key": KEY! }, signal: AbortSignal.timeout(40_000) });
  const j = (await r.json()) as { code: number; request_id?: string; data: { adjust?: unknown; item: { date_ms?: number; timestamp?: number; close_price: number | null }[] } };
  if (j.code !== 0) throw new Error(`${symbol} code=${j.code}`);
  const points = j.data.item
    .map((x) => ({ t: Number(x.date_ms ?? x.timestamp), close: x.close_price }))
    .filter((p): p is { t: number; close: number } => typeof p.close === "number" && p.close > 0 && Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  return { symbol, points, adjust: j.data.adjust ?? null, requestId: j.request_id ?? null };
}

async function snapshotLast(symbol: string) {
  const r = await fetch(`https://fuyao.aicubes.cn/api/fund/market/snapshot?thscode=${symbol}`, { headers: { "X-api-key": KEY! }, signal: AbortSignal.timeout(20_000) });
  const j = (await r.json()) as { data: { item: { last_price: number | null }[] } };
  return j.data.item[0]?.last_price ?? null;
}

const month = (t: number) => new Date(t + 8 * 3600_000).getUTCMonth();

/** 独立实现：份额法。 */
function shareBacktest(series: { symbol: string; points: { t: number; close: number }[] }[], weights: Record<string, number>, monthly: boolean) {
  const syms = Object.keys(weights).filter((s) => weights[s] > 0);
  const total = syms.reduce((s, k) => s + weights[k], 0);
  const w = Object.fromEntries(syms.map((s) => [s, weights[s] / total]));
  const px = syms.map((s) => new Map(series.find((x) => x.symbol === s)!.points.map((p) => [p.t, p.close])));
  const dates = Array.from(px[0].keys()).filter((t) => px.every((m) => m.has(t))).sort((a, b) => a - b);
  let shares = syms.map((s, i) => w[s] / px[i].get(dates[0])!);
  const nav: number[] = [];
  let rebalances = 0;
  let turnover = 0;
  for (let d = 0; d < dates.length; d++) {
    const v = syms.reduce((acc, _, i) => acc + shares[i] * px[i].get(dates[d])!, 0);
    nav.push(v);
    if (monthly && d + 1 < dates.length && month(dates[d + 1]) !== month(dates[d])) {
      const target = syms.map((s, i) => (v * w[s]) / px[i].get(dates[d])!);
      turnover += syms.reduce((acc, _, i) => acc + Math.abs(target[i] - shares[i]) * px[i].get(dates[d])!, 0) / v;
      shares = target;
      rebalances++;
    }
  }
  const cum = nav[nav.length - 1] / nav[0] - 1;
  const years = (dates[dates.length - 1] - dates[0]) / (365.25 * DAY);
  let peak = nav[0];
  let mdd = 0;
  for (const v of nav) {
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  const lr = nav.slice(1).map((v, i) => Math.log(v / nav[i]));
  const mean = lr.reduce((a, b) => a + b, 0) / lr.length;
  const vol = Math.sqrt(lr.reduce((a, b) => a + (b - mean) ** 2, 0) / (lr.length - 1)) * Math.sqrt(250);
  return { days: dates.length, start: dates[0], end: dates[dates.length - 1], cum, ann: Math.pow(1 + cum, 1 / years) - 1, mdd, vol, rebalances, turnover };
}

describe.skipIf(!KEY)("组合回测独立复核（真实数据）", () => {
  it(
    "份额法独立计算与产品实现一致；复权与费用口径核查",
    async () => {
      const { runBacktest } = await import("@/lib/portfolio/backtest");
      const { TEMPLATES, UNIVERSE, BENCHMARK } = await import("@/lib/portfolio/universe");
      const end = Date.now();
      const start = end - (3 * 366 + 45) * DAY;
      const symbols = Array.from(new Set([...UNIVERSE.map((u) => u.symbol), BENCHMARK.symbol]));
      const raw = await Promise.all(symbols.map((s) => rawCloses(s, start, end)));

      // 与产品服务一致：所有资产（含基准）取共同交易日
      const common = new Set(raw[0].points.map((p) => p.t).filter((t) => raw.every((r) => r.points.some((p) => p.t === t))));
      const aligned = raw.map((r) => ({ symbol: r.symbol, points: r.points.filter((p) => common.has(p.t)) }));

      const adjustment: Record<string, unknown> = {};
      for (const r of raw) {
        const last = r.points[r.points.length - 1].close;
        const snap = await snapshotLast(r.symbol);
        const moves = r.points.slice(1).map((p, i) => p.close / r.points[i].close - 1);
        const worst = Math.min(...moves);
        const best = Math.max(...moves);
        adjustment[r.symbol] = { adjustField: r.adjust, lastClose: last, snapshotLast: snap, lastEqualsSnapshot: snap === null ? null : Math.abs(last - snap) < 1e-9, worstDay: worst, bestDay: best, bars: r.points.length };
      }

      const results: Record<string, unknown> = {};
      for (const [id, weights] of [...Object.entries(TEMPLATES).map(([k, t]) => [k, t.weights] as const), ["BENCH", { [BENCHMARK.symbol]: 100 }] as const]) {
        for (const reb of ["monthly", "none"] as const) {
          const mine = runBacktest({ series: aligned, weights, rebalance: reb });
          const indep = shareBacktest(aligned, weights, reb === "monthly");
          if (!mine.ok) throw new Error(`${id} ${reb}: ${mine.reason}`);
          const diff = {
            cum: Math.abs(mine.metrics.cumulativeReturn - indep.cum),
            ann: Math.abs((mine.metrics.annualizedReturn ?? 0) - indep.ann),
            mdd: Math.abs(mine.metrics.maxDrawdown - indep.mdd),
            vol: Math.abs(mine.metrics.annualizedVolatility - indep.vol),
          };
          expect(mine.days).toBe(indep.days);
          expect(mine.rebalances).toBe(indep.rebalances);
          for (const [k, v] of Object.entries(diff)) expect(v, `${id} ${reb} ${k}`).toBeLessThan(1e-9);
          // 按换手估算交易成本：每次再平衡的成交额 × 单边费率（万三，仅为敏感性估算）
          const costRate = 0.0003;
          results[`${id}-${reb}`] = {
            weights,
            product: { cum: mine.metrics.cumulativeReturn, ann: mine.metrics.annualizedReturn, mdd: mine.metrics.maxDrawdown, vol: mine.metrics.annualizedVolatility, rebalances: mine.rebalances },
            independent: { cum: indep.cum, ann: indep.ann, mdd: indep.mdd, vol: indep.vol, rebalances: indep.rebalances },
            maxAbsDiff: Math.max(...Object.values(diff)),
            turnover: indep.turnover,
            estCostDrag_at_0_03pct: indep.turnover * costRate,
          };
        }
      }
      const iso = (t: number) => new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
      saveRecord(`backtest-audit-${new Date().toISOString().slice(0, 10)}.json`, {
        kind: "independent-backtest-audit",
        at: new Date().toISOString(),
        window: { start: iso(Math.min(...common)), end: iso(Math.max(...common)), commonDays: common.size },
        sources: raw.map((r) => ({ symbol: r.symbol, requestId: r.requestId })),
        adjustment,
        results,
      });
    },
    240_000,
  );
});
