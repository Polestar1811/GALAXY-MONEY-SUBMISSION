import { setDefaultResultOrder } from "node:dns";
import { z } from "zod";
import { logEvent } from "@/lib/server/log";
import { ProviderError, type ProviderErrorCode } from "../types";

// 扶摇域名同时解析出 IPv4 与 IPv6；云函数（Vercel / AWS）通常没有 IPv6 出口，
// 先尝试 IPv6 可能一直挂起到连接超时（公网部署实测：本机正常，Vercel 上约 10 秒后连接失败）。
setDefaultResultOrder("ipv4first");

/**
 * 同花顺扶摇金融数据 API 的最小 HTTP 客户端（仅服务端）。
 * 文档：https://fuyao.aicubes.cn/docs/api-reference/overview/
 *
 * - 鉴权：请求头 X-api-key（只从服务端环境变量读取）。
 * - 统一 ApiResponse 信封：{ code, message, request_id, data }；HTTP 通常恒为 200，必须检查业务 code。
 * - 实测：缺少 X-api-key 时线上返回 code=2003 "Missing X-api-key"（文档写为 2001），两者都按鉴权失败处理。
 */
export interface FuyaoConfig {
  apiKey: string | null;
  baseUrl: string;
  timeoutMs: number;
  /** 历史日线单独的超时：实测同一请求耗时 2.3–12.2 秒波动，统一 10 秒会间歇失败。 */
  historyTimeoutMs?: number;
  /** 瞬时错误重试前的退避时间（默认 800ms）。 */
  retryDelayMs?: number;
  /** 首次请求超时后的重试超时（默认 15000ms）。实测快照通常 0.4 秒，但偶有 4–10 秒以上的长尾。 */
  retryTimeoutMs?: number;
  /**
   * Vercel → 中转 Worker 的内部认证 Secret（FUYAO_RELAY_SECRET）。
   * 只在 baseUrl 不是扶摇官方地址（即指向中转）时随请求头发送，绝不发给扶摇本身。
   */
  relaySecret?: string | null;
  fetchImpl?: typeof fetch;
}

export const FUYAO_OFFICIAL_BASE = "https://fuyao.aicubes.cn";

export const FUYAO_DOCS = {
  snapshot: "https://fuyao.aicubes.cn/docs/api-reference/fund-market/",
  historical: "https://fuyao.aicubes.cn/docs/api-reference/fund-market/",
  profile: "https://fuyao.aicubes.cn/docs/api-reference/fund-profile/",
  indicators: "https://fuyao.aicubes.cn/docs/api-reference/fund-performance/",
  news: "https://fuyao.aicubes.cn/docs/api-reference/fund-news/",
} as const;

export function fuyaoConfigFromEnv(): FuyaoConfig {
  const key = process.env.FUYAO_API_KEY?.trim();
  return {
    apiKey: key ? key : null,
    baseUrl: (process.env.FUYAO_BASE_URL?.trim() || FUYAO_OFFICIAL_BASE).replace(/\/+$/, ""),
    relaySecret: process.env.FUYAO_RELAY_SECRET?.trim() || null,
    timeoutMs: Number(process.env.FUYAO_TIMEOUT_MS) > 0 ? Number(process.env.FUYAO_TIMEOUT_MS) : 6_000,
    retryTimeoutMs: Number(process.env.FUYAO_RETRY_TIMEOUT_MS) > 0 ? Number(process.env.FUYAO_RETRY_TIMEOUT_MS) : 15_000,
    historyTimeoutMs: Number(process.env.FUYAO_HISTORY_TIMEOUT_MS) > 0 ? Number(process.env.FUYAO_HISTORY_TIMEOUT_MS) : 30_000,
  };
}

const envelopeSchema = z.object({
  code: z.number(),
  message: z.string().nullish(),
  request_id: z.string().nullish(),
  data: z.unknown().nullish(),
});

