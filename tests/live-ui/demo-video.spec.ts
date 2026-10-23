import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * 真实产品演示录屏（npm run record:demo）：真实扶摇数据 + 真实 LLM，浏览器实际操作录制。
 * 没有任何剪辑或预设内容；等待时间即真实耗时。输出 docs/demo/investlens-demo.webm。
 */
test.use({ video: { mode: "on", size: { width: 1440, height: 900 } }, viewport: { width: 1440, height: 900 } });

async function glide(page: Page, to: number, steps = 12) {
  const from = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), from + ((to - from) * i) / steps);
    await page.waitForTimeout(60);
  }
}

async function glideTo(page: Page, selector: string, offset = 80) {
  const y = await page.locator(selector).first().evaluate((el, o) => el.getBoundingClientRect().top + window.scrollY - o, offset);
  await glide(page, y);
}

test("InvestLens 真实产品演示", async ({ page, request }) => {
  test.setTimeout(420_000);
  const status = await (await request.get("/api/status")).json();
  test.skip(!status.llmConfigured || status.dataMode !== "fuyao", "需要真实凭证");

  // 0–20s：品牌与核心主张
  await page.goto("/");
  await page.waitForTimeout(3500);
  await glideTo(page, "#stages");
  await page.waitForTimeout(3500);
  await glideTo(page, "#perspectives");
  await expect(page.getByText("A / B 一致").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(5000);

  // 20–45s：Genesis 用户画像
  await page.goto("/genesis");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "开始了解我" }).click();
  for (const label of ["大额支出", "1 年以内", "有一些经验", "考虑小幅增加", "5% – 10%", "很可能需要大部分", "暂时没有"]) {
    await page.getByRole("radio", { name: new RegExp(label) }).click();
    await page.waitForTimeout(900);
  }
  await page.getByRole("button", { name: "跳过", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "确认并生成我的研究视角" }).click();
  await page.waitForTimeout(3500);

  // 45–95s：真实金融数据与 AI 研究流程
  await page.goto("/research/510300.SH?lens=A");
  await expect(page.getByTestId("fact-fingerprint")).toContainText("一致", { timeout: 60_000 });
  await page.waitForTimeout(3000);
  await glideTo(page, "#ai-research");
  const panel = page.locator("#ai-research");
  await panel.getByRole("textbox", { name: "研究问题" }).fill("我想长期研究沪深300 ETF，目前有哪些最值得关注的风险和证据？");
  await page.waitForTimeout(800);
  await panel.getByRole("button", { name: "开始研究" }).click();
  await expect(panel.getByText(/证据与合规校验通过|已自动校正/)).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(2000);
  await glide(page, (await page.evaluate(() => window.scrollY)) + 520, 20);
  await page.waitForTimeout(3500);
  await panel.getByRole("button", { name: /^e-/ }).first().click();
  await page.waitForTimeout(3000);

  // 95–130s：A/B 切换与个性化差异（同一事实）
  await glide(page, 0);
  await page.waitForTimeout(1200);
  await page.getByRole("radio", { name: "画像 B" }).first().click();
  await expect(page.getByTestId("fact-fingerprint")).toContainText("与画像 A一致", { timeout: 60_000 });
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "并排对比" }).first().click();
  await page.waitForTimeout(1500);
  await glideTo(page, "text=同一组事实，两种研究重点");
  await page.waitForTimeout(5000);

  // 130–150s：证据与用户控制权
  await page.goto("/settings/profile");
  await page.waitForTimeout(3000);
  await glide(page, 600, 16);
  await page.waitForTimeout(3000);

  const video = page.video();
  await page.close();
  if (video) {
    fs.mkdirSync("docs/demo", { recursive: true });
    await video.saveAs(path.join("docs/demo", "investlens-demo.webm"));
  }
});
