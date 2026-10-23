# Galaxy Money — 先理解你，再理解市场

> 同花顺「AI Native 投资产品创新」笔试作品。Galaxy Money 是 Galaxy 旗下以人为中心的 AI 财富研究伙伴：先通过对话理解你的人生、财务约束与目标，再用真实金融数据帮你看懂不同选择的风险与代价 —— 决定始终由你做出。InvestLens 是其中的专业研究工作台。
>
> **AI can do the work. Only you can live the life.**

## 提交材料（正式上线版本：Galaxy Money V2）

| 交付物 | 位置 |
|---|---|
| 公网产品（未登录即可使用） | **https://invest.humanslonglive.com** |
| 公开源代码 | https://github.com/Polestar1811/GALAXY-MONEY-SUBMISSION |
| 提交说明（链接汇总与作品简介） | [docs/SUBMISSION.md](docs/SUBMISSION.md) |
| AI 使用与验证记录 | [docs/AI_USAGE_LOG.md](docs/AI_USAGE_LOG.md) |
| 测试报告（V2：Unit 181/181 · E2E 53/53 · 真实模型与数据验证） | [docs/GALAXY_MONEY_V2_TEST_REPORT.md](docs/GALAXY_MONEY_V2_TEST_REPORT.md) |
| 产品需求 · 交付报告 | [docs/GALAXY_MONEY_V2_PRD.md](docs/GALAXY_MONEY_V2_PRD.md) · [docs/GALAXY_MONEY_V2_REPORT.md](docs/GALAXY_MONEY_V2_REPORT.md) |
| 早期版本（InvestLens V1）资料 | [迭代一](docs/ITERATION_1_REPORT.md) · [迭代二](docs/ITERATION_2_REPORT.md) · [迭代三](docs/ITERATION_3_REPORT.md) · [V1 测试报告](docs/TEST_REPORT.md) · [产品价值验证](docs/PRODUCT_VALIDATION.md) · [演示脚本](docs/DEMO.md) |
| 上线、Bug 修复记录与公网验收 | [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) |

V2 流程：Welcome `/` → Genesis 深度访谈 `/genesis` → 投资人格 `/identity` → 财富研究路径 `/paths` → 组合探索 `/explore` → InvestLens `/research/510300.SH`（简明 / 专业模式）。无需填写即可体验两位虚构用户：`/identity?demo=A`、`/paths?demo=B`。

V2 验证命令（需要真实凭证）：

```bash
npm run verify:v2
```

---

## 1. 目标用户与真实场景

**目标用户**：有明确财富目标、具备一定理财经验，但缺少专业投研能力与时间的个人 A 股 / ETF 投资者。

**真实场景**：两位用户都在问「沪深300 ETF 现在有哪些值得关注的风险？」

- 用户 A 一年内要付首付，没有独立应急储备，能承受的亏损只有 5–10%。
- 用户 B 为十年后的养老做储备，应急资金独立，能承受 20–35% 的波动。

对 A 而言，最关键的问题是「如果用钱时恰好在回撤中，我会被迫低位卖出多少」；对 B 而言，更重要的是估值区间、长期持有成本和能否坚持计划。**市场事实对两人完全相同，需要先研究的东西却完全不同。**

## 2. 为什么需要 AI，为什么规则或搜索不够

- **普通搜索 / 行情软件**给所有人同一页数据，不知道你的约束，也不会告诉你先看什么。
- **纯规则系统**可以排序，但不能理解自然语言问题（「我明年要用钱，这只 ETF 适合研究吗？」），也无法把几十个指标组织成一段有依据的解释。
- **普通 AI 助手**能写流畅的回答，但不知道你的约束、会编造数字、可能给出买卖建议，也说不清依据在哪里。

InvestLens 的做法：**规则引擎决定什么与你有关，真实数据决定事实是什么，大模型只负责基于证据的解释**，并在输出前做证据、数值与合规校验。

## 3. 三个阶段

| 阶段 | 做什么 | 用户能看到 / 控制什么 |
|---|---|---|
| **A. Understand You** — Genesis | 8 个可跳过的问题：目标、期限、经验、主观风险偏好、客观损失承受能力、近期资金需要、应急储备、收入稳定性（可选） | 实时画像预览；区分「愿意承受」与「能够承受」；最后确认才生效；默认不保存 |
| **B. Understand the Market** — 研究 Agent | 调用同花顺扶摇真实行情、前复权日线、基金资料、估值分位、资讯；计算回撤与波动 | 每一步工具调用的真实状态与耗时；每个事实的来源、时点、单位与口径 |
| **C. Research for You** — 个性化 | 同一份事实快照，按画像规则排列研究重点与个人相关度，由大模型基于证据解释 | 「为什么与你有关」及触发它的画像字段；发送给模型的画像字段；A/B 对比且事实指纹一致 |

