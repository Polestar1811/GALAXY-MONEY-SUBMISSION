"use client";

import type { AssetSnapshot, HistoryPeriod, PriceHistory, SymbolMatch } from "@/types/market";
import type { InvestorProfile } from "@/types/profile";
import type { BriefResult, ResearchResult, SimulateMode } from "@/types/research";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("NETWORK", "网络连接失败，请检查本地服务是否运行。", true, 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.code ?? "INTERNAL", body?.error?.message ?? `请求失败（${res.status}）`, body?.error?.retryable ?? true, res.status);
  }
  return res.json() as Promise<T>;
}

const sim = (s?: SimulateMode) => (s && s !== "none" ? `simulate=${s}` : "");

export const api = {
  search: (q: string) => request<SymbolMatch[]>(`/api/market/search?q=${encodeURIComponent(q)}`),
  snapshot: (symbol: string, s?: SimulateMode) =>
    request<AssetSnapshot>(`/api/market/${encodeURIComponent(symbol)}/snapshot?${sim(s)}`),
  history: (symbol: string, period: HistoryPeriod, s?: SimulateMode) =>
    request<PriceHistory>(`/api/market/${encodeURIComponent(symbol)}/history?period=${period}&${sim(s)}`),
  research: (symbol: string, profile: InvestorProfile | null, question = "", simulate?: SimulateMode) =>
    request<ResearchResult>("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, profile, question, simulate, mode: "research" }),
    }),
  brief: (symbol: string, profile: InvestorProfile | null) =>
    request<BriefResult>("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, profile, mode: "brief" }),
    }),
};
