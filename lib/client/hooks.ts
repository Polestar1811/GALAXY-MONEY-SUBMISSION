"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryPeriod } from "@/types/market";
import type { InvestorProfile } from "@/types/profile";
import type { SimulateMode } from "@/types/research";
import { ApiError, api } from "./api";

export type AsyncState<T> =
  | { status: "loading"; data: T | null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: ApiError };

const cache = new Map<string, unknown>();

/** 带缓存的异步数据 hook：切换画像时命中缓存可即时切换，并保留上一次数据避免闪烁。 */
export function useAsync<T>(key: string | null, fetcher: () => Promise<T>, { cacheable = true } = {}) {
  const [state, setState] = useState<AsyncState<T>>(() =>
    key && cacheable && cache.has(key)
      ? { status: "success", data: cache.get(key) as T, error: null }
      : { status: "loading", data: null, error: null },
  );
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!key) return;
    if (cacheable && cache.has(key) && nonce === 0) {
      setState({ status: "success", data: cache.get(key) as T, error: null });
      return;
    }
    let alive = true;
    setState((s) => ({ status: "loading", data: s.data, error: null }));
    fetcherRef
      .current()
      .then((data) => {
        if (!alive) return;
        if (cacheable) cache.set(key, data);
        setState({ status: "success", data, error: null });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const err = e instanceof ApiError ? e : new ApiError("INTERNAL", String(e), true, 0);
        setState({ status: "error", data: null, error: err });
      });
    return () => {
      alive = false;
    };
  }, [key, nonce, cacheable]);

  const reload = useCallback(() => {
    if (key) cache.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  return { ...state, reload };
}

/** 画像缓存键：只取参与个性化的字段，保证同一画像命中同一缓存。 */
export function profileKey(p: InvestorProfile | null): string {
  if (!p) return "none";
  const { id, goal, horizon, experience, riskWillingness, lossCapacity, liquidityNeed, emergencyReserve, incomeStability, status } = p;
  return JSON.stringify([id, goal, horizon, experience, riskWillingness, lossCapacity, liquidityNeed, emergencyReserve, incomeStability, status]);
}

export function useResearch(symbol: string, profile: InvestorProfile | null, simulate: SimulateMode = "none") {
  const cacheable = simulate === "none";
  return useAsync(
    `research:${symbol}:${profileKey(profile)}:${simulate}`,
    () => api.research(symbol, profile, "", simulate),
    { cacheable },
  );
}

export function useBrief(symbol: string, profile: InvestorProfile | null) {
  return useAsync(`brief:${symbol}:${profileKey(profile)}`, () => api.brief(symbol, profile));
}

export function useHistory(symbol: string, period: HistoryPeriod, simulate: SimulateMode = "none") {
  return useAsync(`history:${symbol}:${period}:${simulate}`, () => api.history(symbol, period, simulate), {
    cacheable: simulate === "none",
  });
}

export function useSnapshot(symbol: string, simulate: SimulateMode = "none") {
  return useAsync(`snapshot:${symbol}:${simulate}`, () => api.snapshot(symbol, simulate), { cacheable: simulate === "none" });
}
