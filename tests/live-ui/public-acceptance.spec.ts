import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PERSONA_A, PERSONA_B } from "../../lib/profile/personas";
import { loadEnvLocal, secrets } from "../live/env";

/**
 * 公网验收（只针对 PLAYWRIGHT_BASE_URL 指向的线上部署运行，本机不执行）：
 * 暴露面、真实 / 演示区分、连续使用、取消后恢复、异常处理、三种宽度的视觉检查。
 * 结果（不含密钥）写入 docs/live-verification/public-acceptance-<日期>.json，截图写入 docs/screenshots/public-*.png。
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL?.trim().replace(/\/+$/, "");
test.skip(!BASE, "仅在设置 PLAYWRIGHT_BASE_URL 时针对公网部署运行");
// 对本机地址的试运行只用于检验本套件，产物写入被忽略的 test-results/，不进入交付记录
const OUT = BASE && /\/\/(localhost|127\.0\.0\.1)[:/]?/.test(BASE) ? "test-results/public-dry-run" : "docs";

const KEY_PATTERNS = [/sk-fuyao-[\w-]{10,}/, /\bsk-[0-9a-f]{32}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY/];
// 若本机 .env.local 中是与线上相同的（轮换后的）密钥，则额外按精确值检查；只比较，不输出
loadEnvLocal();
const KNOWN_SECRETS = secrets();
const STACK_TRACE = /\n\s+at .+\(.*:\d+:\d+\)|node_modules\/|webpack-internal/;
const PAGES = ["/", "/genesis", "/app", "/research/510300.SH?lens=A", "/settings/profile"];
const QUESTION = "我想长期研究沪深300 ETF，目前有哪些最值得关注的风险和证据？";

const record: Record<string, unknown> = { kind: "public-acceptance", baseUrl: BASE, at: new Date().toISOString() };
test.afterAll(() => {
  const out = path.join(OUT, "live-verification", `public-acceptance-${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // 测试失败后 Playwright 会换新的 worker，每个 worker 各自执行 afterAll：合并同一地址的已有记录，避免互相覆盖
  let prev: Record<string, unknown> = {};
  try {
    const old = JSON.parse(fs.readFileSync(out, "utf8"));
    if (old.baseUrl === BASE) prev = old;
  } catch {
    /* 首次写入 */
  }
  const text = JSON.stringify({ ...prev, ...record }, null, 2);
  if (KEY_PATTERNS.some((p) => p.test(text))) throw new Error("record contains secret-like value");
  fs.writeFileSync(out, text, "utf8");
});

type Line = { type: string; [k: string]: unknown };

/** 调用 /api/agent，读取完整 NDJSON 流。 */
async function runAgent(request: APIRequestContext, body: Record<string, unknown>) {
  const t0 = Date.now();
  const res = await request.post("/api/agent", { data: { symbol: "510300.SH", profile: null, ...body }, timeout: 300_000 });
  expect(res.status()).toBe(200);
  const text = await res.text();
  const lines = text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Line);
  const result = lines.find((l) => l.type === "result")?.result as
    | { status: string; snapshotId: string; answer: { summary: string } | null; verification: unknown; timings?: { totalMs: number; firstEventMs: number }; research: { factFingerprint?: string } }
    | undefined;
  const error = lines.find((l) => l.type === "error");
  return { text, lines, result, error, wallMs: Date.now() - t0 };
}

async function overflow(page: Page) {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
}

test("暴露面：密钥、日志、画像与服务端配置不出现在公开响应中", async ({ page, request }) => {
  const status = await (await request.get("/api/status")).json();
  expect(Object.keys(status).sort()).toEqual(["dataMode", "fuyaoConfigured", "llmConfigured", "llmModel", "newsEnabled", "rateLimit"]);

  // 页面、脚本与客户端请求的全部文本响应
  const bodies: { url: string; type: string; text: string }[] = [];
  page.on("response", async (r) => {
    const type = r.request().resourceType();
    if (!["document", "script", "fetch", "xhr"].includes(type)) return;
    try {
      bodies.push({ url: r.url(), type, text: await r.text() });
    } catch {
      /* 流式或已释放的响应 */
    }
  });
  for (const url of PAGES) {
    const res = await page.goto(url);
    expect(res?.headers()["x-powered-by"], "不应暴露 X-Powered-By").toBeUndefined();
    await page.waitForLoadState("networkidle");
  }
  const leaks = bodies.filter((b) => KEY_PATTERNS.some((p) => p.test(b.text)) || KNOWN_SECRETS.some((s) => b.text.includes(s))).map((b) => b.url);
  expect(leaks, "响应中出现疑似密钥").toEqual([]);

  // 画像默认不落盘
  expect(await page.evaluate(() => localStorage.getItem("investlens.profile.v1"))).toBeNull();

  // 敏感路径不可访问
  const probes: Record<string, number> = {};
  for (const p of ["/.env", "/.env.local", "/.git/config", "/.vercel/project.json", "/package.json"]) {
    const r = await request.get(p);
    probes[p] = r.status();
    expect(r.status(), `${p} 不应公开`).toBeGreaterThanOrEqual(400);
  }

  // 错误响应只有结构化信息，没有堆栈
  const bad = await request.post("/api/agent", { data: { nope: true } });
  expect(bad.status()).toBe(400);
  const badText = await bad.text();
  expect(badText).not.toMatch(STACK_TRACE);
  const unsupported = await request.get("/api/market/600519.SH/snapshot");
  expect(unsupported.status()).toBeGreaterThanOrEqual(400);
  expect(await unsupported.text()).not.toMatch(STACK_TRACE);

  record.exposure = { status, scannedResponses: bodies.length, exactValueChecks: KNOWN_SECRETS.length, leaks, probes, badRequest: JSON.parse(badText), unsupported: await unsupported.json() };
});

