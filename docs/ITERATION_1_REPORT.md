# InvestLens 第一迭代完成报告

日期：2026-10-22 · 范围：视觉系统 + 完整前端个性化体验 + 可替换的数据 / 研究接口

## 1. 交付清单

| 需求 | 状态 | 位置 |
|---|---|---|
| R01 独立品牌、深色 Design System、响应式 | ✅ | `components/brand/Logo.tsx`、`app/icon.svg`、`app/globals.css`（@theme Token）、`lib/design-tokens/tokens.ts`、`/design` |
| R02 首页 + 两个可用 CTA | ✅ | `app/page.tsx`、`components/home/HeroPreview.tsx` |
| R03 Genesis 渐进式对话建档 | ✅ | `components/genesis/GenesisFlow.tsx` |
| R04 可编辑、可跳过；明确同意才持久化 | ✅ | `lib/profile/store.tsx`、`components/profile/ProfileManager.tsx` |
| R05 个性化 Dashboard | ✅ | `components/dashboard/*` |
| R06 相同事实下两个虚构画像差异化 | ✅ | `lib/profile/personas.ts`、`components/research/ResearchWorkspace.tsx` |
| R07 投研图表、证据、情景模拟 | ✅ | `components/research/*`、`lib/scenario.ts` |
| R08 数据提供器 / 研究服务接口、确定性 demo 数据、移动端 | ✅ | `lib/providers/*`、`lib/research/*`、`lib/demo-data/*`、`app/api/*` |

### 组件清单

- 设计系统：`Button`（7 变体）、`Badge` / `DemoBadge` / `FictionBadge`、`Panel` / `PanelHeader`、`Segmented`（radiogroup + 方向键）、`Slider`、`Switch`、`Tip` / `InfoTip`、`Skeleton`、`SeverityMeter`、`Kbd`、`Sparkline`、`Sheet`、`ConfirmDialog`、`Toast`、`StateView`（empty / error / unauthorized / unknown / unsupported / anomaly）、`PanelSkeleton`、`RetryButton`
- 布局：`AppShell`（桌面侧边栏、顶部检索、移动端抽屉 + 底部标签栏）、`TopSearch`（combobox，`/` 快捷键）、`LensSegmented` / `LensCard`
- 研究：`PriceChart`、`FactTile`、`FocusCard`、`ModuleList`、`RiskPanel`、`QuestionList`、`EvidencePanel`、`WhyPanel`、`DiffBanner`、`CompareView`、`ScenarioSimulator`
- Dashboard：`MarketBrief`、`GoalCard`、Lens 提示、风险观察、关注列表、研究任务

## 2. 核心创新的验收：A/B 画像

两套明确标记为「虚构」的画像：

| | 画像 A · 近期用款 | 画像 B · 长期储备 |
|---|---|---|
| 期限 | 1 年以内 | 10 年以上 |
| 近 12 个月资金需要 | 很可能需要大部分 | 基本不需要 |
| 应急储备 | 暂时没有 | 有，且独立存放 |
| 主观偏好 / 客观能力 | 考虑小幅增加 / 5%–10%（存在差距） | 按计划持有 / 20%–35% |

切换后（由单元测试与 E2E 测试共同验证）：

| 研究区域 | 画像 A | 画像 B |
|---|---|---|
| 事实层（16 项）与指纹 | `53D04AB6` | `53D04AB6`（完全相同） |
| 研究焦点 | 先确认：近期要用的钱，能否避免在回撤中被迫卖出 | 以十年为尺度：关注估值区间、持有成本与持有纪律 |
| 模块顺序 | 回撤×用钱时点 → 波动 → 持有纪律 → 成分 → 估值 → 成本 | 估值 → 成本 → 持有纪律 → 波动 → 成分 → 回撤 |
| 风险强调 | 用钱时点与回撤重叠：高关注（第 1） | 同一风险：低关注（末位） |
| 解释（对你意味着） | 以流动性 / 愿意≠能够为主 | 以长期 / 资深视角为主 |
| 待验证问题顺序 | 下跌 25% 是否打乱计划优先 | 长期计划停止条件优先 |
| 情景模拟默认值 | 1 年、取款 15 万、回撤 13% | 15 年、每月追加 3000、回撤 32% |
| Dashboard | 简报、目标卡（用款标记）、风险、任务全部重排 | 同上 |

页面中的「事实层指纹」和差异条（模块顺序 5 处、风险强调 6 项、解释重点 6 处、待验证问题 4 处）实时计算，不是硬编码。

## 3. 已执行的测试与真实结果

环境：Windows 11、Node 24.22.1、Next.js 15.5.28、Chrome（本机）。

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 通过，0 错误 |
| `npm run build` | 通过，13 个路由（7 个页面含 404、5 个 API、icon）全部生成 |
| `npm run test`（Vitest） | **21 / 21 通过** |
| `npx playwright test` | **32 / 32 通过**（11 项流程 + 21 张截图） |

开发过程中测试真实发现并修复的问题：

