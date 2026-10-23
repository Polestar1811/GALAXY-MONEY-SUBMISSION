import { test } from "@playwright/test";

/** AI 研究面板截图（演示数据 + Mock LLM 测试替身；文件名带 mockllm 以示区分）。 */
for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
]) {
  test(`agent panel screenshot @${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/research/510300.SH?lens=A");
    const panel = page.locator("#ai-research");
    await panel.getByRole("textbox", { name: "研究问题" }).fill("我想长期研究沪深300 ETF，目前有哪些最值得关注的风险和证据？");
    await panel.getByRole("button", { name: "开始研究" }).click();
    await panel.getByText("【Mock 回答】").waitFor({ timeout: 20_000 });
    await panel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await panel.screenshot({ path: `docs/screenshots/agent-mockllm-${vp.name}.png` });
  });
}

test("agent A/B compare screenshot @1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/research/510300.SH?lens=A");
  const panel = page.locator("#ai-research");
  await panel.getByRole("textbox", { name: "研究问题" }).fill("这只 ETF 有哪些值得关注的风险？");
  await panel.getByRole("button", { name: "A/B 对比" }).click();
  await panel.getByTestId("ai-compare-fingerprint").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await panel.screenshot({ path: "docs/screenshots/agent-mockllm-ab-1440.png" });
});