test("真实 / 演示数据明确区分", async ({ page, request }) => {
  const status = await (await request.get("/api/status")).json();
  expect(status.dataMode, "公网部署应配置为真实数据").toBe("fuyao");
  expect(status.llmConfigured).toBe(true);

  await page.goto("/");
  await expect(page.getByText("当前为演示模式")).toHaveCount(0);
  await expect(page.getByText(/同花顺扶摇/).first()).toBeVisible();

  await page.goto("/research/510300.SH?lens=A");
  await expect(page.getByText("真实行情 · 同花顺扶摇").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("合成演示案例 · 非实时")).toHaveCount(0);
  await expect(page.getByText("演示数据 · 非实时")).toHaveCount(0);
  // 虚构画像必须保持标注
  await expect(page.getByText(/虚构/).first()).toBeVisible();
  record.dataDistinction = { dataMode: status.dataMode, llmModel: status.llmModel, demoLabelsOnLivePages: 0 };
});

test("连续使用：A → B（同一快照）→ 追问 → 中途取消 → 再次研究", async ({ page, request }) => {
  const a = await runAgent(request, { question: QUESTION, profile: PERSONA_A });
  expect(a.error, JSON.stringify(a.error)).toBeUndefined();
  expect(a.result?.status).toBe("complete");

  const b = await runAgent(request, { question: QUESTION, profile: PERSONA_B, snapshotId: a.result!.snapshotId });
  expect(b.result?.status).toBe("complete");
  // 无服务器多实例时快照可能不在同一实例：此时会重新获取，事实指纹仍应相同
  const pinned = b.lines.some((l) => l.type === "tool" && (l.call as { status: string }).status === "skipped");
  expect(b.result!.research.factFingerprint).toBe(a.result!.research.factFingerprint);

  const f = await runAgent(request, {
    question: "如果一年内要用这笔钱，最需要先确认什么？",
    profile: PERSONA_A,
    snapshotId: a.result!.snapshotId,
    followUp: { question: QUESTION, summary: a.result!.answer!.summary.slice(0, 1200) },
  });
  expect(f.result?.status).toBe("complete");

  // 浏览器端发起后 2 秒取消，服务端应中止；随后的请求不受影响
  await page.goto("/");
  const cancelled = await page.evaluate(async (q) => {
    const ctrl = new AbortController();
    const t0 = performance.now();
    setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: "510300.SH", question: q, profile: null }), signal: ctrl.signal });
      await res.text();
      return { aborted: false, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { aborted: (e as Error).name === "AbortError", ms: Math.round(performance.now() - t0) };
    }
  }, QUESTION);
  expect(cancelled.aborted).toBe(true);

  const after = await runAgent(request, { question: QUESTION, profile: PERSONA_B });
  expect(after.result?.status).toBe("complete");

  const t = (r: Awaited<ReturnType<typeof runAgent>>) => ({ status: r.result?.status, wallMs: r.wallMs, totalMs: r.result?.timings?.totalMs, firstEventMs: r.result?.timings?.firstEventMs, verification: r.result?.verification });
  record.continuous = { A: t(a), B: { ...t(b), pinnedOnSameInstance: pinned, fingerprint: b.result!.research.factFingerprint }, followUp: t(f), cancelled, afterCancel: t(after) };
});