/** 业务 code → 统一错误。 */
export function mapFuyaoCode(code: number, message: string): { code: ProviderErrorCode; message: string; retryable: boolean } {
  const m = message || "未知错误";
  if (code === 2001 || code === 2003) {
    const missing = /missing/i.test(m);
    return {
      code: "UNAUTHORIZED",
      message: missing ? `扶摇鉴权失败：请求未携带有效 API Key（code=${code}）` : `扶摇鉴权失败或无权访问该能力（code=${code}：${m}）`,
      retryable: false,
    };
  }
  if (code === 3001) return { code: "UNSUPPORTED_SYMBOL", message: `扶摇：标的不存在（code=3001）`, retryable: false };
  if (code === 3004) return { code: "UNSUPPORTED_SYMBOL", message: `扶摇：该标的类型不支持此能力（code=3004）`, retryable: false };
  if (code === 3002) return { code: "EMPTY", message: `扶摇：标的存在但暂无可用数据（code=3002）`, retryable: true };
  if (code === 4001) return { code: "RATE_LIMITED", message: `扶摇：请求频率超限（code=4001），请稍后再试`, retryable: true };
  if (code === 5002) return { code: "TIMEOUT", message: `扶摇：上游数据源超时（code=5002）`, retryable: true };
  if (code >= 1001 && code <= 1004) return { code: "BAD_REQUEST", message: `扶摇：请求参数错误（code=${code}：${m}）`, retryable: false };
  return { code: "UPSTREAM_ERROR", message: `扶摇：数据服务异常（code=${code}：${m}）`, retryable: true };
}

export interface FuyaoResult<T> {
  data: T;
  requestId: string | null;
}

/**
 * 发起 GET 请求并解析信封；任何异常都抛出 ProviderError，绝不返回替代数据。
 * 重试策略（最多 2 次尝试）：
 * - 超时：首次用较短超时，重试用较长超时，应对实测的长尾延迟；
 * - 瞬时上游错误（5003 / 限流）：退避后重试一次。
 * 历史日线可传入单次尝试（timeouts 只含一个值），因为其正常耗时本身就在 2–12 秒。
 */
export async function fuyaoGet<S extends z.ZodTypeAny>(
  cfg: FuyaoConfig,
  path: string,
  params: Record<string, string | number>,
  dataSchema: S,
  signal?: AbortSignal,
  opts: { timeouts?: number[]; retryDelayMs?: number } = {},
): Promise<FuyaoResult<z.output<S>>> {
  const timeouts = opts.timeouts ?? [cfg.timeoutMs, cfg.retryTimeoutMs ?? Math.max(cfg.timeoutMs, 15_000)];
  for (let i = 0; ; i++) {
    try {
      return await fuyaoGetOnce(cfg, path, params, dataSchema, signal, timeouts[i]);
    } catch (e) {
      const last = i >= timeouts.length - 1;
      const retryable = e instanceof ProviderError && (e.code === "TIMEOUT" || e.code === "UPSTREAM_ERROR" || e.code === "RATE_LIMITED");
      if (last || !retryable || signal?.aborted) throw e;
      logEvent("fuyao.retry", { path, code: (e as ProviderError).code, attempt: i + 2 });
      if ((e as ProviderError).code !== "TIMEOUT") await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? cfg.retryDelayMs ?? 800));
    }
  }
}