1. **情景模拟公式不一致**（单元测试发现）：把「年化回报」按月名义利率 r/12 复利，导致 10 年终值高估约 1.1%。改为等效月利率 `(1+r)^(1/12) − 1`，使无定投时严格等于 `P·(1+r)^n`。
2. **Genesis 竞争条件**（E2E 发现）：选择答案后 220ms 确认动画期间点击「跳过」，会覆盖刚选的答案并前进两步。增加过渡锁与 `stepRef`，动画期间禁用返回 / 跳过。
3. **移动端 Dashboard 横向溢出**（截图人工检查发现，原测试漏检）：grid 子项 `min-width: auto` 加上截断标题导致简报面板超出 390px 视口。`Panel` 增加 `min-w-0`；同时修正测试——`body` 设置了 `overflow-x: hidden`，原先检查 `documentElement.scrollWidth` 会掩盖溢出，改为同时检查 `body.scrollWidth`，并确认新测试在未修复版本上会失败。
4. **价格轴刻度不均匀**（截图检查）：改为按 0.05 / 0.1 取整的定义域。
5. **合成序列过于悲观**（数据检查）：初始种子得到 3 年回撤 −44%、终值 2.69。扫描种子，选择更具代表性的形态（3 年回撤 −31.8%，1 年回撤 −12.5%）。
6. 其它视觉修正：目标卡时间轴标签溢出、研究页重复的视角切换、长侧栏 sticky 不可达、1 年期情景曲线只有两个点、首页预览左右栏高度不平衡、减少动态效果偏好下首页预览不再自动轮播。

截图位于 `docs/screenshots/`（1440 / 768 / 390 × 首页、Genesis、Dashboard、Research A、Research B、Profile、Design）。

### 可重复的手工验收步骤

1. `/` → 点「体验演示」→ 确认 URL 为 `/research/510300.SH?lens=A`，页头显示「画像 A」。
2. 记下事实层指纹 → 切到画像 B → 指纹不变；研究焦点标题、模块 1 号位、风险首项均改变；差异条显示数字。
3. 在「关键指标」中确认所有数值带「演示 / 计算 / 待核验 / 未知」状态；折溢价率显示「未知」而非 0。
4. 图表切换 1月 / 3年、关闭 MA20；情景模拟拖动「假设回撤幅度」→ 锁定损失变化；展开公式。
5. `/genesis` 完成 8 问（中途返回修改一题、跳过收入）→ 未勾选确认时按钮禁用 → 确认后进入 `/app`，「我的」视角可用。
6. 刷新 `/app` → 未授权保存时画像消失，回到空状态。
7. 重新建档并开启「仅保存在此设备」→ `/settings/profile` 刷新后仍显示；修改一项 → 出现「确认修改」；一键清除 → 本地存储为空。
8. 搜索「茅台」→ Enter → 显示「暂未接入数据」，无任何数字。
9. `/research/510300.SH?simulate=error|unauthorized|slow|empty` 分别显示对应状态。
10. 键盘：Tab 可达所有控件，焦点环可见；Genesis 中按 1–5 选择；分段控件方向键切换；`/` 聚焦搜索。

## 4. 第二迭代的明确扩展点

| 扩展点 | 位置 | 要做的事 |
|---|---|---|
| 真实行情 | `lib/providers/fuyao-provider.ts`、`lib/providers/index.ts` | 实现扶摇 API 字段映射到 `AssetSnapshot` / `PriceHistory` / `MarketFact`，`source.kind = "api"`、`asOf` 用接口真实时点；`MARKET_DATA_PROVIDER=fuyao` 切换。密钥只在服务端读取（`server-only`）。 |
| 失败不降级为 mock | `lib/api/respond.ts`、`ProviderError` | 无权限 → 403 `UNAUTHORIZED`、上游失败 → 502；UI 已有对应状态，禁止静默回退到演示数据。 |
| 标的消歧 | `MarketDataProvider.search` | 用真实代码表替换 `SYMBOL_DIRECTORY`，`supported` 由权限决定。 |
| LLM 研究服务 | `lib/research/index.ts`（`RESEARCH_SERVICE=llm`） | 新增 `LLMResearchService implements ResearchService`：问题理解 → 子任务规划（`ResearchTask.tool`）→ 工具调用（Provider / iFinD MCP）→ 输出相同的 `ResearchResult`。事实层只能来自 Provider，模型不得生成数值。 |
| 自由提问 | `ResearchWorkspace` 研究问题表单 | 当前诚实提示「第二迭代开放」；接入后把 `question` 传入 `ResearchRequest`。 |
| 个性化 | `lib/personalization/*` | 保留规则作为可解释的底座与回归基线；LLM 输出的排序须附 `reasons[]`，并继续通过事实不变性测试。 |
| 证据溯源 | `types/evidence.ts` | `verified` / `conflict` 状态已预留，接入真实来源 URL、文档与时点。 |
| 持久化与记录（迭代三） | `lib/profile/store.tsx` | 已有同意感知的本地存储；研究任务记录可沿用同样的显式授权模式。 |

## 5. 仍需打磨的点（按优先级）

1. **P1** 图表缺少十字光标对应的价格轴读数与区间拖选；移动端图表手势可以更友好。
2. **P1** 研究页信息量大，移动端可增加模块间的锚点导航（如粘性目录）。
3. **P2** 风险与模块的展开态在切换画像时保留，可考虑切换后自动展开新的第 1 名。
4. **P2** 中文字体依赖系统字体（Windows 为微软雅黑），在设计稿级别上可考虑自托管 HarmonyOS Sans / 思源黑体子集。
5. **P2** 涨跌色目前固定为 A 股「红涨绿跌」，可在画像页增加显示偏好。
6. **P2** 尚未做系统的屏幕阅读器（NVDA）走查，只做了语义化角色、`aria-*` 与键盘路径的自动化检查。
