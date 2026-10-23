import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * 真实 UI 验收：用户在研究工作台输入真实问题 → 真实扶摇数据 + 真实 LLM → 有证据的研究结论。
 * 结果文本（不含密钥）写入 docs/live-verification/ui-live-<日期>.json，截图写入 docs/screenshots/。
 */
test("真实数据 + 真实 LLM：在研究工作台完成一次研究", async ({ page, request }) => {
  const status = await (await request.get("/api/status")).json();
  test.skip(!status.llmConfigured || status.dataMode !== "fuyao", "未配置真实凭证");

  await page.goto("/research/510300.SH?lens=A");
  await expect(page.getByText("真实行情 · 同花顺扶摇").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/最新交易日 .* 收盘/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "前复权日线" })).toBeVisible();
  // A/B 两路研究必须看到同一份真实事实（此前真实验收中出现过「不一致」）
  await expect(page.getByTestId("fact-fingerprint")).toContainText("与画像 B一致", { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "docs/screenshots/live-research-1440.png" });

  const panel = page.locator("#ai-research");
  const question = "我想长期研究沪深300 ETF，目前有哪些最值得关注的风险和证据？";
  await panel.getByRole("textbox", { name: "研究问题" }).fill(question);
  await panel.getByRole("button", { name: "开始研究" }).click();
  await expect(panel.getByRole("list", { name: "研究进度" }).getByText("market_snapshot")).toBeVisible({ timeout: 120_000 });
  await expect(panel.getByText(/证据与合规校验通过|已自动校正/)).toBeVisible({ timeout: 300_000 });

  const summary = (await panel.locator("p.text-\\[14px\\]").first().innerText()).trim();
  const findings = await panel.locator("li", { has: page.getByText(/已验证事实|基于事实的推断|未验证/) }).allInnerTexts();
  const tools = await panel.getByRole("list", { name: "研究进度" }).locator("ul li").allInnerTexts();
  // 截图时取消顶栏吸顶，避免元素截图拼接时被遮挡
  await page.addStyleTag({ content: "header{position:static!important}" });
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: "docs/screenshots/live-agent-1440.png" });

  fs.mkdirSync("docs/live-verification", { recursive: true });
  fs.writeFileSync(
    path.join("docs/live-verification", `ui-live-${new Date().toISOString().slice(0, 10)}.json`),
    JSON.stringify({ kind: "real-ui-run", at: new Date().toISOString(), lens: "画像 A", question, model: status.llmModel, tools, summary, findings }, null, 2),
    "utf8",
  );
  expect(summary.length).toBeGreaterThan(20);
  expect(findings.length).toBeGreaterThan(0);
});
