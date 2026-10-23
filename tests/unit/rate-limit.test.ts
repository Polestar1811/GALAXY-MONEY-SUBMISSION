import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS, MemoryStore, UpstashStore, acquireAgentRun, checkAgentRate, checkDataLimit, isDenied, setStore, visitorId } from "@/lib/server/rate-limit";

const req = (ip = "203.0.113.7", body = "{}") =>
  new Request("http://localhost/api/agent", { method: "POST", headers: { "x-forwarded-for": `${ip}, 10.0.0.1`, "content-type": "application/json" }, body });

describe("限流、预算与并发", () => {
  beforeEach(() => {
    setStore(new MemoryStore());
    delete process.env.INVESTLENS_RATE_LIMIT;
  });
  afterEach(() => {
    setStore(null);
    delete process.env.INVESTLENS_RATE_LIMIT;
    delete process.env.VERCEL;
    vi.restoreAllMocks();
  });

  it("访问者以 IP 摘要标识，不保存原始 IP", () => {
    const id = visitorId(req("203.0.113.7"));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id).not.toContain("203");
    expect(visitorId(req("198.51.100.1"))).not.toBe(id);
  });

  it("AI 研究：每位访问者 10 分钟内超过上限后返回限流，其他访问者不受影响", async () => {
    const { limit } = LIMITS.agent.perVisitor;
    for (let i = 0; i < limit; i++) expect(await checkAgentRate(req())).toBeNull();
    const denied = await checkAgentRate(req());
    expect(denied?.code).toBe("RATE_LIMITED");
    expect(denied?.retryAfterSec).toBeGreaterThan(0);
    expect(denied?.message).toMatch(/分钟后再试/);
    expect(await checkAgentRate(req("198.51.100.1"))).toBeNull();
  });

  it("并发：同一访问者最多 2 个进行中的研究，释放后可再次开始", async () => {
    const a = await acquireAgentRun(req());
    const b = await acquireAgentRun(req());
    expect(isDenied(a) || isDenied(b)).toBe(false);
    const c = await acquireAgentRun(req());
    expect(isDenied(c) && c.code).toBe("TOO_MANY_CONCURRENT");
    if (!isDenied(a)) await a.release();
    if (!isDenied(a)) await a.release(); // 重复释放不会多减
    const d = await acquireAgentRun(req());
    expect(isDenied(d)).toBe(false);
    const e = await acquireAgentRun(req());
    expect(isDenied(e) && e.code).toBe("TOO_MANY_CONCURRENT");
  });

  it("全站每日预算用完后返回 BUDGET_EXHAUSTED", async () => {
    const { limit } = LIMITS.agent.globalDaily;
    for (let i = 0; i < limit; i++) {
      const s = await acquireAgentRun(req(`198.51.100.${i % 250}`));
      expect(isDenied(s)).toBe(false);
      if (!isDenied(s)) await s.release();
    }
    const over = await acquireAgentRun(req("192.0.2.1"));
    expect(isDenied(over) && over.code).toBe("BUDGET_EXHAUSTED");
  });

  it("行情与规则研究接口的频率限制", async () => {
    const { limit } = LIMITS.data.perVisitor;
    for (let i = 0; i < limit; i++) expect(await checkDataLimit(req())).toBeNull();
    expect((await checkDataLimit(req()))?.code).toBe("RATE_LIMITED");
  });

  it("本机测试可关闭限流，但在 Vercel 上该开关无效", async () => {
    process.env.INVESTLENS_RATE_LIMIT = "off";
    for (let i = 0; i < LIMITS.agent.perVisitor.limit + 5; i++) expect(await checkAgentRate(req())).toBeNull();
    process.env.VERCEL = "1";
    setStore(new MemoryStore());
    for (let i = 0; i < LIMITS.agent.perVisitor.limit; i++) await checkAgentRate(req());
    expect((await checkAgentRate(req()))?.code).toBe("RATE_LIMITED");
  });

  it("/api/agent：先计次再解析，超限返回 429 + Retry-After，响应不含堆栈或配置", async () => {
    const { POST } = await import("@/app/api/agent/route");
    for (let i = 0; i < LIMITS.agent.perVisitor.limit; i++) expect((await POST(req(undefined, "not json"))).status).toBe(400);
    const res = await POST(req(undefined, "not json"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(JSON.stringify(body)).not.toMatch(/at .+:\d+|KV_REST|UPSTASH|LLM_/);
  });

  it("/api/agent：过长的请求体被拒绝", async () => {
    const { POST } = await import("@/app/api/agent/route");
    const res = await POST(req(undefined, JSON.stringify({ symbol: "510300.SH", question: "x".repeat(9000), profile: null })));
    expect(res.status).toBe(400);
  });

  it("Upstash 存储：使用 REST pipeline，令牌只出现在 Authorization 头", async () => {
    const calls: { url: string; auth: string | null; body: string }[] = [];
    const fetchImpl = (async (u: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(u), auth: new Headers(init?.headers).get("authorization"), body: String(init?.body) });
      return new Response(JSON.stringify([{ result: 3 }, { result: 1 }]), { status: 200 });
    }) as typeof fetch;
    const s = new UpstashStore("https://example.upstash.io/", "tok-SECRET", fetchImpl);
    expect(await s.incr("rl:k", 60)).toBe(3);
    expect(calls[0].url).toBe("https://example.upstash.io/pipeline");
    expect(calls[0].auth).toBe("Bearer tok-SECRET");
    expect(calls[0].body).toBe(JSON.stringify([["INCR", "rl:k"], ["EXPIRE", "rl:k", 60]]));
    expect(calls[0].body).not.toContain("SECRET");
  });

  it("共享存储不可用时退回内存计数，仍然限流", async () => {
    setStore(null);
    process.env.KV_REST_API_URL = "https://down.example.test";
    process.env.KV_REST_API_TOKEN = "tok";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      for (let i = 0; i < LIMITS.agent.perVisitor.limit; i++) expect(await checkAgentRate(req())).toBeNull();
      expect((await checkAgentRate(req()))?.code).toBe("RATE_LIMITED");
    } finally {
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
    }
  });
});
