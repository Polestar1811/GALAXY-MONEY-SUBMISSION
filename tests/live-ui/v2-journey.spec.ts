import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * V2 真实浏览器验收：真实 DeepSeek 访谈 → 投资人格 → 研究路径 → 扶摇真实数据组合回测。
 * 回答内容为虚构示例；结果（不含密钥）写入 docs/live-verification/v2-ui-live-<日期>.json，截图写入 docs/screenshots/v2-live-*.png。
 */
test("V2 真实链路：深度访谈 → 投资人格 → 财富路径 → 组合探索", async ({ page, request }) => {
  test.setTimeout(420_000);
  const status = await (await request.get("/api/status")).json();
  test.skip(!status.llmConfigured || status.dataMode !== "fuyao", "未配置真实凭证");
  const isRemote = !!process.env.PLAYWRIGHT_BASE_URL;
  const shot = (name: string) => (isRemote ? `test-results/v2-${name}.png` : `docs/screenshots/v2-live-${name}.png`);

  await page.goto("/genesis");
  await page.getByRole("button", { name: "开始了解我" }).click();
  const q = page.locator("#question-text");
  const answers = [
    "希望婚后家里能有一笔安心的钱，不用为钱吵架",
    "明年结婚，大概要用掉 6 万",
    "准备投资的 10 万里有 6 万是结婚要用的",
    "存款基本都在这 10 万里，没有别的储备",
    "希望一年翻倍",
  ];
  const turns: { question: string; answer: string; ack: string | null }[] = [];
  for (const a of answers) {
    const question = (await q.textContent())!.trim();
    await page.getByLabel("你的回答").fill(a);
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByRole("button", { name: "发送" })).toBeEnabled({ timeout: 60_000 }).catch(() => {});
    await expect(q).not.toHaveText(question, { timeout: 60_000 });
    const ack = await page.getByTestId("interview-ack").textContent().catch(() => null);
    turns.push({ question, answer: a, ack });
  }
  await page.screenshot({ path: shot("interview") });
  const facts = await page.getByTestId("known-facts").innerText();

  await page.getByRole("button", { name: "提前结束" }).click();
  await page.getByRole("button", { name: "生成我的投资人格" }).click();
  await expect(page.getByTestId("identity-narrative")).toBeVisible({ timeout: 90_000 });
  const narrative = await page.getByTestId("identity-narrative").innerText();
  await page.screenshot({ path: shot("identity"), fullPage: true });

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "确认，查看我的财富研究路径" }).click();
  await expect(page.getByTestId("money-paths")).toBeVisible({ timeout: 90_000 });
  const order = await page.getByTestId("money-paths").locator("> li").evaluateAll((els) => els.map((e) => e.getAttribute("data-path")));
  const firstWhy = await page.getByTestId("money-paths").locator("> li").first().innerText();
  await page.screenshot({ path: shot("paths"), fullPage: true });
  // 一年内要结婚、没有储备：资金安全路径必须优先
  expect(order[0]).toBe("A");

  await page.getByRole("link", { name: /探索相关的研究组合/ }).first().click();
  await expect(page.getByTestId("portfolio-metrics")).toBeVisible({ timeout: 90_000 });
  const metrics = await page.getByTestId("portfolio-metrics").innerText();
  await expect(page.getByTestId("portfolio-chart")).toBeVisible();
  await page.screenshot({ path: shot("explore"), fullPage: true });

  if (!isRemote) {
    fs.mkdirSync("docs/live-verification", { recursive: true });
    fs.writeFileSync(
      path.join("docs/live-verification", `v2-ui-live-${new Date().toISOString().slice(0, 10)}.json`),
      JSON.stringify({ kind: "v2-real-ui-run", at: new Date().toISOString(), model: status.llmModel, turns, facts, narrative, pathOrder: order, firstPath: firstWhy.slice(0, 600), portfolioMetrics: metrics }, null, 2),
      "utf8",
    );
  }
});
