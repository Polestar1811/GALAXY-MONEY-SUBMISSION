# InvestLens by Galaxy — 上线与公网验收清单

> 状态（2026-10-23）：**已上线** https://invest.humanslonglive.com ，公网验收全部通过。本文记录发布前检查、上线过程中发现并修复的问题、最终配置与验收结果。

## 0. 交付总览

| 项 | 结果 |
|---|---|
| 正式域名 | https://invest.humanslonglive.com （HTTPS，Let's Encrypt 证书，TLS 1.3；HTTP 308 跳转 HTTPS） |
| Vercel 项目 | 独立项目 `galaxy-money`（团队 galaxy，Hobby）；生产地址 https://galaxy-money.vercel.app ；函数区域 `sin1` |
| GitHub 仓库 | https://github.com/Polestar1811/GALAXY-MONEY-SUBMISSION （公开源码快照：单次提交的全新历史；开发仓库保持私有） |
| 扶摇中转 | Cloudflare Worker `investlens-fuyao-relay`（只用 workers.dev，代码见 `relay/fuyao-worker/`） |
| DNS | 只在 Cloudflare 新增 1 条记录：`invest` CNAME → `e5f57a8c46a7f042.vercel-dns-017.com`（仅 DNS，不代理） |
| 既有服务 | 根域名、`www`、`arena`、5 条 MX、Nameserver 均未改动；Galaxy 官网与 Arena 验收时均返回 200 |
| 演示录屏 | `docs/demo/investlens-demo.webm`（第三迭代录制，见 docs/DEMO.md） |

## 1. 发布前检查

### 1.1 仓库与推送内容

| 检查项 | 结果 |
|---|---|
| 全部 Git 历史中的密钥 | 按 `.env.local` 中的实际值（扶摇 Key、LLM Key、中转 Secret）与密钥特征串扫描，均未命中 |
| `.env.local` / `.vercel/` / `.wrangler/` / 构建产物 / 测试产物 | 均被 `.gitignore` 忽略，未被跟踪 |
| 本机绝对路径 | 已移除第三迭代报告中的一处本机路径；扫描无命中 |
| 提交作者 | 仓库内 `user.email` 设为 GitHub 账号 `Polestar1811` 的 noreply 地址（Vercel Hobby 要求提交邮箱与 GitHub 账号匹配，否则阻止部署）；全局 git 配置未改动 |
| 画像数据 | 只有两套标注「虚构」的演示画像；服务端不存储画像 |

### 1.2 Galaxy 品牌资产

只复制了 `galaxy-symbol.svg` 与 `filament-torus.webp` 两个文件，SHA-256 与 Galaxy 官网 V1 源文件一致，源目录未被修改，项目中没有本机路径引用。

### 1.3 第三方数据

扶摇文档未发现授权、转载或展示限制条款，也未提及 IP 白名单；本项目只调用 5 个基金只读接口。经 Cloudflare 中转只是服务器到服务器的传输路径：调用方、Key、展示方式与数据去向均不变。仓库保持 Private；是否公开数据截图与录屏，以同花顺对笔试的使用范围说明为准。

## 2. 生产配置

### 2.1 Vercel 环境变量（galaxy-money · Production）

| 变量 | 类型 | 值 / 说明 |
|---|---|---|
| `MARKET_DATA_PROVIDER` | 配置 | `fuyao`（缺少 Key 时显式报错，不回退演示数据） |
| `FUYAO_API_KEY` | Sensitive | 由用户本人填写 |
| `FUYAO_BASE_URL` | 配置 | `https://<your-worker>.workers.dev`（经中转访问扶摇） |
| `FUYAO_RELAY_SECRET` | Sensitive | Vercel → Worker 内部认证 Secret，由用户本人填写（与 Worker 的 `RELAY_SECRET` 相同）；只在指向中转时发送，不会发给扶摇 |
| `LLM_API_KEY` | Sensitive | 由用户本人填写 |
| `LLM_BASE_URL` | 配置 | `https://api.deepseek.com` |
| `LLM_MODEL` | 配置 | `deepseek-flash` |
| `LLM_EXTRA_BODY` | 配置 | `{"thinking":{"type":"disabled"}}` |
| `LLM_MAX_TOKENS` | 配置 | `8000`（代码硬上限 8000） |
| `LLM_TIMEOUT_MS` | 配置 | `120000`（代码硬上限 120000） |

