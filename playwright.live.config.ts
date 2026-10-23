import { defineConfig } from "@playwright/test";

/**
 * 真实 UI 验收与演示录屏：
 * - 默认：本机生产服务器（读取 .env.local 中的真实凭证），端口 3300。
 * - 设置 PLAYWRIGHT_BASE_URL=https://<公网地址> 时直接验证线上部署，不启动本地服务。
 * 与常规 E2E（演示数据 + Mock LLM）完全分离；没有凭证时测试自动跳过。
 */
const remote = process.env.PLAYWRIGHT_BASE_URL?.trim();

export default defineConfig({
  testDir: "tests/live-ui",
  timeout: 360_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: remote || "http://localhost:3300", channel: "chrome", colorScheme: "dark", locale: "zh-CN", viewport: { width: 1440, height: 900 } },
  ...(remote ? {} : { webServer: { command: "npx next start -p 3300", url: "http://localhost:3300", reuseExistingServer: false, timeout: 120_000 } }),
});