## 4. 个性化逻辑（Genesis → 规则 → 解释）

1. `deriveSignals(profile)` 把用户回答推导为研究视角（期限、流动性压力、客观承受能力、主观偏好、经验、解释深度）。跳过的字段保持未知，不做推断；推断在 UI 中标注为「推断」。
2. `lib/personalization/rules.ts` 中 8 条可解释规则按标签加权，决定研究模块顺序、风险的**个人相关度**和解释口径。
3. 风险的**客观严重程度**只由市场事实决定（例如最大回撤幅度），对所有画像相同；模型不能修改。
4. 大模型只拿到研究所需的 7 个画像字段（收入稳定性不发送），按规则给定的顺序解释，并引用证据编号。

## 5. Agent 的职责与工具调用

受控的固定流程（`lib/agent/research-agent.ts`），不是开放式多智能体：

```
Understand + Plan（LLM，2–4 步计划，白名单工具）  ‖  Retrieve（并行调用金融工具）
  → Verify（关键事实是否存在、未知 / 过期字段）
  → Personalize（确定性规则引擎）
  → Respond（LLM，结构化 JSON + Zod 校验）
  → 护栏：证据 ID 校验、数值核验、合规过滤、风险完整性
```

- 白名单只读工具：`market_snapshot`、`price_history`、`fund_profile_valuation`、`fund_news`；无任何交易能力。
- 每次研究最多 4 次模型调用（规划与回答各最多 1 次修复）；数据工具每类最多 1 次；超时、取消（服务端同步中止）、失败降级都有显式处理，失败时不输出任何替代结论。
- 规划与数据获取并行；模型使用流式响应，界面显示真实进度（已接收字符数，不展示推理内容）。
- 资讯属于不可信外部输入，放在独立数据块中；其中的指令被忽略，即使模型复述也会被合规过滤删除。

## 6. 数据来源与证据核验

| 数据 | 来源 | 处理 |
|---|---|---|
| 最新价、涨跌幅 | 扶摇 `GET /api/fund/market/snapshot` | 接口时间戳为响应时间（实测），行情所属交易日由日线确定 |
| 前复权日线 | 扶摇 `GET /api/fund/market/historical` | 计算 1 年收益、1 年 / 20 日波动、1 年 / 3 年最大回撤、20 日均成交额 |
| 基金规模 | 扶摇 `GET /api/fund/profile/detail` | 文档未标注单位，按元换算并注明 |
| 跟踪指数 PE-TTM 五年分位 | 扶摇 `GET /api/fund/performance/indicators-historical` | 描述**跟踪指数**而非 ETF 本身 |
| 资讯 | 扶摇 `GET /api/fund/news/article-list` | 不可信外部输入，只作线索 |
| PE 原值、股息率、费率、跟踪误差、行业权重、折溢价 | 未接入 | 显示「未知」，绝不补 0 |

证据核验：结论引用的 Evidence ID 必须存在，否则剔除并把事实降级为「未验证」；结论中的数字必须能在事实层找到；买卖指令、收益承诺、概率预测、目标价被删除；客观严重程度较高的风险若被模型遗漏，按规则补回。真实数据下的关键数值已用独立脚本从原始响应复算一致（见第二迭代报告）。

## 7. 隐私与合规边界

- 画像默认只在页面内存中；只有用户明确选择「仅保存在此设备」才写入 localStorage，可一键清除；服务端不存储画像。
- 不询问具体收入、资产或持仓；不推断政治、健康等敏感属性；虚构画像明确标注。
- 不提供买卖建议、目标价、收益承诺或自动交易；不以提高交易频率为产品目标。
- 密钥只在服务端读取（`.env.local` / 部署平台环境变量），不进入浏览器、日志或仓库；有自动化测试检查。

## 8. 已完成与未完成

已完成并测试：五个页面（首页、Genesis、Dashboard、研究工作台、画像与隐私）、扶摇真实数据、真实 LLM 研究 Agent、证据与合规护栏、A/B 同事实对比、性能优化（并行、流式进度、模型基准）、Galaxy 品牌整合。

已上线：https://invest.humanslonglive.com （真实扶摇数据经 Cloudflare 中转、真实 DeepSeek 研究、公网限流与成本保护）。