async function fuyaoGetOnce<S extends z.ZodTypeAny>(
  cfg: FuyaoConfig,
  path: string,
  params: Record<string, string | number>,
  dataSchema: S,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<FuyaoResult<z.output<S>>> {
  if (!cfg.apiKey) throw new ProviderError("NOT_CONFIGURED", "未配置 FUYAO_API_KEY，未发起任何真实请求。");
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const url = `${cfg.baseUrl}${path}?${qs}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  const onAbort = () => ctrl.abort(new Error("cancelled"));
  signal?.addEventListener("abort", onAbort, { once: true });
  const started = Date.now();

  let res: Response;
  let text: string;
  try {
    const headers: Record<string, string> = { "X-api-key": cfg.apiKey, Accept: "application/json" };
    if (cfg.relaySecret && new URL(cfg.baseUrl).origin !== FUYAO_OFFICIAL_BASE) headers["X-Relay-Secret"] = cfg.relaySecret;
    res = await (cfg.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers,
      signal: ctrl.signal,
      cache: "no-store",
    });
    // 超时同样覆盖响应体读取
    text = await res.text();
  } catch (e) {
    const cancelled = signal?.aborted;
    const timedOut = !cancelled && ctrl.signal.aborted;
    // 底层网络错误码（如 UND_ERR_CONNECT_TIMEOUT、ENETUNREACH、ECONNRESET）只含错误类型，不含请求头或密钥
    const cause = (e as { cause?: { code?: string } })?.cause?.code ?? (e instanceof Error ? e.name : "unknown");
    logEvent("fuyao.request.failed", { path, reason: cancelled ? "cancelled" : timedOut ? "timeout" : "network", cause, ms: Date.now() - started });
    if (cancelled) throw new ProviderError("CANCELLED", "请求已取消");
    if (timedOut) throw new ProviderError("TIMEOUT", `扶摇请求超时（${path}，>${timeoutMs}ms）`, true);
    throw new ProviderError("TIMEOUT", `扶摇网络不可达（${path}，${cause}）`, true);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (res.status === 429) {
    logEvent("fuyao.request", { path, http: 429, ms: Date.now() - started });
    throw new ProviderError("RATE_LIMITED", "扶摇：HTTP 429 请求被限流，请稍后再试", true);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    logEvent("fuyao.request", { path, http: res.status, parse: "non_json", ms: Date.now() - started });
    throw new ProviderError("MALFORMED", `扶摇：响应不是合法 JSON（HTTP ${res.status}）`, true);
  }

  const env = envelopeSchema.safeParse(raw);
  if (!env.success) {
    logEvent("fuyao.request", { path, http: res.status, parse: "bad_envelope", ms: Date.now() - started });
    throw new ProviderError("MALFORMED", "扶摇：响应信封格式不符合 ApiResponse 契约", true);
  }
  const requestId = env.data.request_id ?? null;
  logEvent("fuyao.request", { path, http: res.status, code: env.data.code, requestId, ms: Date.now() - started });

  if (env.data.code !== 0) {
    const m = mapFuyaoCode(env.data.code, env.data.message ?? "");
    throw new ProviderError(m.code, m.message, m.retryable);
  }
  if (env.data.data === null || env.data.data === undefined) {
    throw new ProviderError("EMPTY", "扶摇：成功响应但 data 为空");
  }
  const parsed = dataSchema.safeParse(env.data.data);
  if (!parsed.success) {
    throw new ProviderError("MALFORMED", `扶摇：${path} 数据字段不符合文档契约`, true);
  }
  return { data: parsed.data as z.output<S>, requestId };
}

/* ---------------- 各接口 data 结构（按官方文档，全部字段允许 null） ---------------- */

const num = z.number().nullish().transform((v) => (v === undefined ? null : v));
const str = z.string().nullish().transform((v) => (v === undefined ? null : v));

export const snapshotDataSchema = z.object({
  timestamp: num,
  item: z.array(
    z.object({
      thscode: z.string(),
      ticker: str,
      last_price: num,
      open_price: num,
      high_price: num,
      low_price: num,
      prev_price: num,
      price_change_ratio_pct: num,
      price_change: num,
      price_amplitude_ratio_pct: num,
      volume: num,
      turnover: num,
      turnover_ratio_pct: num,
    }),
  ),
});
export type SnapshotData = z.infer<typeof snapshotDataSchema>;

export const historyDataSchema = z.object({
  timestamp: num,
  thscode: str,
  interval: str,
  adjust: z.unknown().nullish(),
  item: z.array(
    z.object({
      date_ms: z.number(),
      open_price: num,
      high_price: num,
      low_price: num,
      close_price: num,
      volume: num,
      turnover: num,
    }),
  ),
});
export type HistoryData = z.infer<typeof historyDataSchema>;

export const profileDataSchema = z.object({
  timestamp: num,
  item: z.array(
    z.object({
      thscode: z.string(),
      fund_name: str,
      estab_date: num,
      mgmt_name: str,
      manager_name: str,
      fund_scale: num,
      unit_nav: num,
    }),
  ),
});
export type ProfileData = z.infer<typeof profileDataSchema>;

export const indicatorsDataSchema = z.object({
  timestamp: num,
  item: z.array(
    z.object({
      date_ms: z.number(),
      track_index_pe_ttm_five_year_percentile: num,
    }),
  ),
});
export type IndicatorsData = z.infer<typeof indicatorsDataSchema>;

export const newsDataSchema = z.object({
  timestamp: num,
  has_more: z.boolean().nullish(),
  item: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      title: z.string(),
      summary: str,
      source: str,
      url: str,
      publish_time_ms: num,
    }),
  ),
});
export type NewsData = z.infer<typeof newsDataSchema>;
