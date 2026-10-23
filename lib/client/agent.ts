"use client";

import { useEffect, useState } from "react";
import type { InvestorProfile } from "@/types/profile";
import type { AgentEvent } from "@/lib/agent/schema";
import type { StatusBody } from "@/app/api/status/route";

export type { StatusBody };

let statusCache: StatusBody | null = null;

/** 运行状态（数据模式、LLM 是否配置）。只包含布尔值与模型名。 */
export function useStatus() {
  const [status, setStatus] = useState<StatusBody | null>(statusCache);
  useEffect(() => {
    if (statusCache) return;
    let alive = true;
    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: StatusBody) => {
        statusCache = s;
        if (alive) setStatus(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

export interface AgentRunRequest {
  symbol: string;
  question: string;
  profile: InvestorProfile | null;
  snapshotId?: string | null;
  followUp?: { question: string; summary: string } | null;
}

/** 调用 /api/agent 并逐行读取 NDJSON 事件；signal 中止即取消服务端研究。 */
export async function runAgent(req: AgentRunRequest, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch {
    if (signal.aborted) return onEvent({ type: "error", code: "CANCELLED", message: "研究已取消" });
    return onEvent({ type: "error", code: "NETWORK", message: "网络连接失败" });
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    return onEvent({ type: "error", code: body?.error?.code ?? "INTERNAL", message: body?.error?.message ?? `请求失败（${res.status}）` });
  }
  const reader = res.body.getReader();
  // 显式取消读取：触发服务端流的 cancel()，从而中止进行中的模型与数据请求
  const onAbort = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", onAbort, { once: true });
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) return onEvent({ type: "error", code: "CANCELLED", message: "研究已取消" });
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) onEvent(JSON.parse(line) as AgentEvent);
      }
    }
    if (buf.trim()) onEvent(JSON.parse(buf) as AgentEvent);
  } catch {
    if (signal.aborted) onEvent({ type: "error", code: "CANCELLED", message: "研究已取消" });
    else onEvent({ type: "error", code: "STREAM", message: "研究结果传输中断" });
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
