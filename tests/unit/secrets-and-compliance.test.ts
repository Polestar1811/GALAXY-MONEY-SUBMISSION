import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FuyaoMarketDataProvider, clearFuyaoCache } from "@/lib/providers/fuyao-provider";
import { OpenAICompatibleProvider } from "@/lib/llm/provider";
import { runResearchAgent } from "@/lib/agent/research-agent";
import { clearSnapshots } from "@/lib/agent/snapshot-store";
import { COMPLIANCE_PATTERNS, enforceCompliance, extractNumbers, numberIsKnown } from "@/lib/agent/guards";
import { redact } from "@/lib/server/log";
import { PERSONA_A } from "@/lib/profile/personas";
import { happyRoutes, routeFetch } from "../helpers/fuyao-fixtures";
import { defaultPlan, honestAnswer } from "../helpers/mock-llm";

const FUYAO_SECRET = "fy-SECRET-7f3a9c2e1d";
const LLM_SECRET = "sk-SECRET-a1b2c3d4e5f6";

describe("敏感信息不泄漏", () => {
  let logs: string[] = [];
  beforeEach(() => {
    clearFuyaoCache();
    clearSnapshots();
    logs = [];
    process.env.FUYAO_API_KEY = FUYAO_SECRET;
    process.env.LLM_API_KEY = LLM_SECRET;
    for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FUYAO_API_KEY;
    delete process.env.LLM_API_KEY;
  });

  it("完整研究流程（真实 Provider 代码 + Mock 网络）：密钥只出现在请求头，不出现在日志、事件与结果中", async () => {
    const fuyao = routeFetch(happyRoutes());
    const llmCalls: { auth: string | null; body: string }[] = [];
    const llmFetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body);
      llmCalls.push({ auth: new Headers(init?.headers).get("authorization"), body });
      const isPlan = body.includes("研究计划") && !body.includes("研究结论");
      const content = isPlan ? JSON.stringify(defaultPlan) : JSON.stringify(honestAnswer(JSON.parse(JSON.parse(body).messages[1].content.replace(/^<research_input>\n|\n<\/research_input>$/g, ""))));
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as typeof fetch;

    const events: unknown[] = [];
    const result = await runResearchAgent(
      { symbol: "510300.SH", question: "长期持有有哪些风险？", profile: PERSONA_A },
      {
        provider: new FuyaoMarketDataProvider({ apiKey: FUYAO_SECRET, baseUrl: "https://fuyao.example.test", timeoutMs: 2000, fetchImpl: fuyao.impl }),
        llm: new OpenAICompatibleProvider({ apiKey: LLM_SECRET, baseUrl: "https://llm.example.test/v1", model: "m", timeoutMs: 2000, maxTokens: 500, jsonMode: true, fetchImpl: llmFetch }),
        emit: (e) => events.push(e),
      },
    );

    expect(result.status).toBe("complete");
    expect(fuyao.calls.every((c) => c.headers["x-api-key"] === FUYAO_SECRET)).toBe(true);
    expect(llmCalls.every((c) => c.auth === `Bearer ${LLM_SECRET}`)).toBe(true);
    // 密钥不在请求体（提示词）中
    expect(llmCalls.some((c) => c.body.includes(FUYAO_SECRET) || c.body.includes(LLM_SECRET))).toBe(false);
    const surface = [JSON.stringify(result), JSON.stringify(events), logs.join("\n")].join("\n");
    expect(surface).not.toContain(FUYAO_SECRET);
    expect(surface).not.toContain(LLM_SECRET);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("/api/status 只返回布尔值与模型名", async () => {
    process.env.LLM_BASE_URL = "https://llm.example.test/v1";
    process.env.LLM_MODEL = "demo-model";
    const { GET } = await import("@/app/api/status/route");
    const body = JSON.stringify(await GET().json());
    expect(body).not.toContain(FUYAO_SECRET);
    expect(body).not.toContain(LLM_SECRET);
    expect(body).not.toContain("llm.example.test");
    expect(JSON.parse(body)).toMatchObject({ fuyaoConfigured: true, llmConfigured: true, llmModel: "demo-model", dataMode: "fuyao" });
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
  });

  it("日志脱敏兜底", () => {
    expect(redact(`key=${FUYAO_SECRET} auth=Bearer ${LLM_SECRET}`)).not.toMatch(/SECRET/);
  });

  it("限流存储令牌同样被日志脱敏", () => {
    process.env.KV_REST_API_TOKEN = "kv-token-SECRET-123";
    expect(redact("token=kv-token-SECRET-123")).not.toMatch(/SECRET/);
    delete process.env.KV_REST_API_TOKEN;
  });

  it("单次模型调用预算有硬上限，环境变量不能突破", async () => {
    const { llmConfigFromEnv, LLM_MAX_TOKENS_CAP, LLM_TIMEOUT_CAP_MS } = await import("@/lib/llm/provider");
    process.env.LLM_MAX_TOKENS = "999999";
    process.env.LLM_TIMEOUT_MS = "9999999";
    const cfg = llmConfigFromEnv();
    expect(cfg.maxTokens).toBe(LLM_MAX_TOKENS_CAP);
    expect(cfg.timeoutMs).toBe(LLM_TIMEOUT_CAP_MS);
    delete process.env.LLM_MAX_TOKENS;
    delete process.env.LLM_TIMEOUT_MS;
  });

  it("浏览器端代码不引用服务端密钥，也没有 NEXT_PUBLIC_ 形式的密钥变量", () => {
    const root = path.resolve(__dirname, "../..");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        if (["node_modules", ".next", "tests", "docs", "test-results", "playwright-report"].includes(f.name)) continue;
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f.name)) files.push(p);
      }
    };
    walk(root);
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/NEXT_PUBLIC_(FUYAO|LLM)/);
      if (/^["']use client["']/.test(src.trimStart())) expect(src, f).not.toMatch(/process\.env\.(FUYAO_API_KEY|LLM_API_KEY)/);
    }
  });
});

