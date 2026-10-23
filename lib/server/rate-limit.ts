import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ApiErrorBody } from "@/lib/api/respond";
import { logEvent } from "./log";

/**
 * 公网成本与滥用保护：固定窗口限流、并发控制与每日 AI 研究预算。
 *
 * 计数存储：
 * - 配置了 Upstash Redis（Vercel Marketplace 注入 KV_REST_API_URL / KV_REST_API_TOKEN，
 *   或 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）时，所有实例共享同一组计数（shared）。
 * - 未配置或 Redis 请求失败时退回进程内存（instance）：只在单个实例内生效，较弱，但不会放开限制。
 * 访问者以 IP 的 SHA-256 摘要标识，存储中不出现原始 IP。
 */

export interface CounterStore {
  kind: "shared" | "instance";
  /** 计数加一并设置过期时间，返回加一后的值。 */
  incr(key: string, ttlSec: number): Promise<number>;
  decr(key: string): Promise<void>;
}

export class MemoryStore implements CounterStore {
  kind = "instance" as const;
  private map = new Map<string, { n: number; exp: number }>();
  async incr(key: string, ttlSec: number) {
    const now = Date.now();
    const cur = this.map.get(key);
    const n = cur && cur.exp > now ? cur.n + 1 : 1;
    this.map.set(key, { n, exp: now + ttlSec * 1000 });
    if (this.map.size > 5000) for (const [k, v] of this.map) if (v.exp <= now) this.map.delete(k);
    return n;
  }
  async decr(key: string) {
    const cur = this.map.get(key);
    if (cur) cur.n = Math.max(0, cur.n - 1);
  }
}

