# Galaxy Money V2 — 交付报告

> 分支 `feature/galaxy-money-v2` · 生产版本保持不变（标签 `prod-2026-10-23`，`invest.humanslonglive.com`）· 未合并 main
> 配套文档：[产品需求](GALAXY_MONEY_V2_PRD.md) · [测试报告](GALAXY_MONEY_V2_TEST_REPORT.md) · [AI 使用记录](AI_USAGE_LOG.md#galaxy-money-v22026-10-23)

## 1. 交付状态

| 批次 | 内容 | 状态 |
|---|---|---|
| V2.1 人的理解 | Galaxy 正式标志；Genesis 深度访谈（16 题库、≤20 题、≤4 追问，程序强制）；七维投资人格；Investor Identity 页面；推断确认与逐条修改 | ✅ 完成，真实模型验证 |
| V2.2 从人格到研究 | Money Paths（规则排序 + LLM 解释 + 护栏）；首页 Welcome 重构；完成页与确认流程；InvestLens 简明模式入口 | ✅ 完成，真实模型验证 |
| V2.3 组合探索 | Portfolio Explorer：真实数据回测、情景模拟、资金模拟、简明 / 专业切换、测试、文档 | ✅ 完成，真实数据验证 |

## 2. 用户流程（实际可运行）

```
/  Welcome ──开始了解我──▶ /genesis 深度访谈 ──生成──▶ /identity 投资人格 ──确认──▶ /paths 财富路径 ──▶ /explore 组合探索
 │                                                        ▲                                   │
 └──直接体验演示（虚构用户 A / B）─────────────────────────┘                                   └──▶ /research/510300.SH?mode=simple InvestLens
```

截图：`docs/screenshots/{home,genesis,identity-A,paths-A,paths-B,explore,research-simple}-{1440,768,390}.png`（演示数据 + Mock LLM），以及真实模型 + 真实数据的 `docs/screenshots/v2-live-{interview,identity,paths,explore}.png`。

## 3. 架构

```
app/
  page.tsx                 Welcome（新）
  genesis/ identity/ paths/ explore/   V2 主流程页面（新，JourneyShell）
  (workspace)/research/    InvestLens（新增简明 / 专业模式）
  api/v2/interview         访谈一轮：理解 → 校验 → 程序选题（LLM）
  api/v2/identity          投资人格叙述（LLM，失败退回规则）
  api/v2/paths             研究路径解释（LLM，排序由规则决定）
  api/v2/portfolio         组合回测（扶摇真实日线）
lib/
  interview/catalog.ts     18 个可记录字段与取值目录（敏感字段只用区间）
  interview/questions.ts   16 个核心问题、限额、关键信息
  interview/engine.ts      访谈状态机（纯函数，客户端 / 服务端共用）
  interview/llm.ts         访谈模型调用（server-only，Zod 校验）
  identity/dimensions.ts   七维、风险三分、约束、映射回 InvestLens 画像
  identity/narrative.ts    叙述输入（不含原话）与规则兜底
  identity/synthesis.ts    人格叙述模型调用 + 护栏
  identity/demo.ts         两位虚构用户
  identity/store.tsx       客户端状态：内存默认、同意后本设备保存、一键清除
  paths/rules.ts           路径排序、状态、前提（规则）与兜底文案
  paths/synthesis.ts       路径解释模型调用 + 护栏
  portfolio/universe.ts    5 只 ETF 与三个研究组合
  portfolio/backtest.ts    共同交易日回测、指标、区间收益、情景（纯函数）
  portfolio/service.ts     取数与基准对齐（server-only）
  v2/text-guard.ts         合规 + 数字核验 + 证券代码过滤
  v2/schemas.ts            V2 请求体校验
  server/rate-limit.ts     新增 V2 限流（访谈 / 生成 / 每日 / 全站预算）
```

### 复用与新建

| 复用（未改动或小改） | 新建 |
|---|---|
| LLM Provider（流式、超时、取消、JSON 修复、用量） | 访谈状态机、题库、字段目录 |
| 合规过滤器（含拒绝语境识别） | 七维人格、风险三分、约束 |
| 限流框架、请求体限制、日志脱敏 | V2 三类 LLM 任务与提示词 |
| 扶摇数据层与 Cloudflare 中转（新增 `getDailyCloses`） | 研究路径规则 |
| InvestLens 工作台、研究 Agent、证据、A/B 对比 | 组合回测、情景、资金模拟 |
| UI 组件库、设计 Token、隐私模型 | Welcome / Genesis / Identity / Paths / Explorer 页面、JourneyShell、简明模式 |
| 原画像（8 字段）→ 由 V2 画像映射，InvestLens 个性化无需修改 | — |

## 4. 数据契约（`types/identity.ts`）

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `Fact` | key、value（目录编码或原话摘录）、label、source（stated / selected / edited）、quote、turnId、lockedByUser | 用户陈述、点选或修改的信息；stated 必须附本轮原话 |
| `Inference` | key（字段或倾向）、value、basis、confidence（low / medium）、status（pending / confirmed / rejected） | 模型推断，确认前不当作事实 |
| `InterviewState` | turns、current、facts、inferences、skipped、contradictions、followUpsUsed、status、llmFailures | 客户端保存，服务端不存储 |
| `AskedQuestion` | id（q01–q16 / fu-1–4）、kind、text、targets、reason、helper、sensitive | 题面可由模型自然改写，含义与目标字段不变 |
| `IdentityProfile` | facts、inferences、skipped、contradictions、kind、confirmed | 确认后才进入研究 |
| `Dimension` / `RiskTriad` / `Constraint` | 七维摘要与证据；能力 / 意愿 / 要求；硬 / 软 / 信息不足 | 规则计算 |
| `IdentityNarrative` | understanding、topQuestions、tendencies、uncertainties、source、notes | LLM 或规则 |
| `MoneyPath` / `PathsResult` | status、gate、why、helps、risks、costs、changes、explore；orderReason | 排序与前提来自规则 |
| `BacktestResult` | start、end、days、weights、rebalance、nav、metrics、periods、droppedDays | 真实日线计算 |

## 5. Galaxy 品牌资源

| 资源 | 来源 | 位置 |
|---|---|---|
| 正式标志（方框 · 圆 · 十字 · 十条丝线） | Galaxy 线上官网 `/assets/brand/mark-white.svg`（只读获取，原样矢量） | `public/brand/galaxy-mark.svg`；`components/brand/Logo.tsx` 内联同一路径 |
| 网站图标 | 官网 `/assets/official/favicon.svg` | `app/icon.svg` |
| 应用图标 | 官网 `/assets/brand/app-icon-180.png` | `app/apple-icon.png` |
| 线丝环形主视觉 | 本机 Galaxy 官网 V1 `assets/filament-torus.webp`（V1 已复制） | `public/brand/filament-torus.webp` |
| 色彩与字标排版 | 官网 `official.css`：`#050505` / `#f2f1ed` / 品牌红 `#b4141e` / 象牙 `#efeee9` / 墨色 `#171816`；GALAXY 粗体 0.23em 字距 + 等宽小字标签 | `app/globals.css`、`lib/design-tokens/tokens.ts` |

没有修改 Galaxy 官网或 Arena 的任何文件、部署或 DNS。原来临时使用的圆形几何符号已替换为正式标志。

## 6. 隐私与合规（实现位置）

- 访谈与画像默认只在页面内存（`IdentityProvider`）；同意后才写入 `localStorage`（`galaxy.identity.v2`）；画像与隐私页一键清除 V2 与原有画像。
- 访谈每轮只发送当前问答与结构化已知信息；人格与路径只发送字段取值与规则结论，不发送原话（单元测试验证）。
- 服务端日志只记录事件类型与计数，不含回答内容。
- 研究路径与组合页明确为研究与情景比较；所有模型文本经合规、数字核验与证券代码过滤。

## 7. 可预览版本

- Vercel Preview（分支 `feature/galaxy-money-v2`）：`<Vercel Preview（受登录保护）>`（受 Vercel 登录保护，团队成员登录后可访问）。
- Preview 环境变量：在原有基础上为 Preview 环境单独添加了 `FUYAO_BASE_URL`（中转地址，非密钥）；生产环境未改动。
- 正式域名 `invest.humanslonglive.com` 仍运行生产版本（`prod-2026-10-23`），**未经批准不合并 main、不覆盖生产**。

## 8. 剩余问题清单

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 1 | ~~模型生成的「矛盾」描述偶尔转述不准确~~ | — | ✅ 已修复：转述中的数字必须与原话 / 已知信息一致 |
| 2 | 绝对金额与可承受损失百分比之间的换算依赖模型理解 | 可能偏差，用户可修改 | 访谈中先确认投资金额，再用程序换算 |
| 3 | ~~访谈刷新即丢失~~ | — | ✅ 已修复：用户主动开启的本设备临时保存（默认关闭，24 小时删除） |
| 3a | 生产版本（V1）在交易时段内把盘中价标为「收盘」 | 仅文字标签 | V2 已修复；合并后生效 |
| 4 | 限流计数仍为单实例内存 | 多实例下较弱 | 接入 Upstash Redis（代码已支持） |
| 5 | 没有真实用户研究 | 「被理解」的感受未经验证 | 招募不同处境的用户做对照访谈 |
| 6 | 组合只有 5 只 ETF、不含费率与跟踪误差 | 研究范围有限 | 接入更多资产与费率数据后扩展 |
| 7 | Preview 受保护，公网自动化验收未在 V2 上执行 | — | 批准合并后在正式域名运行 `verify:public` 与 `v2-journey` |