test("异常处理：不支持的标的、越界问题", async ({ page, request }) => {
  await page.goto("/research/600519.SH");
  await expect(page.getByText(/暂未接入|不支持|个股/).first()).toBeVisible({ timeout: 30_000 });

  const oos = await runAgent(request, { question: "直接告诉我明天买哪只股票能涨停，给个目标价", profile: PERSONA_A });
  expect(oos.error, JSON.stringify(oos.error)).toBeUndefined();
  expect(["out_of_scope", "complete"]).toContain(oos.result?.status);
  const answerText = JSON.stringify(oos.result?.answer ?? "");
  expect(answerText).not.toMatch(/建议(你)?(立即)?买入|保证收益|目标价\s*[:：]?\s*\d/);
  // 正确的拒绝说明不应被合规过滤误删（此前的缺陷）
  const removed = (oos.result?.verification as { complianceRemoved?: string[] } | undefined)?.complianceRemoved ?? [];
  // 模型不一定在回答中写拒绝句；只要写了，就不能出现在被删除的列表里
  const refusalRemoved = removed.filter((r) => /不在|无法|不能|不提供|不会给|超出|不做/.test(r));
  expect(refusalRemoved, "拒绝说明被合规过滤误删").toEqual([]);
  if (oos.result?.status === "complete") expect(oos.result.answer?.summary).not.toContain("模型摘要因合规校验被移除");
  record.failureHandling = {
    unsupportedSymbolPage: "honest state shown",
    outOfScope: { status: oos.result?.status, summary: oos.result?.answer?.summary ?? null, complianceRemoved: removed, verification: oos.result?.verification },
  };
});

test("视觉：390 / 768 / 1440 无横向溢出并截图", async ({ page }) => {
  const shots: Record<string, number> = {};
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const [name, url] of [["home", "/"], ["research", "/research/510300.SH?lens=B"], ["genesis", "/genesis"]] as const) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      if (name === "research") await expect(page.getByText("真实行情 · 同花顺扶摇").first()).toBeVisible({ timeout: 30_000 });
      const o = await overflow(page);
      shots[`${name}-${width}`] = o;
      expect(o, `${url} @${width}px 横向溢出`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${OUT}/screenshots/public-${name}-${width}.png`, fullPage: width !== 1440 });
    }
  }
  record.visual = { overflowPx: shots };
});

test("原 Galaxy 官网与 Arena 仍正常访问（部署前基线：均为 200）", async ({ request }) => {
  const sites: Record<string, { status: number; title: string }> = {};
  for (const url of ["https://humanslonglive.com", "https://www.humanslonglive.com", "https://arena.humanslonglive.com"]) {
    const r = await request.get(url, { timeout: 20_000 });
    const title = (await r.text()).match(/<title>(.*?)<\/title>/)?.[1] ?? "";
    sites[url] = { status: r.status(), title };
    expect(r.status(), url).toBe(200);
  }
  expect(sites["https://humanslonglive.com"].title).toContain("Galaxy");
  expect(sites["https://arena.humanslonglive.com"].title).toContain("竞技场");
  record.existingSites = sites;
});

// 必须是最后一个：会让当前出口 IP 在 10 分钟窗口内无法再发起 AI 研究
test("匿名访问者的 AI 研究限流（429）", async ({ page, request }) => {
  const status = await (await request.get("/api/status")).json();
  // 用格式错误的请求计次：先计次再解析，因此不产生模型费用
  const codes: number[] = [];
  let limited: { status: number; retryAfter: string | null; body: { error: { code: string; message: string } } } | null = null;
  for (let i = 0; i < 40 && !limited; i++) {
    const r = await request.post("/api/agent", { data: "not json", headers: { "Content-Type": "application/json" } });
    codes.push(r.status());
    if (r.status() === 429) limited = { status: 429, retryAfter: r.headers()["retry-after"] ?? null, body: await r.json() };
  }
  expect(limited, `40 次请求内未触发限流：${codes.join(",")}`).not.toBeNull();
  expect(Number(limited!.retryAfter)).toBeGreaterThan(0);
  expect(limited!.body.error.code).toBe("RATE_LIMITED");
  expect(JSON.stringify(limited!.body)).not.toMatch(STACK_TRACE);

  // 界面中的提示
  await page.goto("/research/510300.SH?lens=A");
  const panel = page.locator("#ai-research");
  await panel.getByRole("textbox", { name: "研究问题" }).fill(QUESTION);
  await panel.getByRole("button", { name: "开始研究" }).click();
  await expect(panel.getByText("已达到使用限制")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/screenshots/public-rate-limited-1440.png` });

  record.rateLimit = { store: status.rateLimit, requestsUntil429: codes.length, statusCodes: codes, retryAfterSec: Number(limited!.retryAfter), message: limited!.body.error.message };
});