export class UpstashStore implements CounterStore {
  kind = "shared" as const;
  constructor(
    private url: string,
    private token: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}
  private async pipeline(cmds: (string | number)[][]): Promise<{ result?: unknown; error?: string }[]> {
    const res = await this.fetchImpl(`${this.url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`redis http ${res.status}`);
    return res.json();
  }
  async incr(key: string, ttlSec: number) {
    const [r] = await this.pipeline([["INCR", key], ["EXPIRE", key, ttlSec]]);
    if (r?.error || typeof r?.result !== "number") throw new Error("redis incr failed");
    return r.result;
  }
  async decr(key: string) {
    await this.pipeline([["DECR", key]]);
  }
}

/** 共享存储失败时退回内存计数，并记录一次事件（不含连接信息）。 */
class FallbackStore implements CounterStore {
  constructor(
    private primary: CounterStore,
    private fallback: CounterStore,
  ) {}
  get kind() {
    return this.primary.kind;
  }
  async incr(key: string, ttlSec: number) {
    try {
      return await this.primary.incr(key, ttlSec);
    } catch {
      logEvent("ratelimit.store_error", { op: "incr" });
      return this.fallback.incr(key, ttlSec);
    }
  }
  async decr(key: string) {
    try {
      await this.primary.decr(key);
    } catch {
      logEvent("ratelimit.store_error", { op: "decr" });
      await this.fallback.decr(key);
    }
  }
}

let store: CounterStore | null = null;
export function getStore(): CounterStore {
  if (store) return store;
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)?.trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)?.trim();
  store = url && token ? new FallbackStore(new UpstashStore(url, token), new MemoryStore()) : new MemoryStore();
  return store;
}
/** 测试用：替换或重置存储。 */
export function setStore(s: CounterStore | null) {
  store = s;
}

/** 公开演示的限额。AI 研究每次最多 4 次模型调用；deepseek-flash 关闭思考时每次约 ¥0.01。 */
export const LIMITS = {
  agent: {
    perVisitor: { limit: 12, windowSec: 600 },
    perVisitorDaily: { limit: 60, windowSec: 86_400 },
    globalDaily: { limit: 500, windowSec: 86_400 },
    concurrentPerVisitor: 2,
    concurrentGlobal: 12,
  },
  data: { perVisitor: { limit: 300, windowSec: 600 } },
  /** V2：访谈每轮、人格与路径生成各是一次模型调用（deepseek-flash 关闭思考时每次约 ¥0.003）。 */
  v2: {
    interview: { limit: 40, windowSec: 600 },
    synthesis: { limit: 16, windowSec: 600 },
    perVisitorDaily: { limit: 200, windowSec: 86_400 },
    globalDaily: { limit: 6000, windowSec: 86_400 },
  },
} as const;
/** 并发占位的过期时间：略长于 /api/agent 的 maxDuration，防止实例中断后占位不释放。 */
const SLOT_TTL_SEC = 330;

export function visitorId(req: Request): string {
  const h = req.headers;
  const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export type LimitCode = "RATE_LIMITED" | "BUDGET_EXHAUSTED" | "TOO_MANY_CONCURRENT";
export interface Denied {
  code: LimitCode;
  message: string;
  retryAfterSec: number;
}

async function windowHit(s: CounterStore, name: string, limit: number, windowSec: number, now = Date.now()) {
  const bucket = Math.floor(now / 1000 / windowSec);
  const n = await s.incr(`rl:${name}:${bucket}`, windowSec + 5);
  const retryAfterSec = Math.max(1, (bucket + 1) * windowSec - Math.floor(now / 1000));
  return { over: n > limit, retryAfterSec };
}

const minutes = (sec: number) => Math.max(1, Math.ceil(sec / 60));

/**
 * 本机自动化测试（同一 IP 在数分钟内发出数百次请求）可设置 INVESTLENS_RATE_LIMIT=off 关闭限流；
 * 在 Vercel 上（VERCEL=1）该开关被忽略，线上始终限流。
 */
export function rateLimitEnabled() {
  return process.env.VERCEL === "1" || process.env.INVESTLENS_RATE_LIMIT?.trim().toLowerCase() !== "off";
}

/** 行情与规则研究接口：只有按访问者的频率限制（不产生模型费用）。 */
export async function checkDataLimit(req: Request): Promise<Denied | null> {
  if (!rateLimitEnabled()) return null;
  const { limit, windowSec } = LIMITS.data.perVisitor;
  const r = await windowHit(getStore(), `data:${visitorId(req)}`, limit, windowSec);
  if (!r.over) return null;
  logEvent("ratelimit.denied", { scope: "data" });
  return { code: "RATE_LIMITED", message: `请求过于频繁，请在约 ${minutes(r.retryAfterSec)} 分钟后再试。`, retryAfterSec: r.retryAfterSec };
}

/** AI 研究：按访问者计次（包括格式错误的请求），在请求体解析之前调用。 */
export async function checkAgentRate(req: Request): Promise<Denied | null> {
  if (!rateLimitEnabled()) return null;
  const s = getStore();
  const id = visitorId(req);
  const { perVisitor, perVisitorDaily } = LIMITS.agent;
  const w = await windowHit(s, `agent:${id}`, perVisitor.limit, perVisitor.windowSec);
  if (w.over) {
    logEvent("ratelimit.denied", { scope: "agent.window" });
    return {
      code: "RATE_LIMITED",
      message: `AI 研究请求过于频繁：每位访问者每 ${perVisitor.windowSec / 60} 分钟最多 ${perVisitor.limit} 次，请在约 ${minutes(w.retryAfterSec)} 分钟后再试。行情与规则研究不受影响。`,
      retryAfterSec: w.retryAfterSec,
    };
  }
  const d = await windowHit(s, `agent-day:${id}`, perVisitorDaily.limit, perVisitorDaily.windowSec);
  if (d.over) {
    logEvent("ratelimit.denied", { scope: "agent.daily" });
    return { code: "RATE_LIMITED", message: `今天的 AI 研究次数已达上限（每位访问者 ${perVisitorDaily.limit} 次），请明天再试。`, retryAfterSec: d.retryAfterSec };
  }
  return null;
}

/** V2 模型调用（访谈 / 人格 / 路径）：按访谈或生成类别计次，并共享每位访问者与全站的每日预算。 */
export async function checkV2Rate(req: Request, scope: "interview" | "synthesis"): Promise<Denied | null> {
  if (!rateLimitEnabled()) return null;
  const s = getStore();
  const id = visitorId(req);
  const { perVisitorDaily, globalDaily } = LIMITS.v2;
  const w = LIMITS.v2[scope];
  const a = await windowHit(s, `v2-${scope}:${id}`, w.limit, w.windowSec);
  if (a.over) {
    logEvent("ratelimit.denied", { scope: `v2.${scope}` });
    return { code: "RATE_LIMITED", message: `请求过于频繁，请在约 ${minutes(a.retryAfterSec)} 分钟后再继续。你已经回答的内容不会丢失。`, retryAfterSec: a.retryAfterSec };
  }
  const d = await windowHit(s, `v2-day:${id}`, perVisitorDaily.limit, perVisitorDaily.windowSec);
  if (d.over) {
    logEvent("ratelimit.denied", { scope: "v2.daily" });
    return { code: "RATE_LIMITED", message: "今天的 AI 对话次数已达上限，请明天再继续。已回答的内容仍保留在当前页面。", retryAfterSec: d.retryAfterSec };
  }
  const g = await windowHit(s, "v2-budget", globalDaily.limit, globalDaily.windowSec);
  if (g.over) {
    logEvent("ratelimit.denied", { scope: "v2.budget" });
    return { code: "BUDGET_EXHAUSTED", message: "今日公开演示的 AI 额度已用完，请明天再试。你可以先用快捷选项完成访谈。", retryAfterSec: g.retryAfterSec };
  }
  return null;
}

export interface Slot {
  release(): Promise<void>;
}

/**
 * 请求体校验通过、即将调用模型时：占用全站每日预算与并发位。
 * 返回 Slot（研究结束或取消时必须 release）或拒绝原因。
 */
export async function acquireAgentRun(req: Request): Promise<Slot | Denied> {
  if (!rateLimitEnabled()) return { release: async () => {} };
  const s = getStore();
  const id = visitorId(req);
  const { globalDaily, concurrentPerVisitor, concurrentGlobal } = LIMITS.agent;

  const budget = await windowHit(s, "agent-budget", globalDaily.limit, globalDaily.windowSec);
  if (budget.over) {
    logEvent("ratelimit.denied", { scope: "agent.budget" });
    return { code: "BUDGET_EXHAUSTED", message: "今日公开演示的 AI 研究额度已用完，请明天再试。行情、事实与规则研究仍可正常使用。", retryAfterSec: budget.retryAfterSec };
  }

  const mine = `cc:agent:${id}`;
  const all = "cc:agent:all";
  const nMine = await s.incr(mine, SLOT_TTL_SEC);
  const nAll = await s.incr(all, SLOT_TTL_SEC);
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await Promise.all([s.decr(mine), s.decr(all)]).catch(() => {});
  };
  if (nMine > concurrentPerVisitor || nAll > concurrentGlobal) {
    await release();
    logEvent("ratelimit.denied", { scope: nMine > concurrentPerVisitor ? "agent.concurrent" : "agent.concurrent_global" });
    return {
      code: "TOO_MANY_CONCURRENT",
      message: nMine > concurrentPerVisitor ? "你已有研究正在进行，请等待完成或取消后再试。" : "当前同时进行的研究较多，请稍后再试。",
      retryAfterSec: 10,
    };
  }
  return { release };
}

export function isDenied(x: Slot | Denied | null): x is Denied {
  return !!x && "code" in x;
}

export function tooMany(d: Denied) {
  return NextResponse.json<ApiErrorBody>(
    { error: { code: d.code, message: d.message, retryable: true } },
    { status: 429, headers: { "Retry-After": String(d.retryAfterSec), "Cache-Control": "no-store" } },
  );
}
