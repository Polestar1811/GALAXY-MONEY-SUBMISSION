import { expect, test } from "@playwright/test";

/**
 * AI 研究工作流 E2E（演示数据 + Mock LLM 测试替身）。
 * 验证 UI 链路：提问 → 阶段进度与工具调用 → 经核验的结论 → 证据跳转 → 追问 → A/B 对比 → 取消。
 */
test.describe("AI 研究 Agent", () => {
  test("提问后展示阶段进度、工具调用、证据引用与使用的画像字段", async ({ page }) => {
    await page.goto("/research/510300.SH?lens=A");
    const panel = page.locator("#ai-research");
    await panel.getByRole("textbox", { name: "研究问题" }).fill("我想长期研究沪深300 ETF，目前有哪些最值得关注的风险和证据？");
    await panel.getByRole("button", { name: "开始研究" }).click();

    await expect(panel.getByText("【Mock 回答】")).toBeVisible({ timeout: 20_000 });
    const progress = panel.getByRole("list", { name: "研究进度" });
    for (const s of ["理解问题与画像", "生成研究计划", "调用金融数据工具", "核验数据与证据", "按画像调整研究重点", "生成研究结论"]) {
      await expect(progress.getByText(s)).toBeVisible();
    }
    await expect(progress.getByText("market_snapshot")).toBeVisible();
    await expect(panel.getByText("已验证事实").first()).toBeVisible();
    await expect(panel.getByText("证据与合规校验通过")).toBeVisible();
    await expect(panel.getByText("投资期限：1 年以内", { exact: true })).toBeVisible();
    await expect(panel.getByText(/未发送：收入稳定性/)).toBeVisible();
    await expect(panel.getByText("LLM · e2e-mock-model", { exact: false })).toBeVisible();

    // 证据引用跳转到证据区
    await panel.getByRole("button", { name: "e-drawdown" }).first().click();
    await expect(page.locator("li", { hasText: "回撤与波动计算" }).first()).toHaveClass(/border-brand/);

    // 追问
    await panel.getByRole("button", { name: "回撤修复通常需要多长时间？" }).click();
    await expect(panel.getByText("针对「回撤修复通常需要多长时间？」")).toBeVisible({ timeout: 20_000 });
  });

  test("A/B 对比：同一事实快照，不同研究重点", async ({ page }) => {
    await page.goto("/research/510300.SH?lens=A");
    const panel = page.locator("#ai-research");
    await panel.getByRole("textbox", { name: "研究问题" }).fill("这只 ETF 有哪些值得关注的风险？");
    await panel.getByRole("button", { name: "A/B 对比" }).click();
    const fp = panel.getByTestId("ai-compare-fingerprint");
    await expect(fp).toBeVisible({ timeout: 30_000 });
    await expect(fp).toContainText("同一事实快照：是");
    await expect(fp).toContainText("一致");
    await expect(panel.getByText("研究首先关注「如果用钱时恰好遇到回撤」")).toBeVisible();
    await expect(panel.getByText(/研究首先关注「(当前估值处在什么区间|费率和跟踪误差的长期复利)」/)).toBeVisible();
  });

  test("研究进行中可以取消，取消后不显示任何结论，服务端也不再调用模型", async ({ page, request }) => {
    const stats = async () => (await request.get("http://127.0.0.1:4010/stats")).json() as Promise<{ plan: number; respond: number }>;
    await page.goto("/research/510300.SH?lens=B");
    const panel = page.locator("#ai-research");
    await panel.getByRole("textbox", { name: "研究问题" }).fill("[slow] 长期持有的主要风险？");
    await panel.getByRole("button", { name: "开始研究" }).click();
    await expect(panel.getByRole("button", { name: "取消" })).toBeVisible();
    await expect.poll(async () => (await stats()).plan).toBeGreaterThan(0);
    const before = await stats();
    await panel.getByRole("button", { name: "取消" }).click();
    await expect(panel.getByText("研究未完成")).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText("【Mock 回答】")).toHaveCount(0);
    // 规划阶段被 Mock 延迟 4 秒；等待其结束后，确认服务端没有继续进入「生成结论」阶段
    await page.waitForTimeout(6000);
    expect((await stats()).respond).toBe(before.respond);
    await expect(panel.getByText("【Mock 回答】")).toHaveCount(0);
  });

  test("服务端限流（429）时显示明确提示，不生成任何结论", async ({ page }) => {
    // 拦截为服务端的 429 响应体（限流逻辑本身由单元测试与公网验收覆盖）
    await page.route("**/api/agent", (route) =>
      route.fulfill({
        status: 429,
        headers: { "Retry-After": "420", "Content-Type": "application/json" },
        body: JSON.stringify({ error: { code: "RATE_LIMITED", message: "AI 研究请求过于频繁：每位访问者每 10 分钟最多 12 次，请在约 7 分钟后再试。行情与规则研究不受影响。", retryable: true } }),
      }),
    );
    await page.goto("/research/510300.SH?lens=A");
    const panel = page.locator("#ai-research");
    await panel.getByRole("textbox", { name: "研究问题" }).fill("这只 ETF 有哪些值得关注的风险？");
    await panel.getByRole("button", { name: "开始研究" }).click();
    await expect(panel.getByText("已达到使用限制")).toBeVisible();
    await expect(panel.getByText(/约 7 分钟后再试/)).toBeVisible();
    await expect(panel.getByText("【Mock 回答】")).toHaveCount(0);
    // 规则研究模块不受影响
    await expect(page.getByTestId("fact-fingerprint")).toBeVisible();
  });
});