可选、未设置：`KV_REST_API_URL` / `KV_REST_API_TOKEN`（或 `UPSTASH_REDIS_REST_*`）。设置后限流计数在多实例间共享；当前为单实例内存计数（`/api/status` 显示 `rateLimit: "instance"`）。

### 2.2 Cloudflare Worker `investlens-fuyao-relay`

| 约束 | 实现 |
|---|---|
| 地址 | 只用 workers.dev（`workers_dev = true`，未绑定任何路由或自定义域名，`preview_urls = false`） |
| 内部认证 | 请求头 `X-Relay-Secret` 与 Worker Secret `RELAY_SECRET` 等长比较；不匹配一律 403；Worker 未设置 Secret（或少于 32 位）时拒绝所有请求 |
| 白名单 | 只允许 GET，且路径必须是 5 个扶摇只读接口之一（快照、日线、基金资料、业绩指标、资讯）；其余 403 / 405；转发目标固定为 `https://fuyao.aicubes.cn` |
| Key 处理 | 扶摇 Key 只由 Vercel 服务端放在请求头中传入；Worker 不保存、不改写、不写入 URL；不转发内部 Secret、Cookie 等其它请求头 |
| 日志 | `observability.enabled = false`，代码中无日志输出 |
| 部署权限 | wrangler OAuth 只授予 `account:read`、`user:read`、`workers_scripts:write`（未授予 zone、路由、DNS、证书等权限）。账户此前没有 workers.dev 子域，部署时自动注册了 workers.dev 子域 |

## 3. 上线过程中发现并修复的问题

| # | 问题 | 发现方式 | 处理 |
|---|---|---|---|
| 1 | 合规过滤误删正常的拒绝说明（含「目标价」等词即整句删除） | 公网验收试运行 | 区分拒绝语境与违规表述；「目标价」须给出具体数值或赋值才算违规；回归测试覆盖拒绝、事实与伪装违规三类 |
| 2 | 公网缺少成本与滥用保护 | 上线要求 | 服务端限流、并发控制、每日 AI 预算、请求体上限、单次调用预算硬上限；超限返回 429 + `Retry-After`，界面显示明确提示 |
| 3 | Vercel 阻止自动部署 | 部署日志 | 提交邮箱与 GitHub 账号不匹配；改用仓库级 noreply 邮箱 |
| 4 | Vercel 香港区域（hkg1）完全无法连接扶摇 | 临时诊断：TCP 0/32、HTTPS 0/4 | 函数区域改为 `sin1` |
| 5 | A/B 指纹相同却显示「不一致」 | 公网 UI 验收 | 多实例在不同时刻获取同一收盘快照，获取时刻写进了事实标签；收盘后事实标签不再包含获取时刻（页面顶部仍显示） |
| 6 | `sin1` 下扶摇连通性取决于实例出口 IP，时通时断 | 公网验收与多次采样（同一部署从 6/6 到 0/6） | 经 Cloudflare Worker 中转（下节数据）；直连路径保留为默认值，可随时回退 |

## 4. 中转与直连对比（Vercel 预览部署，`sin1`，同一实例内）

三轮测量（2026-10-23 02:3x–02:48 北京时间），每轮直连与中转各请求快照和日线：

| 路径 | 行情快照 | 历史 K 线 | 耗时（成功请求） |
|---|---|---|---|
| Vercel 直连扶摇 | **0 / 28** | **0 / 28** | 全部 `UND_ERR_CONNECT_TIMEOUT` |
| 经 Cloudflare Worker（SIN 节点） | **28 / 28** | **28 / 28** | 快照 p50 105–126 ms，最大 740 ms；日线 p50 124–175 ms，最大 344 ms |

