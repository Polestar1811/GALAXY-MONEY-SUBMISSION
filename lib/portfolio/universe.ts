import type { PathId } from "@/types/identity";

/**
 * 组合探索可用的资产：全部是扶摇历史日线可覆盖的场内 ETF（2026-10-22 实测均有 753 个共同交易日）。
 * 511990.SH（华宝添益）虽有数据，但收益以份额形式分配、价格基本不变，价格序列会低估收益，因此不纳入回测。
 */
export type AssetClass = "cash" | "bond" | "equity" | "gold";

export interface UniverseAsset {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** 在组合中承担的作用（面向普通用户）。 */
  role: string;
}

export const UNIVERSE: UniverseAsset[] = [
  { symbol: "511880.SH", name: "银华日利ETF", assetClass: "cash", role: "现金管理：波动很小，用来存放近期可能要用的钱" },
  { symbol: "511010.SH", name: "国债ETF", assetClass: "bond", role: "债券：通常比股票稳定，在股市下跌时可能起到缓冲作用" },
  { symbol: "510300.SH", name: "沪深300ETF", assetClass: "equity", role: "A 股大盘：分享大型公司的长期成长，也承担较大波动" },
  { symbol: "510500.SH", name: "中证500ETF", assetClass: "equity", role: "A 股中盘：成长性更强，波动通常比大盘更大" },
  { symbol: "518880.SH", name: "黄金ETF", assetClass: "gold", role: "黄金：与股票、债券的走势关系较弱，可分散风险" },
];

export const ASSET_BY_SYMBOL: Record<string, UniverseAsset> = Object.fromEntries(UNIVERSE.map((a) => [a.symbol, a]));

export const BENCHMARK = { symbol: "510300.SH", name: "沪深300ETF（100%）" };

export interface PortfolioTemplate {
  id: PathId;
  title: string;
  weights: Record<string, number>;
  note: string;
}

/** 与三条研究路径对应的「研究情景」组合（用于比较与学习，不是推荐配置）。 */
export const TEMPLATES: Record<PathId, PortfolioTemplate> = {
  A: { id: "A", title: "资金安全研究组合", weights: { "511880.SH": 60, "511010.SH": 40 }, note: "以现金管理和债券为主，观察低波动资产的收益与回撤" },
  B: { id: "B", title: "平衡研究组合", weights: { "510300.SH": 35, "511010.SH": 45, "518880.SH": 10, "511880.SH": 10 }, note: "股票、债券、黄金与现金搭配，观察收益与回撤的取舍" },
  C: { id: "C", title: "长期增长研究组合", weights: { "510300.SH": 50, "510500.SH": 20, "511010.SH": 20, "518880.SH": 10 }, note: "以 A 股宽基为主，观察长期增长资产的波动" },
};
