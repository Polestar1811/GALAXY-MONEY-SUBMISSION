/**
 * 组合历史回测（纯函数）。
 *
 * 口径：
 * - 价格：扶摇 ETF 前复权日线收盘价（分红已体现在复权价格中）；
 * - 区间：所有资产都有收盘价的共同交易日（取交集），起止日期统一；
 * - 组合净值：按日收益逐日累乘；再平衡为「每月首个交易日恢复目标权重」或「不再平衡」；
 * - 费用：不另计交易佣金、买卖价差与税费（ETF 价格已扣除基金管理费与托管费）；
 * - 共同交易日少于 minDays 时拒绝计算，不生成任何结果。
 * 不会用各资产独立的累计涨幅加权来代替组合收益。
 */

export interface PriceSeries {
  symbol: string;
  /** 交易日（毫秒时间戳，升序）与对应收盘价。 */
  points: { t: number; close: number }[];
}

export type Rebalance = "monthly" | "none";

export interface BacktestInput {
  series: PriceSeries[];
  weights: Record<string, number>;
  rebalance: Rebalance;
  minDays?: number;
}

export interface Metrics {
  cumulativeReturn: number;
  /** 区间不足一年时为 null。 */
  annualizedReturn: number | null;
  maxDrawdown: number;
  /** 最大回撤的起止日期。 */
  maxDrawdownPeak: number;
  maxDrawdownTrough: number;
  annualizedVolatility: number;
}

export interface BacktestResult {
  ok: true;
  start: number;
  end: number;
  days: number;
  weights: Record<string, number>;
  rebalance: Rebalance;
  rebalances: number;
  nav: { t: number; v: number }[];
  metrics: Metrics;
  /** 按自然年的区间收益（首尾年份为不完整年度）。 */
  periods: { label: string; start: number; end: number; ret: number; partial: boolean }[];
  /** 每个资产在共同区间内被丢弃的非共同交易日数量。 */
  droppedDays: Record<string, number>;
}

export interface BacktestBlocked {
  ok: false;
  reason: string;
}

const DAY = 86_400_000;
const shanghaiYear = (t: number) => new Date(t + 8 * 3600_000).getUTCFullYear();
const shanghaiMonth = (t: number) => new Date(t + 8 * 3600_000).getUTCMonth();

/** 把权重规范化为合计 1，去掉为 0 的资产；权重无效时返回 null。 */
export function normalizeWeights(w: Record<string, number>): Record<string, number> | null {
  const entries = Object.entries(w).filter(([, v]) => Number.isFinite(v) && v > 0);
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  if (!entries.length || sum <= 0) return null;
  return Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
}

export function metricsOf(nav: { t: number; v: number }[]): Metrics {
  const first = nav[0];
  const last = nav[nav.length - 1];
  const cumulativeReturn = last.v / first.v - 1;
  const years = (last.t - first.t) / (365.25 * DAY);
  const annualizedReturn = years >= 1 ? Math.pow(last.v / first.v, 1 / years) - 1 : null;
  let peak = nav[0];
  let mdd = 0;
  let mddPeak = first.t;
  let mddTrough = first.t;
  for (const p of nav) {
    if (p.v > peak.v) peak = p;
    const dd = p.v / peak.v - 1;
    if (dd < mdd) {
      mdd = dd;
      mddPeak = peak.t;
      mddTrough = p.t;
    }
  }
  const rets: number[] = [];
  for (let i = 1; i < nav.length; i++) rets.push(Math.log(nav[i].v / nav[i - 1].v));
  const mean = rets.reduce((s, r) => s + r, 0) / Math.max(1, rets.length);
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  return { cumulativeReturn, annualizedReturn, maxDrawdown: mdd, maxDrawdownPeak: mddPeak, maxDrawdownTrough: mddTrough, annualizedVolatility: Math.sqrt(variance) * Math.sqrt(250) };
}

