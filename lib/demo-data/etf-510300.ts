import type { AssetSnapshot, DataSource, MarketFact, SectorWeight } from "@/types/market";
import type { Evidence } from "@/types/evidence";
import { annualizedVol, getDemoSeries, maxDrawdown, periodReturn, round, sliceDays } from "./series";

import { DEMO_SYMBOL } from "./symbols";

export { DEMO_SYMBOL, SYMBOL_DIRECTORY } from "./symbols";

export const DEMO_SOURCE: DataSource = {
  id: "investlens-demo-v1",
  name: "InvestLens 合成演示数据集 v1",
  kind: "demo",
  url: null,
  note: "固定种子生成的合成数据，不代表任何真实行情、净值或基金披露。",
};

export const COMPUTED_SOURCE: DataSource = {
  id: "investlens-demo-v1-computed",
  name: "由合成序列计算",
  kind: "computed",
  url: null,
  note: "基于合成价格序列按公开公式计算，结果同样为演示值。",
};

export const REFERENCE_SOURCE: DataSource = {
  id: "static-reference",
  name: "产品名称与跟踪标的（静态参考）",
  kind: "reference",
  url: null,
  note: "基金名称与跟踪指数为公开常识性信息，第二迭代将以扶摇数据源核验。",
};

const DEMO_ASOF = "合成快照 · 无真实时点";

const demoFact = (
  f: Omit<MarketFact, "symbol" | "asOf" | "asOfLabel" | "source" | "isDemo" | "status"> &
    Partial<Pick<MarketFact, "status" | "source">>,
): MarketFact => ({
  symbol: DEMO_SYMBOL,
  asOf: null,
  asOfLabel: DEMO_ASOF,
  source: f.source ?? DEMO_SOURCE,
  isDemo: true,
  status: f.status ?? "demo",
  ...f,
});

let factsCache: MarketFact[] | null = null;

/** 510300.SH 的事实层 —— 唯一信息源。所有画像读取的都是同一份对象。 */
export function getDemoFacts(): MarketFact[] {
  if (factsCache) return factsCache;
  const all = getDemoSeries();
  const last = all[all.length - 1].close;
  const y1 = sliceDays(250);
  const y3 = sliceDays(750);
  const m1 = sliceDays(21);

  factsCache = [
    demoFact({ id: "f-index", metric: "tracking_index", label: "跟踪指数", value: "沪深300", unit: "", category: "composition", status: "unverified", source: REFERENCE_SOURCE, definition: "ETF 所跟踪的标的指数。" }),
    demoFact({ id: "f-last", metric: "last_price", label: "最新价（合成）", value: last, unit: "元", precision: 3, category: "price", definition: "合成序列最后一个点的收盘值。" }),
    demoFact({ id: "f-ret-1y", metric: "return_1y", label: "近 1 年区间涨跌", value: round(periodReturn(y1) * 100), unit: "%", category: "price", status: "computed", source: COMPUTED_SOURCE, definition: "近 250 个合成交易日首尾收盘价变化。" }),
    demoFact({ id: "f-vol-1y", metric: "volatility_1y", label: "年化波动率（1 年）", value: round(annualizedVol(y1) * 100), unit: "%", category: "risk", status: "computed", source: COMPUTED_SOURCE, definition: "日对数收益标准差 × √250。" }),
    demoFact({ id: "f-vol-1m", metric: "volatility_1m", label: "年化波动率（20 日）", value: round(annualizedVol(m1) * 100), unit: "%", category: "risk", status: "computed", source: COMPUTED_SOURCE, definition: "近 21 个合成交易日的日对数收益标准差 × √250。" }),
    demoFact({ id: "f-mdd-1y", metric: "max_drawdown_1y", label: "最大回撤（1 年）", value: round(maxDrawdown(y1) * 100), unit: "%", category: "risk", status: "computed", source: COMPUTED_SOURCE, definition: "区间内从任一高点到其后低点的最大跌幅。" }),
    demoFact({ id: "f-mdd-3y", metric: "max_drawdown_3y", label: "最大回撤（3 年）", value: round(maxDrawdown(y3) * 100), unit: "%", category: "risk", status: "computed", source: COMPUTED_SOURCE, definition: "近 750 个合成交易日内的最大跌幅。" }),
    demoFact({ id: "f-pe", metric: "index_pe_ttm", label: "指数市盈率 PE-TTM", value: 12.6, unit: "倍", precision: 1, category: "valuation", definition: "演示值。第二迭代将接入真实估值数据并标注口径与时点。" }),
    demoFact({ id: "f-pe-pct", metric: "index_pe_percentile_10y", label: "PE 历史分位（10 年）", value: 41, unit: "%", precision: 0, category: "valuation", definition: "演示值：当前 PE 在过去 10 年中的位置。" }),
    demoFact({ id: "f-dy", metric: "dividend_yield", label: "指数股息率", value: 2.9, unit: "%", precision: 1, category: "valuation", definition: "演示值。" }),
    demoFact({ id: "f-fee", metric: "total_fee", label: "管理费 + 托管费", value: 0.2, unit: "% / 年", precision: 2, category: "cost", definition: "演示值：每年从基金资产中计提的综合费率。" }),
    demoFact({ id: "f-te", metric: "tracking_error", label: "年化跟踪误差", value: 0.08, unit: "%", precision: 2, category: "cost", definition: "演示值：基金收益与指数收益差异的年化标准差。" }),
    demoFact({ id: "f-turnover", metric: "avg_turnover_20d", label: "日均成交额（20 日）", value: 42.3, unit: "亿元", precision: 1, category: "liquidity", definition: "演示值。" }),
    demoFact({ id: "f-aum", metric: "aum", label: "基金规模", value: 1268, unit: "亿元", precision: 0, category: "liquidity", definition: "演示值。" }),
    demoFact({ id: "f-top-sector", metric: "top_sector_weight", label: "第一大行业权重", value: 22.5, unit: "%", precision: 1, category: "composition", definition: "演示值：金融行业在指数中的权重。" }),
    demoFact({ id: "f-premium", metric: "premium_discount", label: "场内折溢价率", value: null, unit: "%", category: "liquidity", status: "unknown", definition: "演示数据集未提供该字段。未知值不会被显示为 0。" }),
  ];
  return factsCache;
}