describe("数值核验", () => {
  // 真实验收发现：模型写「1,264.0 亿元」时被拆成 264.0 并误判为未核验
  it("支持千分位数字", () => {
    expect(extractNumbers("基金规模为1,264.0亿元，成交额 49.5 亿元")).toEqual(["1264.0", "49.5"]);
    expect(numberIsKnown("1264.0", [1264])).toBe(true);
    expect(numberIsKnown("1,264.0".replace(/,/g, ""), [1264])).toBe(true);
  });

  // 真实验收发现：日期被当作数值，导致正确的事实被降级为「未验证」
  it("日期与时刻不参与数值核验，但同句中的真实数值仍被检查", () => {
    // 「沪深300」中的 300 仍会被提取，由白名单（跟踪指数 / 标的代码）放行
    expect(extractNumbers("沪深300ETF最新价为4.107元，最新交易日涨跌幅为-1.86%（2026-10-22收盘快照）。")).toEqual(["300", "4.107", "-1.86%"]);
    expect(extractNumbers("截至 2026年10月22日 17:59，规模 1264.0 亿元")).toEqual(["1264.0"]);
    expect(extractNumbers("2025年以来下跌 99.99%")).toEqual(["99.99%"]);
  });
});

describe("合规边界", () => {
  const blocked = [
    "建议你现在买入沪深300ETF。",
    "可以考虑加仓。",
    "应该立即卖出止损。",
    "这只基金稳赚不赔。",
    "持有一年保证收益。",
    "指数必然上涨。",
    "明年一定会涨。",
    "上涨概率为 70%。",
    "有 65% 的可能性反弹。",
    "目标价 5.2 元。",
  ];
  const allowed = [
    "近 3 年最大回撤为 -31.83%。",
    "历史回撤不代表未来最大损失。",
    "是否投资由你自己决定。",
    "估值分位只说明相对位置，不说明短期方向。",
    "如果用钱时遇到回撤，可能被迫低位卖出。",
  ];
  it.each(blocked)("删除：%s", (s) => {
    expect(enforceCompliance(s).text).toBe("");
  });
  it.each(allowed)("保留：%s", (s) => {
    expect(enforceCompliance(s).text).toBe(s);
  });

  // 回归：公网验收试运行中，模型对「给目标价」的正确拒绝被整句删除
  const refusals = [
    "你问的是「明天买哪只股票能涨停、给个目标价」，这类短期涨停预测与目标价不在我能提供的范围内：现有证据只覆盖沪深300ETF 的行情与估值。",
    "我无法给出目标价，也不会提供买入或卖出的交易指令。",
    "目标价不在本工具的提供范围内，可以先看估值分位与历史回撤。",
    "我不能保证收益，也无法预测短期涨跌。",
    "本工具不做任何预测，下面只列出与你的期限相关的事实。",
    // 真实运行（本机生产构建 + DeepSeek）中被误删的信息缺口说明
    "个股层面的任何数据（涨停、目标价相关问题所需）完全未提供。",
    "机构给出的目标价是多少不在本工具的范围内。",
  ];
  it.each(refusals)("保留拒绝说明：%s", (s) => {
    const r = enforceCompliance(s);
    expect(r.text).toBe(s);
    expect(r.removed).toEqual([]);
  });

  const facts = [
    "近 1 年最大回撤为 -12.4%，跟踪指数 PE-TTM 五年分位为 43%。",
    "近 20 日平均成交额约 1,264.0 亿元，流动性充足。",
    "回撤数据说明阶段性亏损可能较深，这不构成投资建议。",
  ];
  it.each(facts)("保留正常的金融事实分析：%s", (s) => {
    expect(enforceCompliance(s).text).toBe(s);
  });

  // 拒绝措辞不能成为夹带违规内容的通道
  const disguised = [
    "我不能保证收益，但建议立即买入。",
    "虽然无法预测，目标价 6.5 元。",
    "我不提供目标价，但「目标价 6 元」值得参考。",
    "无法提供更多信息，建议现在就买入。",
    "不会说必涨，但明年一定会涨。",
    "这并非投资建议，不过上涨概率为 70%。",
    "不建议你现在买入。",
    "拒绝不了这个价格，立即加仓。",
    "目标价为 5.2 元。",
    "目标价上调至六元。",
    "目标位看 4.5。",
    "目标价在五元附近。",
    "数据未覆盖个股，但目标价约 6 元。",
  ];
  it.each(disguised)("仍然删除：%s", (s) => {
    const r = enforceCompliance(s);
    expect(r.text).toBe("");
    expect(r.removed.length).toBe(1);
  });

  it("多句文本中只删除违规句，保留拒绝说明与事实", () => {
    const text = "我无法给出目标价。近 3 年最大回撤为 -31.83%。建议现在买入。";
    const r = enforceCompliance(text);
    expect(r.text).toBe("我无法给出目标价。近 3 年最大回撤为 -31.83%。");
    expect(r.removed).toHaveLength(1);
    expect(r.removed[0]).toMatch(/^trade-advice/);
  });

  it("规则清单覆盖买卖建议、收益承诺、确定性、概率与目标价", () => {
    expect(COMPLIANCE_PATTERNS.map((p) => p.id)).toEqual(["trade-advice", "trade-imperative", "guarantee", "certainty", "probability", "price-target"]);
  });
});