export function runBacktest(input: BacktestInput): BacktestResult | BacktestBlocked {
  const minDays = input.minDays ?? 250;
  const weights = normalizeWeights(input.weights);
  if (!weights) return { ok: false, reason: "组合权重无效：至少需要一个资产的权重大于 0。" };
  const symbols = Object.keys(weights);
  const bySymbol = new Map(input.series.map((s) => [s.symbol, s]));
  const missing = symbols.filter((s) => !bySymbol.get(s)?.points.length);
  if (missing.length) return { ok: false, reason: `缺少以下资产的价格序列，无法计算组合历史表现：${missing.join("、")}。` };

  // 共同交易日
  const maps = symbols.map((s) => new Map(bySymbol.get(s)!.points.filter((p) => Number.isFinite(p.close) && p.close > 0).map((p) => [p.t, p.close])));
  const common = Array.from(maps[0].keys())
    .filter((t) => maps.every((m) => m.has(t)))
    .sort((a, b) => a - b);
  if (common.length < minDays) return { ok: false, reason: `所选资产的共同交易日只有 ${common.length} 天，少于 ${minDays} 天，不生成历史结果。` };
  const droppedDays = Object.fromEntries(symbols.map((s, i) => [s, maps[i].size - common.length]));

  // 逐日计算：holdings 为各资产的市值
  let holdings = symbols.map((s) => weights[s]);
  const nav: { t: number; v: number }[] = [{ t: common[0], v: 1 }];
  let rebalances = 0;
  for (let d = 1; d < common.length; d++) {
    const t = common[d];
    holdings = holdings.map((h, i) => h * (maps[i].get(t)! / maps[i].get(common[d - 1])!));
    const total = holdings.reduce((s, h) => s + h, 0);
    nav.push({ t, v: total });
    if (input.rebalance === "monthly" && d + 1 < common.length && shanghaiMonth(common[d + 1]) !== shanghaiMonth(t)) {
      holdings = symbols.map((s) => total * weights[s]);
      rebalances++;
    }
  }

  // 自然年区间收益
  const periods: BacktestResult["periods"] = [];
  let i0 = 0;
  for (let i = 1; i <= nav.length; i++) {
    if (i === nav.length || shanghaiYear(nav[i].t) !== shanghaiYear(nav[i0].t)) {
      const startV = i0 === 0 ? nav[0].v : nav[i0 - 1].v;
      const endP = nav[i - 1];
      const y = shanghaiYear(nav[i0].t);
      const partial = i0 === 0 || i === nav.length;
      periods.push({ label: `${y}${partial ? "（不完整年度）" : ""}`, start: i0 === 0 ? nav[0].t : nav[i0 - 1].t, end: endP.t, ret: endP.v / startV - 1, partial });
      i0 = i;
    }
  }

  return {
    ok: true,
    start: common[0],
    end: common[common.length - 1],
    days: common.length,
    weights,
    rebalance: input.rebalance,
    rebalances,
    nav,
    metrics: metricsOf(nav),
    periods,
    droppedDays,
  };
}

export interface ScenarioInput {
  amount: number;
  weights: Record<string, number>;
  /** 用户指定的各类资产假设跌幅（负数，如 -0.2）。 */
  shocks: Partial<Record<"cash" | "bond" | "equity" | "gold", number>>;
  classOf: (symbol: string) => "cash" | "bond" | "equity" | "gold";
}

/** 用户指定的假设情景：金额 × 权重 × 假设跌幅，逐项求和。这是假设，不是预测。 */
export function scenarioLoss(input: ScenarioInput) {
  const w = normalizeWeights(input.weights) ?? {};
  const rows = Object.entries(w).map(([symbol, weight]) => {
    const shock = input.shocks[input.classOf(symbol)] ?? 0;
    const amount = input.amount * weight;
    return { symbol, weight, amount, shock, change: amount * shock };
  });
  const change = rows.reduce((s, r) => s + r.change, 0);
  return { rows, change, after: input.amount + change, changePct: input.amount > 0 ? change / input.amount : 0 };
}
