/**
 * InvestLens → 同花顺扶摇 中转 Worker（Cloudflare Workers，workers.dev 地址，不绑定任何自定义域名）。
 *
 * 用途：Vercel 部分出口 IP 无法与扶摇建立 TCP 连接（实测），由 Cloudflare 出口代为请求。
 * 约束：
 * - 只接受携带正确 X-Relay-Secret 的请求（Vercel → Worker 的内部认证），否则 403；
 * - 只允许 GET，且路径必须在白名单内（InvestLens 实际使用的 5 个只读接口），不接受任意 URL；
 * - 扶摇 Key 只在请求头 X-api-key 中由 Vercel 服务端传入，Worker 不保存、不记录、不改写；
 * - 不输出任何日志（wrangler.toml 中关闭 observability）。
 */

export interface RelayEnv {
  /** Vercel → Worker 的共享 Secret，在 Cloudflare 控制台以 Secret 形式设置，不写入代码。 */
  RELAY_SECRET?: string;
}

export const UPSTREAM = "https://fuyao.aicubes.cn";

export const ALLOWED_PATHS = new Set([
  "/api/fund/market/snapshot",
  "/api/fund/market/historical",
  "/api/fund/profile/detail",
  "/api/fund/performance/indicators-historical",
  "/api/fund/news/article-list",
]);

/** 等长比较，避免按字节提前返回造成的时序差异。 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (status: number, code: string) =>
  new Response(JSON.stringify({ relay: true, error: code }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function handleRelay(req: Request, env: RelayEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const secret = env.RELAY_SECRET ?? "";
  const given = req.headers.get("x-relay-secret") ?? "";
  // 未设置 Secret 时一律拒绝，避免误部署成开放代理
  if (secret.length < 32 || !safeEqual(given, secret)) return json(403, "forbidden");
  if (req.method !== "GET") return json(405, "method_not_allowed");

  const url = new URL(req.url);
  if (!ALLOWED_PATHS.has(url.pathname)) return json(403, "path_not_allowed");
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return json(400, "missing_api_key");

  const started = Date.now();
  try {
    const upstream = await fetchImpl(`${UPSTREAM}${url.pathname}${url.search}`, {
      method: "GET",
      headers: { "X-api-key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
    // 只透传状态码、正文与内容类型；附带中转耗时与 Cloudflare 节点，便于对比连通性
    const colo = (req as Request & { cf?: { colo?: string } }).cf?.colo ?? "";
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        "X-Relay-Upstream-Ms": String(Date.now() - started),
        "X-Relay-Colo": colo,
      },
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "unknown";
    return json(name === "TimeoutError" ? 504 : 502, name === "TimeoutError" ? "upstream_timeout" : "upstream_unreachable");
  }
}

export default {
  fetch: (req: Request, env: RelayEnv) => handleRelay(req, env),
};