export const DEMO_SECTORS: SectorWeight[] = [
  { name: "金融", weight: 22.5 },
  { name: "信息技术", weight: 15.8 },
  { name: "工业", weight: 14.2 },
  { name: "日常消费", weight: 10.1 },
  { name: "医药卫生", weight: 7.9 },
  { name: "可选消费", weight: 7.6 },
  { name: "原材料", weight: 7.2 },
  { name: "其他", weight: 14.7 },
];

export function getDemoSnapshot(): AssetSnapshot {
  const s = getDemoSeries();
  const last = s[s.length - 1].close;
  const prev = s[s.length - 2].close;
  return {
    symbol: DEMO_SYMBOL,
    name: "沪深300ETF",
    shortName: "300ETF",
    assetType: "ETF",
    exchange: "上海证券交易所",
    trackingIndex: "沪深300",
    currency: "CNY",
    last,
    prevClose: prev,
    change: round(last - prev, 3),
    changePct: round((last / prev - 1) * 100),
    isDemo: true,
    asOf: null,
    asOfLabel: DEMO_ASOF,
    source: DEMO_SOURCE,
  };
}

/** 证据：把事实与来源、口径、限制绑定。 */
export function getDemoEvidence(): Evidence[] {
  const base = {
    source: DEMO_SOURCE,
    documentRef: "investlens-demo-v1 / 510300.SH",
    asOf: null,
    asOfLabel: DEMO_ASOF,
  };
  return [
    { ...base, id: "e-price-series", title: "合成价格序列（750 个交易日）", factIds: ["f-last", "f-ret-1y"], unit: "元", status: "demo", limitations: "固定种子生成，不是真实历史行情；不能用于判断真实走势。" },
    { ...base, id: "e-drawdown", title: "回撤与波动计算", factIds: ["f-mdd-1y", "f-mdd-3y", "f-vol-1y", "f-vol-1m"], source: COMPUTED_SOURCE, unit: "%", status: "computed", limitations: "计算方法真实，但输入是合成序列；历史回撤不代表未来最大损失。" },
    { ...base, id: "e-valuation", title: "估值指标（演示值）", factIds: ["f-pe", "f-pe-pct", "f-dy"], unit: "倍 / %", status: "demo", limitations: "演示值未对应真实估值口径；第二迭代需核验数据源、计算区间与更新时点。" },
    { ...base, id: "e-cost", title: "费率与跟踪误差（演示值）", factIds: ["f-fee", "f-te"], unit: "%", status: "demo", limitations: "演示值，不代表基金合同或定期报告披露的实际费率。" },
    { ...base, id: "e-liquidity", title: "成交与规模（演示值）", factIds: ["f-turnover", "f-aum", "f-premium"], unit: "亿元", status: "missing", limitations: "折溢价率在演示数据集中缺失；成交额与规模为演示值。" },
    { ...base, id: "e-composition", title: "行业构成（演示值）", factIds: ["f-top-sector", "f-index"], unit: "%", status: "unverified", limitations: "跟踪指数名称为静态参考，行业权重为演示值，均待第二迭代核验。" },
  ];
}
