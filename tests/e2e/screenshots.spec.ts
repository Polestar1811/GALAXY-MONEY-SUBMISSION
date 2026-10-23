import { test } from "@playwright/test";

/** 生成 docs/screenshots 下的运行截图（1440 / 768 / 390）。演示数据 + Mock LLM。 */
const PAGES = [
  { name: "home", url: "/" },
  { name: "genesis", url: "/genesis", step: true },
  { name: "identity-A", url: "/identity?demo=A", wait: "identity-narrative" },
  { name: "paths-A", url: "/paths?demo=A", wait: "money-paths" },
  { name: "paths-B", url: "/paths?demo=B", wait: "money-paths" },
  { name: "explore", url: "/explore?path=B" },
  { name: "research-A", url: "/research/510300.SH?lens=A" },
  { name: "research-simple", url: "/research/510300.SH?lens=A&mode=simple" },
  { name: "profile", url: "/settings/profile" },
  { name: "design", url: "/design" },
];
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  for (const p of PAGES) {
    test(`screenshot ${p.name} @${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(p.url);
      await page.waitForLoadState("networkidle");
      if (p.step) {
        await page.getByRole("button", { name: "开始了解我" }).click();
        await page.getByLabel("你的回答").fill("希望婚后家里有一笔安心的钱，明年要结婚");
        await page.getByRole("button", { name: "发送" }).click();
        await page.getByText("追问 1/4", { exact: true }).waitFor();
      }
      if (p.wait) await page.getByTestId(p.wait).waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `docs/screenshots/${p.name}-${vp.name}.png`, fullPage: vp.name === "1440" });
    });
  }
}
