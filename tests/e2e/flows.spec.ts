import { expect, test, type Page } from "@playwright/test";

/** 演示数据 + Mock LLM（测试替身）。真实模型的访谈验证见 tests/live/v2.live.ts。 */

async function noHorizontalOverflow(page: Page) {
  // body 设置了 overflow-x: hidden，因此必须检查 body.scrollWidth，否则溢出会被掩盖
  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
  );
  expect(overflow, `页面不应出现横向溢出：${page.url()}`).toBeLessThanOrEqual(1);
}

const question = (page: Page) => page.locator("#question-text");

test.describe("首页 Welcome", () => {
  test("先说明为什么理解人，入口：开始了解我、直接体验演示、InvestLens", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("先理解你");
    await expect(page.getByRole("img", { name: "Galaxy" }).first()).toBeVisible();
    await page.getByRole("banner").getByRole("link", { name: "开始了解我" }).click();
    await expect(page).toHaveURL(/\/genesis$/);
    await page.goto("/");
    await page.getByRole("link", { name: /直接体验演示/ }).click();
    await expect(page).toHaveURL(/#demo$/);
    await page.getByRole("link", { name: /以用户 A 体验/ }).click();
    await expect(page).toHaveURL(/\/identity\?demo=A/);
    await expect(page.getByTestId("identity-narrative")).toContainText("Mock 理解");
  });
});

test.describe("Genesis 深度访谈", () => {
  test("自然语言回答、快捷选项、跳过、返回、提前结束 → 投资人格 → 修改 → 确认 → 财富路径 → 组合探索", async ({ page }) => {
    await page.goto("/genesis");
    await page.getByRole("button", { name: "开始了解我" }).click();
    await expect(question(page)).toContainText("如果财富能为你的人生带来一个改变");
    await expect(page.getByTestId("interview-progress")).toContainText("最多 20 题");

    await page.getByLabel("你的回答").fill("希望家里安心");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByTestId("interview-ack")).toContainText("收到：希望家里安心");
    await expect(question(page)).toContainText("未来三年里");
    await expect(page.getByTestId("known-facts")).toContainText("希望家里安心");

    await page.getByRole("button", { name: "暂无重要支出" }).click();
    await page.getByRole("button", { name: "发送" }).click();
    await expect(question(page)).toContainText("什么时候可能需要动用");

    await page.getByRole("button", { name: "跳过" }).click();
    await expect(question(page)).not.toContainText("什么时候可能需要动用");
    await page.getByRole("button", { name: "上一题" }).click();
    await expect(question(page)).toContainText("什么时候可能需要动用");
    await page.getByRole("button", { name: "10 年以上" }).click();
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByTestId("known-facts")).toContainText("10 年以上");

    await page.getByRole("button", { name: "提前结束" }).click();
    await expect(page.getByRole("heading", { name: /谢谢你的耐心/ })).toBeVisible();
    await page.getByRole("button", { name: "生成我的投资人格" }).click();
    await expect(page).toHaveURL(/\/identity$/);
    await expect(page.getByTestId("identity-narrative")).toContainText("Mock 理解");
    await expect(page.getByTestId("risk-triad")).toContainText("客观承受能力");

    // 修改一项理解：展开「时间与精力」并修改期限
    await page.getByRole("button", { name: /时间与精力/ }).click();
    await page.getByLabel("修改预计动用这笔钱的时间").selectOption("5to10y");
    await expect(page.getByText("你修改了画像，上面的文字还是修改前的理解。")).toBeVisible();

    const confirm = page.getByRole("button", { name: "确认，查看我的财富研究路径" });
    await expect(confirm).toBeDisabled();
    await page.getByRole("checkbox").check();
    await confirm.click();
    await expect(page).toHaveURL(/\/paths$/);
    await expect(page.getByTestId("money-paths").locator("> li")).toHaveCount(3);
    await expect(page.getByTestId("order-reason")).toBeVisible();

    await page.getByRole("link", { name: /探索相关的研究组合/ }).first().click();
    await expect(page).toHaveURL(/\/explore\?path=/);
    // 演示数据模式下没有多资产真实价格：明确阻止，不生成任何历史结果
    await expect(page.getByTestId("portfolio-blocked")).toContainText("不生成任何组合历史结果");
  });

  test("同一题面对不同回答，产生不同的追问", async ({ page }) => {
    await page.goto("/genesis");
    await page.getByRole("button", { name: "开始了解我" }).click();
    await page.getByLabel("你的回答").fill("明年要结婚，想有点积蓄");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByText("追问 1/4", { exact: true })).toBeVisible();
    await expect(question(page)).toContainText("结婚大概会用掉");
    const first = await question(page).textContent();

    await page.getByRole("button", { name: "上一题" }).click();
    await page.getByLabel("你的回答").fill("希望一年翻倍");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByText("追问 1/4", { exact: true })).toBeVisible();
    await expect(question(page)).toContainText("先亏掉三成");
    expect(await question(page).textContent()).not.toBe(first);
  });

  test("两位虚构用户：不同的优先研究方向；近期要用钱的用户不会被优先引向增长路径", async ({ page }) => {
    await page.goto("/paths?demo=A");
    const a = page.getByTestId("money-paths").locator("> li");
    await expect(a.first()).toHaveAttribute("data-path", "A");
    await expect(page.locator('[data-path="C"]')).toContainText("需要先满足前提");
    await page.goto("/paths?demo=B");
    await expect(page.getByTestId("money-paths").locator("> li").first()).toHaveAttribute("data-path", "C");
  });
});

