import "server-only";
import type { MarketDataProvider } from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/types";
import { runBacktest, type BacktestBlocked, type BacktestResult, type Rebalance } from "./backtest";
import { ASSET_BY_SYMBOL, BENCHMARK } from "./universe";
import { isUnfinishedTodayBar } from "@/lib/time";

export interface PortfolioResponse {
  portfolio: BacktestResult | BacktestBlocked;
  benchmark: BacktestResult | BacktestBlocked | null;
  /** 组合与基准在同一共同区间计算（基准与组合资产取共同交易日）。 */
  assumptions: string[];
  sources: { symbol: string; name: string; requestId: string | null }[];
  dataMode: "fuyao" | "demo";
}

export const PORTFOLIO_ASSUMPTIONS = [
  "价格：同花顺扶摇场内 ETF 前复权日线收盘价，分红已体现在复权价格中。",
  "区间：组合中所有资产与基准都有收盘价的共同交易日，起止日期统一；交易时段内当天未收盘的 K 线不计入。",
  "组合净值：按日收益逐日计算，不是把各资产的累计涨幅加权相加。",
  "费用：未另计交易佣金、买卖价差与税费；ETF 价格已扣除基金管理费与托管费。",
  "历史表现只描述过去，不代表未来；这是研究情景，不是投资建议或配置方案。",
];

export async function backtestPortfolio(provider: MarketDataProvider, weights: Record<string, number>, rebalance: Rebalance): Promise<PortfolioResponse> {
  const symbols = Object.keys(weights).filter((s) => weights[s] > 0);
  if (provider.info.isDemo || !provider.getDailyCloses) {
    const blocked: BacktestBlocked = { ok: false, reason: "当前为演示数据模式，没有多资产的真实价格序列，因此不生成任何组合历史结果。" };
    return { portfolio: blocked, benchmark: null, assumptions: PORTFOLIO_ASSUMPTIONS, sources: [], dataMode: "demo" };
  }
  const unknown = symbols.filter((s) => !ASSET_BY_SYMBOL[s]);
  if (unknown.length) throw new ProviderError("BAD_REQUEST", `不在组合探索范围内的资产：${unknown.join("、")}`);

  const all = Array.from(new Set([...symbols, BENCHMARK.symbol]));
  const fetched = await Promise.all(all.map((s) => provider.getDailyCloses!(s)));
  // 交易时段内，当天未收盘的 K 线不计入回测（其「收盘价」是盘中价）
  const series = fetched.map((f) => ({ symbol: f.symbol, points: f.points.filter((p) => !isUnfinishedTodayBar(p.t)) }));

  // 组合与基准使用同一共同区间：先求包含基准在内的共同交易日，再裁剪各序列
  const sets = series.map((s) => new Set(s.points.map((p) => p.t)));
  const common = new Set(series[0].points.map((p) => p.t).filter((t) => sets.every((x) => x.has(t))));
  const aligned = series.map((s) => ({ symbol: s.symbol, points: s.points.filter((p) => common.has(p.t)) }));

  const portfolio = runBacktest({ series: aligned, weights, rebalance });
  const benchmark = runBacktest({ series: aligned, weights: { [BENCHMARK.symbol]: 1 }, rebalance: "none" });
  return {
    portfolio,
    benchmark,
    assumptions: [...PORTFOLIO_ASSUMPTIONS, rebalance === "monthly" ? "再平衡：每月首个交易日恢复目标权重。" : "再平衡：不再平衡，各资产随市场涨跌自然漂移。"],
    sources: fetched.map((f) => ({ symbol: f.symbol, name: ASSET_BY_SYMBOL[f.symbol]?.name ?? f.symbol, requestId: f.requestId })),
    dataMode: "fuyao",
  };
}
