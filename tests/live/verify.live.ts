/**
 * 真实接口验证：同花顺扶摇 + 真实 LLM。
 * - 从 .env.local 读取密钥（不打印、不写入结果）。
 * - 结果脱敏后写入 docs/live-verification/，供报告引用。
 * - 没有凭证的步骤会被明确跳过，绝不使用 Mock 代替。
 */
import { describe, expect, it } from "vitest";

import { loadEnvLocal, saveRecord } from "./env";

loadEnvLocal();
const save = saveRecord;

const stamp = new Date().toISOString().slice(0, 10);
const hasFuyao = !!process.env.FUYAO_API_KEY?.trim();
const hasLLM = !!(process.env.LLM_API_KEY?.trim() && process.env.LLM_BASE_URL?.trim() && process.env.LLM_MODEL?.trim());

describe("真实接口验证", () => {
  it("扶摇（无有效凭证）：真实服务器对无效 Key 返回鉴权错误，且被映射为 UNAUTHORIZED", async () => {
    const { FuyaoMarketDataProvider, clearFuyaoCache } = await import("@/lib/providers/fuyao-provider");
    clearFuyaoCache();
    const p = new FuyaoMarketDataProvider({ apiKey: "invalid-key-for-verification", baseUrl: "https://fuyao.aicubes.cn", timeoutMs: 15_000 });
    let code = "";
    let message = "";
    try {
      await p.getSnapshot("510300.SH");
    } catch (e) {
      code = (e as { code: string }).code;
      message = (e as Error).message;
    }
    // 不携带 X-api-key 的原始请求，记录线上返回的业务码
    const raw = await fetch("https://fuyao.aicubes.cn/api/fund/market/snapshot?thscode=510300.SH").then(async (r) => ({ http: r.status, body: await r.json() }));
    save(`fuyao-auth-error-${stamp}.json`, {
      kind: "real-request",
      at: new Date().toISOString(),
      endpoint: "GET /api/fund/market/snapshot?thscode=510300.SH",
      invalidKey: { note: "使用故意无效的 Key，经 FuyaoMarketDataProvider 调用", mappedCode: code, message },
      missingKey: { note: "不携带 X-api-key 的原始请求", http: raw.http, code: raw.body.code, message: raw.body.message },
    });
    expect(code).toBe("UNAUTHORIZED");
    expect(raw.body.code).not.toBe(0);
  });

  it.skipIf(!hasFuyao)("扶摇（真实凭证）：行情快照、历史日线与可选接口的实际可用性", async () => {
    const { FuyaoMarketDataProvider, clearFuyaoCache } = await import("@/lib/providers/fuyao-provider");
    clearFuyaoCache();
    const p = new FuyaoMarketDataProvider();
    const raw = await p.fetchRaw("510300.SH");
    const fin = await p.getFinancials("510300.SH");
    const hist = await p.getHistory("510300.SH", "1Y");
    const pick = (id: string) => {
      const f = fin.facts.find((x) => x.id === id)!;
      return { value: f.value, unit: f.unit, status: f.status, asOf: f.asOf };
    };
    const record = {
      kind: "real-request",
      symbol: "510300.SH",
      at: new Date().toISOString(),
      endpoints: {
        "GET /api/fund/market/snapshot": { ok: true, requestId: raw.snapshot.requestId, dataTimestamp: raw.snapshot.data.timestamp, items: raw.snapshot.data.item.length },
        "GET /api/fund/market/historical": { ok: true, requestId: raw.history.requestId, dataTimestamp: raw.history.data.timestamp, bars: raw.history.data.item.length, adjust: raw.history.data.adjust ?? null },
        "GET /api/fund/profile/detail": raw.profile ? { ok: true, requestId: raw.profile.requestId } : { ok: false, ...fin.degraded?.find((d) => d.capability === "基金基本资料") },
        "GET /api/fund/performance/indicators-historical": raw.indicators ? { ok: true, requestId: raw.indicators.requestId, items: raw.indicators.data.item.length } : { ok: false, ...fin.degraded?.find((d) => d.capability === "估值分位指标") },
        "GET /api/fund/news/article-list": raw.news ? { ok: true, requestId: raw.news.requestId, items: raw.news.data.item.length } : { ok: false, ...fin.degraded?.find((d) => d.capability === "基金资讯") },
      },
      facts: Object.fromEntries(["f-last", "f-chg-1d", "f-ret-1y", "f-vol-1y", "f-mdd-1y", "f-mdd-3y", "f-pe-pct", "f-turnover", "f-aum"].map((id) => [id, pick(id)])),
      chart1Y: { points: hist.points.length, first: hist.points[0]?.label, last: hist.points.at(-1)?.label, axisNote: hist.axisNote },
      news: (fin.news ?? []).slice(0, 3).map((n) => ({ title: n.title, url: n.url, publishedAt: n.publishedAt })),
      degraded: fin.degraded,
    };
    save(`fuyao-live-${stamp}.json`, record);
    expect(fin.isDemo).toBe(false);
    expect(typeof fin.facts.find((f) => f.id === "f-last")!.value).toBe("number");
  });

  it.skipIf(!hasLLM)("真实 LLM：完整研究工作流（画像 A / B，同一事实快照）", async () => {
    const { getMarketDataProvider } = await import("@/lib/providers");
    const { getLLMProvider } = await import("@/lib/llm/provider");
    const { runResearchAgent } = await import("@/lib/agent/research-agent");
    const { PERSONA_A, PERSONA_B } = await import("@/lib/profile/personas");
    const provider = getMarketDataProvider();
    const llm = getLLMProvider()!;
    const question = "我想长期研究沪深300 ETF，目前有哪些最值得关注的风险和证据？";
    const a = await runResearchAgent({ symbol: "510300.SH", question, profile: PERSONA_A }, { provider, llm });
    const b = await runResearchAgent({ symbol: "510300.SH", question, profile: PERSONA_B, snapshotId: a.snapshotId }, { provider, llm });
    const view = (r: typeof a) => ({
      status: r.status,
      error: r.error,
      model: r.llm,
      dataSource: r.research.dataSource,
      factFingerprint: r.research.factFingerprint,
      snapshotId: r.snapshotId,
      plan: r.plan,
      tools: r.tools,
      topModules: r.research.modules.slice(0, 3).map((m) => m.title),
      profileFieldsUsed: r.profileFieldsUsed,
      profileFieldsWithheld: r.profileFieldsWithheld,
      answer: r.answer,
      verification: r.verification,
    });
    save(`llm-live-${stamp}.json`, { kind: "real-llm", question, at: new Date().toISOString(), personaA: view(a), personaB: view(b), sameFacts: JSON.stringify(a.research.facts) === JSON.stringify(b.research.facts) });
    expect(a.research.factFingerprint).toBe(b.research.factFingerprint);
    expect(a.llm?.calls).toBeGreaterThan(0);
  });
});