未完成 / 限制：见 [docs/ITERATION_3_REPORT.md](docs/ITERATION_3_REPORT.md)「尚未完成」与「风险」，以及 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)「已知限制」。主要包括：iFinD MCP 未接入；费率、跟踪误差等字段未接入；没有真实用户研究；生产环境依赖扶摇中转；限流计数尚未接入共享存储。

## 9. 启动、测试与部署

需要 Node.js ≥ 20（开发使用 24.22.1 LTS）。

```bash
npm install
```

```bash
npm run dev
```

不配置任何密钥也能运行（合成演示数据，全站标注；AI 研究显示「未配置」，不会生成假结论）。接入真实数据与模型：复制 `.env.example` 为 `.env.local` 并填写：

| 变量 | 说明 |
|---|---|
| `FUYAO_API_KEY` | 同花顺扶摇 API Key |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 任一 OpenAI 兼容服务（不在代码中硬编码） |
| `LLM_EXTRA_BODY` | 可选，合并进请求体的服务商参数（JSON）。实测推荐：`deepseek-flash` + `{"thinking":{"type":"disabled"}}`，单次研究约 7 秒（见第三迭代报告的基准） |
| `LLM_MAX_TOKENS` / `LLM_TIMEOUT_MS` | 推理模型建议 `8000` / `120000`（代码硬上限，环境变量不能突破） |
| `FUYAO_BASE_URL` / `FUYAO_RELAY_SECRET` | 可选：经 Cloudflare Worker 中转访问扶摇（见下文「部署」）；内部 Secret 只发给中转，不会发给扶摇 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 可选：Upstash Redis，使公网限流与每日 AI 预算在多实例间共享；未配置时为单实例内存计数 |

测试：

```bash
npm run test
```

```bash
npm run build
```

```bash
npm run test:e2e
```

真实环境验证（需要凭证；Mock 不参与）：

```bash
npm run verify:live
```

```bash
npm run verify:live-ui
```

```bash
npm run bench:models
```

```bash
npm run validate:product
```

部署（Vercel，与 Next.js App Router 原生兼容）：

1. 将仓库导入 Vercel（Framework: Next.js，默认构建命令），新建独立项目；`vercel.json` 把函数区域设为 `sin1`（实测香港 `hkg1` 无法连接扶摇）。提交邮箱需与 GitHub 账号匹配，否则 Hobby 会阻止自动部署。
2. 在 Project Settings → Environment Variables 中配置变量（仅服务端，不加 `NEXT_PUBLIC_` 前缀），生产配置见 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) 第 2 节。**正式发布前请使用轮换后的新密钥。**
3. 扶摇中转（实测部分云出口 IP 无法与扶摇建立连接）：在 `relay/fuyao-worker` 目录运行 `npx wrangler deploy`，在 Cloudflare 控制台为 Worker 添加 Secret `RELAY_SECRET`，再在 Vercel 设置 `FUYAO_BASE_URL=https://<worker>.workers.dev` 与相同值的 `FUYAO_RELAY_SECRET`。Worker 只接受带内部 Secret 的、白名单内的扶摇 GET 请求。
4. AI 研究接口 `app/api/agent/route.ts` 设置 `maxDuration = 300`（Vercel Fluid compute 下 Hobby 上限 300 秒）；研究以 NDJSON 流式返回进度，兼作长连接心跳。
5. 自定义域名：在 Vercel 项目 Domains 中添加域名，按其给出的 CNAME 在 DNS 服务商新增记录（Cloudflare 上设为「仅 DNS」）。
6. 部署后设置 `PLAYWRIGHT_BASE_URL=<公网地址>`，运行 `npm run verify:public`：真实 UI 研究流程，以及暴露面、真实 / 演示区分、连续使用、异常处理、三种宽度视觉、既有站点与限流检查。

## 10. 技术栈

Next.js 15（App Router）· React 19 · TypeScript strict · Tailwind CSS 4（Galaxy 设计 Token）· Radix 原语 · Recharts · Motion · Zod · Vitest · Playwright。

```
app/                    页面与 API（/api/market/*、/api/research、/api/agent、/api/status）
components/             品牌、布局、设计系统组件与各页面模块
lib/providers/          MarketDataProvider：Demo 与扶摇（fuyao/client.ts 解析 ApiResponse 信封）
lib/llm/                OpenAI 兼容 LLM Provider（流式、用量、扩展参数）
lib/agent/              研究 Agent、提示词、输出 schema、护栏、事实快照
lib/personalization/    画像信号、规则、排序、事实指纹
lib/server/             日志脱敏、公网限流 / 并发 / 每日预算
relay/fuyao-worker/     Cloudflare Worker：扶摇中转（内部认证 + 接口白名单）
tests/unit · e2e · live · live-ui
```
