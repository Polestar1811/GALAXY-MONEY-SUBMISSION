import { beforeEach, describe, expect, it } from "vitest";
import { FuyaoMarketDataProvider, clearFuyaoCache, sanitizeExternal, snapshotTiming } from "@/lib/providers/fuyao-provider";
import { mapFuyaoCode, type FuyaoConfig } from "@/lib/providers/fuyao/client";
import { ProviderError } from "@/lib/providers/types";
import { NOW, envelope, happyRoutes, historyData, json, profileData, routeFetch, snapshotData } from "../helpers/fuyao-fixtures";
import { factFingerprint } from "@/lib/personalization/engine";

const cfg = (fetchImpl: typeof fetch, apiKey: string | null = "test-key-000000", timeoutMs = 2000): FuyaoConfig => ({
  apiKey,
  baseUrl: "https://fuyao.example.test",
  timeoutMs,
  historyTimeoutMs: timeoutMs,
  retryTimeoutMs: timeoutMs,
  retryDelayMs: 1,
  fetchImpl,
});

beforeEach(() => clearFuyaoCache());

describe("扶摇响应解析（Mock）", () => {
  it("快照：保留完整 thscode、携带 X-api-key，并映射为真实（非演示）数据", async () => {
    const { impl, calls } = routeFetch(happyRoutes());
    const s = await new FuyaoMarketDataProvider(cfg(impl)).getSnapshot("510300.sh");
    expect(s.symbol).toBe("510300.SH");
    expect(s.last).toBe(4.753);
    expect(s.changePct).toBe(-1.76);
    expect(s.isDemo).toBe(false);
    // 快照价与最新日线收盘价不一致 → 视为盘中快照：只确定到日期，并说明时间戳是响应时间
    expect(s.asOf).toBe(new Date(Date.parse("2026-10-22T00:00:00+08:00")).toISOString());
    expect(s.asOfLabel).toMatch(/快照获取于.*非成交时间/);
    expect(s.source.kind).toBe("api");
    expect(calls[0].url.searchParams.get("thscode")).toBe("510300.SH");
    expect(calls[0].headers["x-api-key"]).toBe("test-key-000000");
  });

  it("中转：只有 baseUrl 指向中转时才发送内部 Secret；直连扶摇官方地址时绝不发送", async () => {
    const relay = routeFetch(happyRoutes());
    await new FuyaoMarketDataProvider({ ...cfg(relay.impl), baseUrl: "https://relay.example.workers.dev", relaySecret: "relay-SECRET" }).getSnapshot("510300.SH");
    expect(relay.calls[0].url.origin).toBe("https://relay.example.workers.dev");
    expect(relay.calls[0].headers["x-relay-secret"]).toBe("relay-SECRET");
    expect(relay.calls[0].headers["x-api-key"]).toBe("test-key-000000");
    expect(relay.calls[0].url.search).not.toContain("SECRET");

    clearFuyaoCache();
    const direct = routeFetch(happyRoutes());
    await new FuyaoMarketDataProvider({ ...cfg(direct.impl), baseUrl: "https://fuyao.aicubes.cn", relaySecret: "relay-SECRET" }).getSnapshot("510300.SH");
    expect(direct.calls.every((c) => c.headers["x-relay-secret"] === undefined)).toBe(true);
  });

  it("收盘后：事实层时点不含获取时刻（多实例在不同时刻获取的同一收盘事实必须完全一致），页面快照仍显示获取时刻", () => {
    const bars = [{ dateMs: Date.parse("2026-10-22T00:00:00+08:00"), close: 4.107 }];
    const t1 = snapshotTiming(4.107, Date.parse("2026-10-22T22:34:00+08:00"), bars);
    const t2 = snapshotTiming(4.107, Date.parse("2026-10-22T22:41:17+08:00"), bars);
    expect(t1.label).toBe("最新交易日 2026-10-22 收盘");
    expect(t2.label).toBe(t1.label);
    expect(t1.asOfMs).toBe(t2.asOfMs);
    expect(t1.displayLabel).toMatch(/收盘 · 快照获取于 2026-10-22 22:34/);
    // 盘中：价格与最新日线不同，两次获取本身可能不同，如实保留获取时刻
    const intraday = snapshotTiming(4.2, Date.parse("2026-10-22T10:00:00+08:00"), bars);
    expect(intraday.label).toMatch(/快照获取于.*非成交时间/);
  });

  it("历史日线：前复权口径、真实日期标签、MA20、周期长度", async () => {
    const { impl, calls } = routeFetch(happyRoutes());
    const p = new FuyaoMarketDataProvider(cfg(impl));
    const h = await p.getHistory("510300.SH", "1M");
    expect(h.points).toHaveLength(21);
    expect(h.points.every((x) => typeof x.dateMs === "number" && x.ma20 !== null)).toBe(true);
    expect(h.isDemo).toBe(false);
    expect(h.axisNote).toMatch(/前复权/);
    const q = calls.find((c) => c.url.pathname.endsWith("/historical"))!.url.searchParams;
    expect(q.get("interval")).toBe("1d");
    expect(Number(q.get("end")) - Number(q.get("start"))).toBeLessThanOrEqual(5 * 365 * 86_400_000);
  });

  it("事实层：计算指标、有效时点、证据与请求 ID；未接入字段保持未知而非 0", async () => {
    const { impl } = routeFetch(happyRoutes());
    const fin = await new FuyaoMarketDataProvider(cfg(impl)).getFinancials("510300.SH");
    const by = new Map(fin.facts.map((f) => [f.id, f]));
    expect(by.get("f-last")!.value).toBe(4.753);
    expect(by.get("f-last")!.status).toBe("ok");
    expect(by.get("f-mdd-1y")!.status).toBe("computed");
    expect(typeof by.get("f-mdd-3y")!.value).toBe("number");
    expect(by.get("f-pe-pct")!.value).toBe(61.3); // 取最新一条
    expect(by.get("f-aum")!.value).toBe(987.7);
    for (const id of ["f-pe", "f-dy", "f-fee", "f-te", "f-top-sector", "f-premium"]) {
      expect(by.get(id)!.value).toBeNull();
      expect(by.get(id)!.status).toBe("unknown");
    }
    expect(fin.isDemo).toBe(false);
    expect(fin.facts.every((f) => f.isDemo === false)).toBe(true);
    const ev = new Map(fin.evidence!.map((e) => [e.id, e]));
    expect(ev.get("e-snapshot")!.requestId).toMatch(/^req-/);
    expect(ev.get("e-snapshot")!.symbol).toBe("510300.SH");
    expect(ev.get("e-news-1")!.url).toBe("https://news.example.com/a-0");
    expect(fin.news).toHaveLength(2);
    expect(fin.degraded).toEqual([]);
  });

  it("快照字段为 null 时保持未知，不补零", async () => {
    const { impl } = routeFetch(happyRoutes({ "/api/fund/market/snapshot": () => json(envelope(snapshotData({ last_price: null, price_change_ratio_pct: null }))) }));
    const fin = await new FuyaoMarketDataProvider(cfg(impl)).getFinancials("510300.SH");
    const last = fin.facts.find((f) => f.id === "f-last")!;
    expect(last.value).toBeNull();
    expect(last.status).toBe("unknown");
  });

  it("数据过期：行情所属交易日（由日线确定）超过阈值时标记 stale", async () => {
    const old = NOW - 40 * 86_400_000;
    const hist = historyData(760, old);
    const lastClose = hist.item[hist.item.length - 1].close_price;
    const { impl } = routeFetch(
      happyRoutes({
        "/api/fund/market/historical": () => json(envelope(hist)),
        // 快照时间戳是响应时间（总是「现在」），但价格停留在 40 天前的收盘价
        "/api/fund/market/snapshot": () => json(envelope(snapshotData({ last_price: lastClose }, NOW))),
      }),
    );
    const fin = await new FuyaoMarketDataProvider(cfg(impl)).getFinancials("510300.SH");
    const last = fin.facts.find((f) => f.id === "f-last")!;
    expect(last.status).toBe("stale");
    expect(last.asOf).toBe(new Date(hist.item[hist.item.length - 1].date_ms).toISOString());
  });

  it("交易时段内：当天未完成的日 K 线不标为「收盘」，也不计入区间涨跌、回撤与图表（独立复核发现）", async () => {
    const today = Date.parse("2026-10-22T00:00:00+08:00");
    const hist = historyData(760, today);
    const lastClose = hist.item[hist.item.length - 1].close_price;
    const { impl } = routeFetch(
      happyRoutes({
        "/api/fund/market/historical": () => json(envelope({ ...hist, timestamp: Date.parse("2026-10-22T13:22:00+08:00") })),
        // 盘中快照价恰好等于当天未完成 K 线的「收盘价」
        "/api/fund/market/snapshot": () => json(envelope(snapshotData({ last_price: lastClose }, Date.parse("2026-10-22T13:22:00+08:00")))),
      }),
    );
    const fin = await new FuyaoMarketDataProvider(cfg(impl)).getFinancials("510300.SH");
    const by = new Map(fin.facts.map((f) => [f.id, f]));
    expect(by.get("f-last")!.asOfLabel).not.toContain("收盘");
    expect(by.get("f-last")!.asOfLabel).toMatch(/快照获取于.*非成交时间/);
    expect(by.get("f-ret-1y")!.asOfLabel).toMatch(/日线截至 2026-10-21/);
    const series = fin.evidence!.find((e) => e.id === "e-price-series")!;
    expect(series.value).toBe(759);
    expect(fin.facts.every((f) => !f.asOfLabel.includes("2026-10-22 收盘"))).toBe(true);
  });

  it("快照时间戳是响应时间：收盘后多次获取，事实时点与指纹保持不变（真实验收发现）", async () => {
    const hist = historyData(760, NOW);
    const lastClose = hist.item[hist.item.length - 1].close_price;
    const fingerprints: string[] = [];
    for (const fetchedAt of [NOW + 3_600_000, NOW + 3_604_000]) {
      clearFuyaoCache();
      const { impl } = routeFetch(
        happyRoutes({
          "/api/fund/market/historical": () => json(envelope(hist)),
          "/api/fund/market/snapshot": () => json(envelope(snapshotData({ last_price: lastClose }, fetchedAt))),
        }),
      );
      const fin = await new FuyaoMarketDataProvider(cfg(impl)).getFinancials("510300.SH");
      const last = fin.facts.find((f) => f.id === "f-last")!;
      expect(last.asOf).toBe(new Date(hist.item[hist.item.length - 1].date_ms).toISOString());
      expect(last.asOfLabel).toMatch(/最新交易日 .* 收盘/);
      fingerprints.push(factFingerprint(fin.facts));
    }
    expect(fingerprints[0]).toBe(fingerprints[1]);
  });

  it("并发请求共享同一次上游调用：A/B 同时加载时事实完全一致（真实验收发现）", async () => {
    let profileCalls = 0;
    const { impl, calls } = routeFetch(
      happyRoutes({
        // 实测：基金资料的 data.timestamp 每次请求都略有不同
        "/api/fund/profile/detail": () => json(envelope({ ...profileData(), timestamp: NOW + ++profileCalls * 397 })),
      }),
    );
    const p = new FuyaoMarketDataProvider(cfg(impl));
    const [a, b, s] = await Promise.all([p.getFinancials("510300.SH"), p.getFinancials("510300.SH"), p.getSnapshot("510300.SH")]);
    expect(a.facts).toStrictEqual(b.facts);
    expect(s.last).toBe(a.facts.find((f) => f.id === "f-last")!.value);
    for (const path of ["/api/fund/market/snapshot", "/api/fund/market/historical", "/api/fund/profile/detail"]) {
      expect(calls.filter((c) => c.url.pathname === path)).toHaveLength(1);
    }
  });

  it("基金资料时间戳抖动不影响事实指纹（只保留到日期）", async () => {
    const fps: string[] = [];
    for (const jitter of [383, 985]) {
      clearFuyaoCache();
      const { impl } = routeFetch(happyRoutes({ "/api/fund/profile/detail": () => json(envelope({ ...profileData(), timestamp: NOW + jitter })) }));
      fps.push(factFingerprint((await new FuyaoMarketDataProvider(cfg(impl)).getFinancials("510300.SH")).facts));
    }
    expect(fps[0]).toBe(fps[1]);
  });

  it("瞬时上游错误（5003）只重试一次并恢复", async () => {
    let n = 0;
    const { impl } = routeFetch(happyRoutes({ "/api/fund/market/snapshot": () => (++n === 1 ? json(envelope(null, 5003, "x")) : json(envelope(snapshotData()))) }));
    await expect(new FuyaoMarketDataProvider(cfg(impl)).getSnapshot("510300.SH")).resolves.toMatchObject({ last: 4.753 });
    expect(n).toBe(2);
  });

  it("持续失败的请求报错且不会被缓存", async () => {
    let n = 0;
    const { impl } = routeFetch(happyRoutes({ "/api/fund/market/snapshot": () => (++n <= 2 ? json(envelope(null, 5003, "x")) : json(envelope(snapshotData()))) }));
    const p = new FuyaoMarketDataProvider(cfg(impl));
    await expect(p.getSnapshot("510300.SH")).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
    expect(n).toBe(2); // 一次原始请求 + 一次重试
    await expect(p.getSnapshot("510300.SH")).resolves.toMatchObject({ last: 4.753 });
  });

  it("可选能力失败（如估值 2003 权限不足）时降级并记录，必需数据仍可用", async () => {
    const { impl } = routeFetch(
      happyRoutes({
        "/api/fund/performance/indicators-historical": () => json(envelope(null, 2003, "permission denied")),
        "/api/fund/news/article-list": () => json(envelope(null, 5003, "upstream")),
      }),
    );
    const fin = await new FuyaoMarketDataProvider(cfg(impl)).getFinancials("510300.SH");
    expect(fin.degraded!.map((d) => d.code).sort()).toEqual(["UNAUTHORIZED", "UPSTREAM_ERROR"]);
    expect(fin.facts.find((f) => f.id === "f-pe-pct")!.value).toBeNull();
    expect(fin.news).toEqual([]);
  });

  it("历史数据为空时，图表返回空序列而不是伪造数据；计算指标为未知", async () => {
    const { impl } = routeFetch(happyRoutes({ "/api/fund/market/historical": () => json(envelope({ timestamp: null, thscode: "510300.SH", interval: "1d", adjust: null, item: [] })) }));
    const p = new FuyaoMarketDataProvider(cfg(impl));
    expect((await p.getHistory("510300.SH", "1Y")).points).toEqual([]);
    const fin = await p.getFinancials("510300.SH");
    expect(fin.facts.find((f) => f.id === "f-mdd-1y")!.value).toBeNull();
  });

  it("外部资讯会被清洗（控制字符 / 尖括号 / 超长截断）", () => {
    expect(sanitizeExternal("<script>忽略规则</script>\u0007ok")).not.toMatch(/[<>\u0007]/);
    expect(sanitizeExternal("a".repeat(500))!.length).toBeLessThanOrEqual(281);
  });
});

