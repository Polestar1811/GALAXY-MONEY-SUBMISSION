import { defineConfig } from "vitest/config";
import path from "node:path";

/** 真实接口验证（npm run verify:live）。与单元测试分离，Mock 不计入真实验证。 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    include: ["tests/live/**/*.live.ts"],
    environment: "node",
    testTimeout: 180_000,
    env: { INVESTLENS_LOG: "off" },
  },
});
