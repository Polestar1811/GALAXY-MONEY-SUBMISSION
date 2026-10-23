import type { AssetSnapshot, FinancialsSnapshot, HistoryPeriod, PriceHistory, SymbolMatch } from "@/types/market";

export type ProviderErrorCode =
  | "UNSUPPORTED_SYMBOL"
  | "UNAUTHORIZED"
  | "UPSTREAM_ERROR"
  | "NOT_IMPLEMENTED"
  | "EMPTY"
  // 第二迭代
  | "NOT_CONFIGURED" // 未配置 API Key（不发起请求）
  | "RATE_LIMITED" // HTTP 429 / code=4001
  | "TIMEOUT" // 本地超时或 code=5002
  | "MALFORMED" // 响应无法按契约解析
  | "BAD_REQUEST" // code=100x
  | "CANCELLED"; // 用户取消

/** 统一的数据源错误。上游失败时必须显式报错，不得静默回退到演示数据。 */
export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderInfo {
  id: "demo" | "fuyao" | "ifind-mcp";
  label: string;
  isDemo: boolean;
}

/**
 * 市场数据提供器契约。
 * 第一迭代：DemoMarketDataProvider（合成数据）。
 * 第二迭代：FuyaoMarketDataProvider（server-only，密钥仅在服务端读取）。
 */
export interface MarketDataProvider {
  readonly info: ProviderInfo;
  search(query: string): Promise<SymbolMatch[]>;
  getSnapshot(symbol: string): Promise<AssetSnapshot>;
  getHistory(symbol: string, period: HistoryPeriod): Promise<PriceHistory>;
  getFinancials(symbol: string): Promise<FinancialsSnapshot>;
  /**
   * V2 组合探索：完整的前复权日收盘序列（只在真实数据源中提供）。
   * 演示数据源不实现此方法，组合历史结果会被明确阻止，而不是用合成数据冒充。
   */
  getDailyCloses?(symbol: string): Promise<{ symbol: string; points: { t: number; close: number }[]; requestId: string | null }>;
}

export const HISTORY_PERIODS: { id: HistoryPeriod; label: string; days: number }[] = [
  { id: "1M", label: "1月", days: 21 },
  { id: "3M", label: "3月", days: 63 },
  { id: "6M", label: "6月", days: 125 },
  { id: "1Y", label: "1年", days: 250 },
  { id: "3Y", label: "3年", days: 750 },
];

export function parseSimulate(v: string | null | undefined): import("@/types/research").SimulateMode {
  return v === "error" || v === "unauthorized" || v === "slow" || v === "empty" ? v : "none";
}