返回数据每次一致：最新价 4.107、涨跌幅 −1.86%、728 根日线、最新收盘 4.107。安全检查 9 / 9 返回 403（无 Secret、错误 Secret、非白名单路径）。

## 5. 公网验收结果（正式域名，经中转）

命令：`npm run verify:public`，`PLAYWRIGHT_BASE_URL=https://invest.humanslonglive.com`。记录：`docs/live-verification/public-acceptance-2026-10-22.json`、`ui-live-2026-10-22.json`（记录时间为 UTC 2026-10-22 18:51，即北京时间 10-23 02:51）。

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 首页正常加载 | ✅ 三种宽度截图 `docs/screenshots/public-home-*.png` |
| 2 | Genesis 画像流程 | ✅ 页面可用；完整建档流程由 E2E 覆盖（40 / 40） |
| 3 | Dashboard 与 Research 工作台 | ✅ |
| 4 | 扶摇真实行情 | ✅ `dataMode = fuyao`；工具结果「扶摇 · 750 个交易日」「最新价 4.107 · 最新交易日 2026-10-22 收盘」「17 项事实」 |
| 5 | DeepSeek 真实研究 | ✅ 真实 UI 研究 11.2 秒完成；API 连续研究 A / B / 追问 / 取消后再研究均 `complete`（7.1–8.6 秒） |
| 6 | 证据与数值可追溯 | ✅ 无效证据 0、未核验数值 0、合规删除 0 |
| 7 | A/B 使用同一份事实快照 | ✅ 同一快照（`pinned`），指纹 `762DECFF` 一致 |
| 8 | 拒绝违规请求时保留正确解释 | ✅ 越界问题回答为 `complete`，合规删除 0，拒绝说明完整保留 |
| 9 | 匿名用户限流 | ✅ 第 6 个请求返回 429（`Retry-After` 437 秒），界面显示「已达到使用限制」 |
| 10 | 移动端适配 | ✅ 390 / 768 / 1440 横向溢出均为 0 px |
| 11 | 不泄露密钥 | ✅ 扫描 131 个页面、脚本与请求响应，按 3 个实际值（扶摇 Key、DeepSeek Key、中转 Secret）精确比对及密钥特征匹配，0 处泄露；`/.env` 等敏感路径均 404；错误响应无堆栈 |
| 12 | Galaxy 官网与 Arena | ✅ `humanslonglive.com`、`www`、`arena` 均返回 200 |

补充稳定性采样（验收后，正式域名，经中转）：连续 8 次真实 AI 研究（间隔 15 秒）**8 / 8 完成**，每次 6.4–7.6 秒，4 个数据工具全部成功。切换中转前，同一域名曾出现行情接口 0 / 6、研究 6 / 6 与 0 / 6 交替的情况。

说明：事实指纹从此前的 `8386E6B5` 变为 `762DECFF`，原因是扶摇更新了基金规模（1,264.0 → 1,345 亿元），属于上游数据变化；A / B 之间仍完全一致。

## 6. 已知限制与后续建议

- **中转依赖**：扶摇对部分云出口 IP 不可达，生产依赖 Cloudflare Worker。若 Worker 不可用，研究会如实报错，不会生成替代结论。回退方法：删除 Vercel 的 `FUYAO_BASE_URL` 并重新部署（恢复直连）。
- **限流计数为单实例内存**：建议在 Vercel Storage 中添加 Upstash Redis，使限流与每日预算在多实例间共享（代码已支持，无需修改）。
- **workers.dev 在中国大陆网络通常无法直接访问**：不影响线上服务（只由 Vercel 新加坡调用），但本机无法直接测试中转。
- **密钥轮换**：扶摇与 DeepSeek Key 曾在对话中以明文出现，建议尽快轮换，并在 Vercel 中更新后重新部署。
