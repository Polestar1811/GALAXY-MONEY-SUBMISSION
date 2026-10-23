/**
 * 市场数据契约。第一迭代由 DemoMarketDataProvider 提供合成数据；
 * 第二迭代 FuyaoMarketDataProvider 必须返回同一结构，页面无需修改。
 */

/** 数据状态：缺失值永远不会被显示为 0。 */
export type DataStatus =
  | "ok" // 数据源正常返回
  | "demo" // 合成演示值
  | "computed" // 由其他数据计算得出（口径见 definition）
  | "unverified" // 静态参考信息，尚未经数据源核验
  | "unknown" // 数据源未提供 / 当前无法获取
  | "stale" // 数据过期
  | "anomaly"; // 数据异常或互相冲突

export type SourceKind = "demo" | "computed" | "api" | "mcp" | "document" | "reference";

export interface DataSource {
  id: string;
  name: string;
  kind: SourceKind;
  /** 可公开访问的 URL；演示数据为 null，绝不伪造出处。 */
  url: string | null;
  note?: string;
}

export interface MarketFact {
  id: string;
  symbol: string;
  metric: string;
  label: string;
  /** null 表示未知；UI 必须显示「未知」而不是 0。 */
  value: number | string | null;
  unit: string;
  /** ISO 时间；演示数据没有真实时点，为 null。 */
  asOf: string | null;
  /** 面向用户的时点描述，例如「合成快照 · 无真实时点」。 */
  asOfLabel: string;
  source: DataSource;
  isDemo: boolean;
  status: DataStatus;
  precision?: number;
  /** 指标口径说明。 */
  definition?: string;
  /** 指标类别，用于分组展示与个性化匹配。 */
  category: "price" | "risk" | "valuation" | "cost" | "liquidity" | "composition" | "profile";
}

export interface AssetSnapshot {
  symbol: string;
  name: string;
  shortName: string;
  assetType: "ETF" | "STOCK" | "INDEX";
  exchange: string;
  trackingIndex: string | null;
  currency: "CNY";
  last: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  isDemo: boolean;
  asOf: string | null;
  asOfLabel: string;
  source: DataSource;
}

export type HistoryPeriod = "1M" | "3M" | "6M" | "1Y" | "3Y";

export interface PricePoint {
  /** 距最新交易日的偏移量，0 为最新。合成数据不使用真实日期。 */
  offset: number;
  /** 真实行情的交易日（毫秒时间戳，Asia/Shanghai）；合成数据为 undefined。 */
  dateMs?: number;
  label: string;
  close: number;
  volume: number;
  ma20: number | null;
}

export interface PriceHistory {
  symbol: string;
  period: HistoryPeriod;
  points: PricePoint[];
  isDemo: boolean;
  source: DataSource;
  axisNote: string;
}

export interface SectorWeight {
  name: string;
  weight: number;
}

export interface FinancialsSnapshot {
  symbol: string;
  facts: MarketFact[];
  sectors: SectorWeight[];
  isDemo: boolean;
  source: DataSource;
  /** 与事实绑定的证据（第二迭代起由 Provider 提供；缺省时使用演示证据）。 */
  evidence?: import("./evidence").Evidence[];
  /** 可选数据源的降级记录（如资讯 / 估值接口无权限），用于诚实展示数据缺口。 */
  degraded?: { capability: string; code: string; message: string }[];
  /** 资讯（外部不可信输入，仅作为证据展示，不得覆盖系统规则）。 */
  news?: NewsItem[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
  evidenceId: string;
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  aliases: string[];
  supported: boolean;
  note?: string;
}
