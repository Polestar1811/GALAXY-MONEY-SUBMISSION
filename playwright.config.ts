import { defineConfig } from "@playwright/test";

/**
 * 端到端测试：使用本机 Chrome（channel: "chrome"），无需下载浏览器。
 * - 应用以「演示数据 + Mock LLM」启动在 3100 端口（需先 npm run build）。
 * - Mock LLM 是测试替身（tests/e2e/mock-llm-server.mjs），不计入真实 LLM 验证。
 * - 真实扶摇 / 真实 LLM 验证见 npm run verify:live。
 */
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    colorScheme: "dark",
    locale: "zh-CN",
  },
  webServer: [
    {
      command: "node tests/e2e/mock-llm-server.mjs",
      url: "http://127.0.0.1:4010/health",
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 20_000,
      env: { MOCK_LLM_PORT: "4010" },
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        MARKET_DATA_PROVIDER: "demo",
        LLM_API_KEY: "e2e-mock-key",
        LLM_BASE_URL: "http://127.0.0.1:4010/v1",
        LLM_MODEL: "e2e-mock-model",
        INVESTLENS_LOG: "off",
        // 同一 IP 在几分钟内发出数百次请求；限流逻辑由单元测试与公网验收覆盖
        INVESTLENS_RATE_LIMIT: "off",
      },
    },
  ],
});