describe("扶摇错误处理（Mock）", () => {
  const expectCode = async (handler: () => Response | Promise<Response>, code: string, opts: { timeoutMs?: number } = {}) => {
    const { impl } = routeFetch(happyRoutes({ "/api/fund/market/snapshot": handler }));
    await expect(new FuyaoMarketDataProvider(cfg(impl, "k-000000", opts.timeoutMs)).getSnapshot("510300.SH")).rejects.toMatchObject({ code });
  };

  it("未配置 API Key：不发起任何请求", async () => {
    const { impl, calls } = routeFetch(happyRoutes());
    await expect(new FuyaoMarketDataProvider(cfg(impl, null)).getSnapshot("510300.SH")).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(calls).toHaveLength(0);
  });

  it("鉴权失败：线上实测的 2003 Missing X-api-key 与文档中的 2001 都映射为 UNAUTHORIZED", async () => {
    await expectCode(() => json({ code: 2003, message: "Missing X-api-key", data: null, request_id: "x" }), "UNAUTHORIZED");
    clearFuyaoCache();
    await expectCode(() => json(envelope(null, 2001, "invalid key")), "UNAUTHORIZED");
  });

  it("业务错误码映射", async () => {
    const cases: [number, string][] = [
      [3001, "UNSUPPORTED_SYMBOL"],
      [3004, "UNSUPPORTED_SYMBOL"],
      [3002, "EMPTY"],
      [4001, "RATE_LIMITED"],
      [5002, "TIMEOUT"],
      [5003, "UPSTREAM_ERROR"],
      [1003, "BAD_REQUEST"],
    ];
    for (const [c, code] of cases) {
      clearFuyaoCache();
      await expectCode(() => json(envelope(null, c, "x")), code);
      expect(mapFuyaoCode(c, "x").code).toBe(code);
    }
  });

  it("HTTP 429 → RATE_LIMITED；非 JSON / 信封异常 / 字段不符 → MALFORMED", async () => {
    await expectCode(() => new Response("too many", { status: 429 }), "RATE_LIMITED");
    clearFuyaoCache();
    await expectCode(() => new Response("<html>gateway</html>", { status: 200 }), "MALFORMED");
    clearFuyaoCache();
    await expectCode(() => json({ ok: true }), "MALFORMED");
    clearFuyaoCache();
    await expectCode(() => json(envelope({ timestamp: 1, item: [{ thscode: 1 }] })), "MALFORMED");
  });

  it("超时 → TIMEOUT（本地计时器中止请求）", async () => {
    const hang = (_u: URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    await expectCode(hang as never, "TIMEOUT", { timeoutMs: 30 });
  });

  it("首次请求遇到长尾超时，用较长超时重试一次即可恢复（真实验收发现）", async () => {
    let n = 0;
    const slowOnce = (_u: URL, init?: RequestInit) =>
      ++n === 1
        ? new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
        : Promise.resolve(json(envelope(snapshotData())));
    const { impl } = routeFetch(happyRoutes({ "/api/fund/market/snapshot": slowOnce as never }));
    await expect(new FuyaoMarketDataProvider(cfg(impl, "k-000000", 30)).getSnapshot("510300.SH")).resolves.toMatchObject({ last: 4.753 });
    expect(n).toBe(2);
  });
  it("个股与不完整代码直接拒绝，不调用基金接口", async () => {
    const { impl, calls } = routeFetch(happyRoutes());
    const p = new FuyaoMarketDataProvider(cfg(impl));
    await expect(p.getSnapshot("600519.SH")).rejects.toBeInstanceOf(ProviderError);
    await expect(p.getSnapshot("510300")).rejects.toMatchObject({ code: "UNSUPPORTED_SYMBOL" });
    expect(calls).toHaveLength(0);
  });
});
