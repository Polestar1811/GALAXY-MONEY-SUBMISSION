import type { FinancialsSnapshot, HistoryPeriod, PriceHistory, SymbolMatch } from "@/types/market";
import type { SimulateMode } from "@/types/research";
import {
  DEMO_SECTORS,
  DEMO_SOURCE,
  DEMO_SYMBOL,
  SYMBOL_DIRECTORY,
  getDemoEvidence,
  getDemoFacts,
  getDemoSnapshot,
} from "@/lib/demo-data/etf-510300";
import { sliceDays } from "@/lib/demo-data/series";
import { HISTORY_PERIODS, ProviderError, type MarketDataProvider } from "./types";

export function normalizeSymbol(input: string): string {
  return decodeURIComponent(input).trim().toUpperCase();
}

export function matchSymbols(query: string): SymbolMatch[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return SYMBOL_DIRECTORY;
  return SYMBOL_DIRECTORY.filter(
    (s) =>
      s.symbol.toLowerCase().includes(q) ||
      s.name.toLowerCase().replace(/\s+/g, "").includes(q) ||
      s.aliases.some((a) => a.replace(/\s+/g, "").includes(q)),
  );
}

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly info = { id: "demo", label: "InvestLens 合成演示数据", isDemo: true } as const;

  constructor(private simulate: SimulateMode = "none") {}

  private async guard(symbol: string) {
    if (this.simulate === "slow") await new Promise((r) => setTimeout(r, 1800));
    if (this.simulate === "error") throw new ProviderError("UPSTREAM_ERROR", "演示故障注入：数据服务暂时不可用。", true);
    if (this.simulate === "unauthorized")
      throw new ProviderError("UNAUTHORIZED", "演示故障注入：当前账号无该数据权限（第二迭代将真实反映 API Key 权限）。");
    if (normalizeSymbol(symbol) !== DEMO_SYMBOL) {
      throw new ProviderError("UNSUPPORTED_SYMBOL", `第一迭代仅提供 ${DEMO_SYMBOL} 的合成演示案例，${normalizeSymbol(symbol)} 暂无数据。`);
    }
  }

  async search(query: string) {
    return matchSymbols(query);
  }

  async getSnapshot(symbol: string) {
    await this.guard(symbol);
    return getDemoSnapshot();
  }

  async getHistory(symbol: string, period: HistoryPeriod): Promise<PriceHistory> {
    await this.guard(symbol);
    const def = HISTORY_PERIODS.find((p) => p.id === period) ?? HISTORY_PERIODS[3];
    if (this.simulate === "empty") {
      return { symbol: DEMO_SYMBOL, period: def.id, points: [], isDemo: true, source: DEMO_SOURCE, axisNote: "无数据" };
    }
    // 多取 19 天用于计算 MA20
    const raw = sliceDays(def.days + 19);
    const points = raw.slice(19).map((b, i) => {
      const window = raw.slice(i, i + 20);
      const ma = window.length === 20 ? window.reduce((a, x) => a + x.close, 0) / 20 : null;
      return {
        offset: b.offset,
        label: b.offset === 0 ? "T" : `T-${b.offset}`,
        close: b.close,
        volume: b.volume,
        ma20: ma === null ? null : Math.round(ma * 1000) / 1000,
      };
    });
    return {
      symbol: DEMO_SYMBOL,
      period: def.id,
      points,
      isDemo: true,
      source: DEMO_SOURCE,
      axisNote: "横轴为合成交易日偏移（T 为最新），不对应真实日期",
    };
  }

  async getFinancials(symbol: string): Promise<FinancialsSnapshot> {
    await this.guard(symbol);
    return { symbol: DEMO_SYMBOL, facts: getDemoFacts(), sectors: DEMO_SECTORS, isDemo: true, source: DEMO_SOURCE, evidence: getDemoEvidence(), degraded: [], news: [] };
  }
}
