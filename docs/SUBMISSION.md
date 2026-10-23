# 同花顺「AI Native 投资产品创新」笔试 · 提交说明

## 作品简介

**Galaxy Money —— 先理解你，再理解市场。**

Galaxy Money 是一个以人为中心的 AI 财富研究伙伴。它不从「买什么」开始，而是先用一次真实的 AI 深度访谈理解你：人生阶段、近期必须用的钱、应急储备、目标、对亏损的真实感受。然后它把这些整理成可回溯、可修改的投资人格，再用同花顺扶摇的真实金融数据，帮你看懂不同选择的风险与代价。决定始终由你做出。

- **Genesis 深度访谈**：真实大模型理解自然语言回答，程序负责约束：最多 20 题、4 个追问；原话必须能在回答中找到；转述的数字必须与原话一致；用户修改过的信息不会被模型覆盖。
- **Investor Identity 投资人格**：七个维度。区分客观承受能力、主观风险意愿与目标对风险的要求，并标出硬约束和信息不足之处。
- **Money Paths 财富研究路径**：排序与前提由规则决定，模型只负责解释；先处理近期资金与应急储备，再讨论增长。
- **Portfolio Explorer 组合探索**：基于扶摇前复权日线的真实回测，含共同交易日、月度再平衡、最大回撤、年度表现与用户自定义情景；数据不足时拒绝计算。
- **InvestLens 研究工作台**：真实行情、证据与合规护栏、AI 研究 Agent；有简明 / 专业两种模式。

技术栈：Next.js 15、React 19、TypeScript，部署在 Vercel。金融数据经 Cloudflare Worker 中转访问同花顺扶摇，模型为 DeepSeek，所有金融 API 只在服务端调用。

## 链接

| 材料 | 链接 |
|---|---|
| 正式网站（未登录即可使用） | https://invest.humanslonglive.com |
| 公开源代码 | https://github.com/Polestar1811/GALAXY-MONEY-SUBMISSION |
| README | https://github.com/Polestar1811/GALAXY-MONEY-SUBMISSION#readme |
| AI 使用与验证记录 | https://github.com/Polestar1811/GALAXY-MONEY-SUBMISSION/blob/main/docs/AI_USAGE_LOG.md |
| 测试说明（V2） | https://github.com/Polestar1811/GALAXY-MONEY-SUBMISSION/blob/main/docs/GALAXY_MONEY_V2_TEST_REPORT.md |
| 产品需求 / 交付报告 | [GALAXY_MONEY_V2_PRD.md](GALAXY_MONEY_V2_PRD.md) · [GALAXY_MONEY_V2_REPORT.md](GALAXY_MONEY_V2_REPORT.md) |

快速体验：
- 首页 → 「开始了解我」：进行真实 AI 访谈。
- 虚构用户：https://invest.humanslonglive.com/identity?demo=A 、 https://invest.humanslonglive.com/paths?demo=B
- 组合探索：https://invest.humanslonglive.com/explore
- InvestLens：https://invest.humanslonglive.com/research/510300.SH?mode=simple

## 测试结果（V2 正式版本）

| 类型 | 结果 | 说明 |
|---|---|---|
| 单元测试 | **181 / 181** | 纯逻辑与 Mock：访谈状态机、原话与数字核验、投资人格、路径规则、回测、扶摇解析、限流等 |
| 端到端测试 | **53 / 53** | 演示数据 + Mock 模型：完整流程、跳过 / 返回 / 修改、临时保存、隐私、三种宽度 |
| 真实模型 + 真实数据 | 通过 | 真实 DeepSeek + 扶摇：两位虚构用户各完成 16–19 题访谈，人格 → 路径 → 组合回测（`verify:v2`），以及真实浏览器完整链路。回测由独立算法复核：8 种配置最大差异 1.3×10⁻¹⁵ |
| 正式站公网验收 | 通过 | 2026-10-23 发布后，在 https://invest.humanslonglive.com 逐项验证 Genesis（真实模型）、投资人格、财富路径、组合探索（真实回测）、InvestLens（真实行情），无运行错误。交易时段内剔除当天未完成日 K 线：同一提交已在 Preview 盘中（13:50–13:53）实测；正式站在收盘后上线，当日 K 线按规则计入 |

Mock 结果从不计入真实验证。真实接口的原始记录含扶摇行情数据，再分发权限未确认，因此没有放入公开仓库，结论已写入测试报告。

## 演示视频（可选）

[docs/demo/investlens-demo.webm](demo/investlens-demo.webm)：65 秒录屏，内容为**早期版本 InvestLens V1 的演示**（不含 V2 的 Genesis 深度访谈、投资人格、财富路径与组合探索）。录屏脚本见 [DEMO.md](DEMO.md)。V2 请直接在正式网站体验。
