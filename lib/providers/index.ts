import type { SimulateMode } from "@/types/research";
import { DemoMarketDataProvider } from "./demo-provider";
import { FuyaoMarketDataProvider } from "./fuyao-provider";
import type { MarketDataProvider } from "./types";

export type DataMode = "demo" | "fuyao";

/**
 * 数据模式由服务端配置决定，并在 UI 中明确展示：
 * - MARKET_DATA_PROVIDER=fuyao：始终使用扶摇；未配置 Key 时报错「未配置」，不回退演示数据。
 * - MARKET_DATA_PROVIDER=demo：始终使用合成演示数据（UI 标注「演示数据」）。
 * - 未设置 / auto：配置了 FUYAO_API_KEY 则用扶摇，否则用演示数据。
 * 真实调用失败时一律显式报错，绝不静默切换到演示数据。
 */
export function resolveDataMode(): DataMode {
  const m = (process.env.MARKET_DATA_PROVIDER ?? "auto").trim().toLowerCase();
  if (m === "demo") return "demo";
  if (m === "fuyao") return "fuyao";
  return process.env.FUYAO_API_KEY?.trim() ? "fuyao" : "demo";
}

export function getMarketDataProvider(simulate: SimulateMode = "none", signal?: AbortSignal): MarketDataProvider {
  // 故障注入只作用于演示模式，真实模式下忽略
  return resolveDataMode() === "fuyao" ? new FuyaoMarketDataProvider(undefined, signal) : new DemoMarketDataProvider(simulate);
}

export { ProviderError, parseSimulate } from "./types";