test.describe("研究工作台：A/B 画像", () => {
  test("切换 A/B：事实指纹不变，模块顺序/风险/焦点改变", async ({ page }) => {
    await page.goto("/research/510300.SH?lens=A");
    const fp = page.getByTestId("fact-fingerprint");
    await expect(fp).toContainText("与画像 B一致");
    const fpA = (await fp.textContent())!.slice(0, 8);
    const firstModuleA = await page.locator("ol[aria-label^='研究模块'] > li").first().getAttribute("id");
    const firstRiskA = await page.locator("ol[aria-label^='风险'] > li").first().textContent();
    await expect(page.getByText("先确认：近期要用的钱")).toBeVisible();

    await page.getByRole("radio", { name: "画像 B" }).first().click();
    await expect(page.getByText("以十年为尺度")).toBeVisible();
    await expect(fp).toContainText("与画像 A一致");
    const fpB = (await fp.textContent())!.slice(0, 8);
    const firstModuleB = await page.locator("ol[aria-label^='研究模块'] > li").first().getAttribute("id");
    const firstRiskB = await page.locator("ol[aria-label^='风险'] > li").first().textContent();

    expect(fpB).toBe(fpA);
    expect(firstModuleA).toBe("m-drawdown");
    expect(firstModuleB).not.toBe(firstModuleA);
    expect(firstRiskB).not.toBe(firstRiskA);
    await expect(page.getByTestId("diff-summary")).toContainText("模块顺序");
  });

  test("简明模式用大白话解释，专业模式保留完整数据", async ({ page }) => {
    await page.goto("/research/510300.SH?lens=A&mode=simple");
    await expect(page.getByTestId("simple-summary")).toContainText("最难熬的时候");
    await expect(page.getByText("关键指标")).toHaveCount(0);
    // 水合期间 React 可能短暂保留一份隐藏的服务端树，只匹配可见的面板
    await expect(page.locator("#ai-research:visible")).toBeVisible();
    await page.getByRole("radio", { name: "专业" }).click();
    await expect(page.getByText("关键指标")).toBeVisible();
    await expect(page.getByTestId("simple-summary")).toHaveCount(0);
  });

  test("图表周期、并排对比、情景滑杆、模块展开均可交互", async ({ page }) => {
    await page.goto("/research/510300.SH?lens=A");
    await page.getByRole("radio", { name: "3年" }).click();
    await expect(page.getByRole("radio", { name: "3年" })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "并排对比" }).first().click();
    await expect(page.getByText("同一组事实，两种研究重点")).toBeVisible();

    const loss = page.getByTestId("locked-loss");
    const before = await loss.textContent();
    const slider = page.getByRole("slider", { name: "假设回撤幅度" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(loss).not.toHaveText(before!);

    const second = page.locator("ol[aria-label^='研究模块'] > li").nth(1).getByRole("button").first();
    await second.click();
    await expect(second).toHaveAttribute("aria-expanded", "true");
  });

  test("不支持的标的显示诚实状态", async ({ page }) => {
    await page.goto("/research/600519.SH");
    await expect(page.getByText("600519.SH 暂未接入数据")).toBeVisible();
    await expect(page.getByText("不会为没有数据的标的生成任何分析")).toBeVisible();
  });

  test("故障注入：错误与未授权状态", async ({ page }) => {
    await page.goto("/research/510300.SH?simulate=error");
    await expect(page.getByText("研究服务暂时不可用")).toBeVisible();
    await page.goto("/research/510300.SH?simulate=unauthorized");
    await expect(page.getByText("当前没有该数据的访问权限")).toBeVisible();
  });

  test("顶部搜索：匹配可用案例并跳转", async ({ page }) => {
    await page.goto("/app");
    const input = page.getByRole("combobox");
    await input.fill("沪深300");
    await expect(page.getByRole("option", { name: /沪深300ETF/ })).toBeVisible();
    await input.press("Enter");
    await expect(page).toHaveURL(/\/research\/510300\.SH/);
  });
});

test.describe("访谈进度的本设备临时保存", () => {
  test("默认不保存，刷新后不恢复；主动开启后刷新可继续或删除", async ({ page }) => {
    const answerFirst = async () => {
      await page.goto("/genesis");
      await page.getByRole("button", { name: "开始了解我" }).click();
      await page.getByLabel("你的回答").fill("希望家里安心");
      await page.getByRole("button", { name: "发送" }).click();
      await expect(question(page)).toContainText("未来三年里");
    };
    // 默认：不写入本设备
    await answerFirst();
    expect(await page.evaluate(() => localStorage.getItem("galaxy.interview.v2.draft"))).toBeNull();
    await page.reload();
    await expect(page.getByTestId("draft-banner")).toHaveCount(0);

    // 主动开启：刷新后提示继续，不自动恢复
    await answerFirst();
    await page.getByRole("switch", { name: "在本设备临时保存访谈进度" }).click();
    expect(await page.evaluate(() => localStorage.getItem("galaxy.interview.v2.draft"))).not.toBeNull();
    await page.reload();
    await expect(page.getByTestId("draft-banner")).toContainText("1 个问题");
    await page.getByRole("button", { name: "继续上次的访谈" }).click();
    await expect(question(page)).toContainText("未来三年里");
    await expect(page.getByTestId("known-facts")).toContainText("希望家里安心");

    // 关闭开关立即删除
    await page.getByRole("switch", { name: "在本设备临时保存访谈进度" }).click();
    expect(await page.evaluate(() => localStorage.getItem("galaxy.interview.v2.draft"))).toBeNull();
  });
});

test.describe("画像与隐私", () => {
  test("默认不保存；同意后保存在本设备，刷新可恢复；一键清除全部（含访谈与投资人格）", async ({ page }) => {
    await page.goto("/genesis");
    await page.getByRole("button", { name: "开始了解我" }).click();
    for (let i = 0; i < 20; i++) {
      if (await page.getByRole("heading", { name: /谢谢你的耐心/ }).isVisible()) break;
      await page.getByRole("button", { name: "跳过" }).click();
    }
    await expect(page.getByRole("heading", { name: /谢谢你的耐心/ })).toBeVisible();
    await page.getByRole("button", { name: "生成我的投资人格" }).click();
    await expect(page.getByTestId("constraints")).toContainText("实际承受能力还不清楚");
    await page.getByRole("checkbox").check();
    await page.getByRole("switch", { name: "仅保存在此设备" }).click();
    await page.getByRole("button", { name: "确认，查看我的财富研究路径" }).click();
    await expect(page).toHaveURL(/\/paths$/);

    await page.goto("/settings/profile");
    await expect(page.getByText("已保存在此设备")).toBeVisible();
    await expect(page.getByTestId("identity-privacy")).toContainText("galaxy.identity.v2");
    await page.reload();
    await expect(page.getByTestId("identity-privacy")).toContainText("已确认");

    // 原有画像字段仍可单独修改
    await page.getByLabel("修改投资目标").selectOption("retirement");
    await expect(page.getByText("你修改了画像")).toBeVisible();
    await page.getByRole("button", { name: "确认修改" }).click();

    await page.getByRole("button", { name: "一键清除" }).click();
    await page.getByRole("button", { name: "确认清除" }).click();
    await expect(page.getByText("还没有你的画像")).toBeVisible();
    const stored = await page.evaluate(() => [localStorage.getItem("investlens.profile.v1"), localStorage.getItem("galaxy.identity.v2")]);
    expect(stored).toEqual([null, null]);
    await expect(page.getByTestId("identity-privacy")).toContainText("未建立");
  });
});

const V2_PAGES = ["/", "/genesis", "/identity?demo=A", "/paths?demo=B", "/explore?path=B", "/app", "/research/510300.SH", "/research/510300.SH?mode=simple", "/settings/profile", "/design"];

test.describe("浏览器控制台", () => {
  test("主要页面没有控制台错误或未捕获异常", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console.error @${page.url()}: ${m.text().slice(0, 200)}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror @${page.url()}: ${e.message.slice(0, 200)}`));
    await page.addInitScript(() => sessionStorage.setItem("investlens.lens", "A"));
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const url of V2_PAGES) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");
      }
    }
    expect(problems).toEqual([]);
  });
});

test.describe("响应式：无横向溢出", () => {
  for (const vp of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    test(`${vp.name} ${vp.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript(() => sessionStorage.setItem("investlens.lens", "A"));
      for (const url of V2_PAGES) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        await noHorizontalOverflow(page);
      }
    });
  }
});
