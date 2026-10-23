import { describe, expect, it } from "vitest";
import { ALLOWED_PATHS, handleRelay } from "@/relay/fuyao-worker/src/index";

const SECRET = "r".repeat(48);
const env = { RELAY_SECRET: SECRET };

function req(path: string, headers: Record<string, string> = {}, method = "GET") {
  return new Request(`https://relay.example.workers.dev${path}`, { method, headers });
}

function upstream() {
  const calls: { url: string; headers: Headers }[] = [];
  const impl = (async (u: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(u), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ code: 0, data: { ok: true } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("扶摇中转 Worker", () => {
  it("未携带或携带错误的内部 Secret：403，且不访问上游", async () => {
    const u = upstream();
    for (const h of [{}, { "x-relay-secret": "wrong" }, { "x-relay-secret": SECRET.slice(1) + "x" }] as Record<string, string>[]) {
      const r = await handleRelay(req("/api/fund/market/snapshot?thscode=510300.SH", { ...h, "x-api-key": "k" }), env, u.impl);
      expect(r.status).toBe(403);
    }
    expect(u.calls).toHaveLength(0);
  });

  it("Worker 未设置 Secret（或过短）时拒绝所有请求，不会成为开放代理", async () => {
    const u = upstream();
    expect((await handleRelay(req("/api/fund/market/snapshot", { "x-relay-secret": "", "x-api-key": "k" }), {}, u.impl)).status).toBe(403);
    expect((await handleRelay(req("/api/fund/market/snapshot", { "x-relay-secret": "short", "x-api-key": "k" }), { RELAY_SECRET: "short" }, u.impl)).status).toBe(403);
    expect(u.calls).toHaveLength(0);
  });

  it("只允许白名单路径与 GET，不接受任意 URL", async () => {
    const u = upstream();
    const auth = { "x-relay-secret": SECRET, "x-api-key": "k" };
    for (const p of ["/", "/api/fund/market/snapshot/../../admin", "/api/stock/market/snapshot", "/https://evil.example/x", "/api/fund/market/snapshotx"]) {
      expect((await handleRelay(req(p, auth), env, u.impl)).status, p).toBe(403);
    }
    expect((await handleRelay(req("/api/fund/market/snapshot", auth, "POST"), env, u.impl)).status).toBe(405);
    expect(u.calls).toHaveLength(0);
  });

  it("合法请求：固定转发到扶摇，保留查询参数，只透传 X-api-key，不转发内部 Secret", async () => {
    const u = upstream();
    const r = await handleRelay(
      req("/api/fund/market/historical?thscode=510300.SH&interval=1d", { "x-relay-secret": SECRET, "x-api-key": "fy-key", cookie: "a=b", "x-forwarded-for": "1.2.3.4" }),
      env,
      u.impl,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ code: 0, data: { ok: true } });
    expect(u.calls[0].url).toBe("https://fuyao.aicubes.cn/api/fund/market/historical?thscode=510300.SH&interval=1d");
    expect(u.calls[0].headers.get("x-api-key")).toBe("fy-key");
    expect(u.calls[0].headers.get("x-relay-secret")).toBeNull();
    expect(u.calls[0].headers.get("cookie")).toBeNull();
    expect(u.calls[0].headers.get("x-forwarded-for")).toBeNull();
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("上游不可达：返回 502/504，不包含 Key 或上游细节", async () => {
    const bad = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const r = await handleRelay(req("/api/fund/market/snapshot", { "x-relay-secret": SECRET, "x-api-key": "fy-key" }), env, bad);
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("fy-key");
  });

  it("白名单与 InvestLens 实际调用的扶摇接口一致", () => {
    expect([...ALLOWED_PATHS].sort()).toEqual([
      "/api/fund/market/historical",
      "/api/fund/market/snapshot",
      "/api/fund/news/article-list",
      "/api/fund/performance/indicators-historical",
      "/api/fund/profile/detail",
    ]);
  });
});
