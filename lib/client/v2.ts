"use client";

import type { IdentityNarrative, IdentityProfile, InterviewState, PathsResult } from "@/types/identity";
import type { PortfolioResponse } from "@/lib/portfolio/service";

export class V2Error extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal, cache: "no-store" });
  } catch {
    if (signal?.aborted) throw new V2Error("CANCELLED", "已取消", 0);
    throw new V2Error("NETWORK", "网络连接失败，请稍后重试。你已经回答的内容不会丢失。", 0);
  }
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new V2Error(b?.error?.code ?? "INTERNAL", b?.error?.message ?? `请求失败（${res.status}）`, res.status);
  }
  return res.json() as Promise<T>;
}

export const v2api = {
  interviewTurn: (state: InterviewState, answer: { text: string; choice: string | null }, signal?: AbortSignal) =>
    post<{ state: InterviewState; ai: "llm" | "fallback"; llmError: string | null }>("/api/v2/interview", { state, answer }, signal),
  identity: (profile: IdentityProfile, signal?: AbortSignal) => post<{ narrative: IdentityNarrative }>("/api/v2/identity", { profile }, signal),
  paths: (profile: IdentityProfile, signal?: AbortSignal) => post<PathsResult>("/api/v2/paths", { profile }, signal),
  portfolio: (weights: Record<string, number>, rebalance: "monthly" | "none", signal?: AbortSignal) => post<PortfolioResponse>("/api/v2/portfolio", { weights, rebalance }, signal),
};
