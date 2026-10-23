import type { MarketFact } from "@/types/market";
import type { BriefItem, Inference, OpenQuestion, ResearchModule, RiskItem } from "@/types/research";

/**
 * 研究方向模板。文本中的 {f-xxx} 占位符从事实层取值、{label:f-xxx} 取事实名称、{p:field} 取画像回答。
 * 第二迭代起模板同时用于合成演示数据与扶摇真实数据，因此文本不得包含任何只对某一数据源成立的数值或结论；
 * 数据来源与状态由事实层的状态标签表达。叙述性的研究解读由 LLM 基于证据生成。
 */

export type LensKey = "liquidity" | "short" | "lowCapacity" | "gap" | "long" | "novice" | "advanced" | "default";

type WithLens<T> = T & { lensNotes: Partial<Record<LensKey, string>> & { default: string } };

export const MODULES: WithLens<ResearchModule>[] = [
  {
    id: "m-drawdown",
    kicker: "回撤 × 用钱时点",
    title: "如果用钱时恰好遇到回撤",
    summary: "近 1 年最大回撤 {f-mdd-1y}，近 3 年最大回撤 {f-mdd-3y}。回撤可能修复，但被迫在低点卖出的损失不会。",
    bullets: [
      "最大回撤衡量从高点到其后低点的跌幅；修复所需时间无法预知。",
      "历史回撤不代表未来最大损失，未来可能出现更大跌幅。",
      "关键不是「会不会跌」，而是「跌的时候你是否必须卖」。",
    ],
    factIds: ["f-mdd-1y", "f-mdd-3y", "f-vol-1y"],
    evidenceIds: ["e-drawdown", "e-price-series"],
    tags: ["drawdown", "liquidity", "sequence", "capacity"],
    basePriority: 5,
    lensNotes: {
      liquidity: "你对近 12 个月资金需要的回答是「{p:liquidityNeed}」。若用钱时遇到类似 {f-mdd-1y} 的回撤，需要卖出更多份额才能拿到同样的现金 —— 这是你最需要先研究清楚的问题。",
      short: "你的投资期限较短，回撤可能还没修复就到了用钱时间。",
      lowCapacity: "你选择的可承受亏损区间为 {p:lossCapacity}，请与近 1 年最大回撤 {f-mdd-1y} 对照，判断全部资金暴露在这类波动下是否超出你的边界。",
      long: "以 10 年以上期限看，阶段性回撤更多影响持有体验而不是最终用款；重点在于回撤时不被迫卖出。",
      default: "回撤幅度要和你的用钱时间、可承受亏损放在一起看。",
    },
  },
  {
    id: "m-volatility",
    kicker: "波动区间",
    title: "持有过程会有多颠簸",
    summary: "1 年年化波动率 {f-vol-1y}，最近 20 日为 {f-vol-1m}。波动率衡量价格摆动幅度，而非方向。",
    bullets: [
      "年化波动率描述的是一年内价格围绕均值的典型摆动幅度。",
      "近期波动与 1 年均值的差异可以提示市场情绪变化，但不能预测方向。",
    ],
    factIds: ["f-vol-1y", "f-vol-1m"],
    evidenceIds: ["e-drawdown"],
    tags: ["volatility", "drawdown"],
    basePriority: 3,
    lensNotes: {
      short: "短期限下，波动直接决定你到期时可能拿回多少，而不只是「过程难受」。",
      novice: "波动率可以理解为「价格平均会偏离多远」。数值越大，账户每天的起伏越明显。",
      long: "长期持有时，波动更多考验的是纪律；它本身不是长期结果的决定因素。",
      default: "把波动率换算成你能接受的账户金额起伏，会比百分比更直观。",
    },
  },
  {
    id: "m-valuation",
    kicker: "估值位置",
    title: "当前估值处在什么区间",
    summary: "{label:f-pe-pct} {f-pe-pct}；指数 PE-TTM {f-pe}，股息率 {f-dy}。估值是长期回报的重要变量之一，但不决定短期涨跌。",
    bullets: [
      "分位数只说明「相对过去的位置」，口径和样本区间不同结论可能不同。",
      "估值数据缺失时，不能对「贵不贵」下结论。",
    ],
    factIds: ["f-pe", "f-pe-pct", "f-dy"],
    evidenceIds: ["e-valuation"],
    tags: ["valuation", "long"],
    basePriority: 4,
    lensNotes: {
      long: "对 10 年以上的养老储备，入场估值区间会影响长期回报区间，值得优先核验数据口径。",
      liquidity: "对 1 年内要用的钱，估值高低对结果的解释力很弱 —— 短期价格主要由情绪和资金决定。",
      advanced: "建议同时对比 PE 与股息率、ROE 的口径一致性，避免单一分位误导。",
      default: "估值说明「贵不贵」，但不说明「什么时候涨」。",
    },
  },
  {
    id: "m-cost",
    kicker: "持有成本",
    title: "费率和跟踪误差的长期复利",
    summary: "综合费率 {f-fee}，年化跟踪误差 {f-te}。对长期持有者来说，这是少数可以确定控制的变量。",
    bullets: [
      "费率按年计提，持有时间越长，累计影响越大。",
      "跟踪误差衡量基金是否「忠实」复制指数。",
      "场内折溢价率：{f-premium}。",
    ],
    factIds: ["f-fee", "f-te", "f-premium"],
    evidenceIds: ["e-cost", "e-liquidity"],
    tags: ["cost", "tracking", "long"],
    basePriority: 2,
    lensNotes: {
      long: "费率按年计提，持有 20 年时累计影响约为「年费率 × 20」的量级（未计复利），长期持有值得先核实真实费率。",
      short: "持有不到 1 年时，费率影响很小，可以放到研究清单的后面。",
      advanced: "可进一步比较同指数不同 ETF 的跟踪误差与流动性，而不只看费率。",
      default: "费用是确定的，收益是不确定的。",
    },
  },
  {
    id: "m-composition",
    kicker: "你买的是什么",
    title: "成分与行业集中度",
    summary: "跟踪指数：{f-index}。第一大行业权重 {f-top-sector}。买入一只 ETF 等于按权重持有一篮子股票。",
    bullets: [
      "指数的成分与权重决定了这只 ETF 的风险结构。",
      "行业权重集中意味着少数行业的表现会显著影响整体。",
    ],
    factIds: ["f-index", "f-top-sector"],
    evidenceIds: ["e-composition"],
    tags: ["composition", "concentration", "basics"],
    basePriority: 3,
    lensNotes: {
      novice: "先弄清楚「你买的是什么」：这只 ETF 不是一家公司，而是一篮子公司的组合。",
      long: "长期持有需要接受行业结构会随指数调整而变化。",
      default: "行业结构决定了它和你其他资产的相关性。",
    },
  },
  {
    id: "m-behavior",
    kicker: "持有纪律",
    title: "计划能否在下跌中坚持",
    summary: "长期结果很大程度取决于投资者在回撤中的行为，而不仅仅是产品本身。",
    bullets: [
      "提前写下「什么情况下我会停止或调整计划」，比事后判断更可靠。",
      "定期定额是一种纪律工具，不是收益保证。",
    ],
    factIds: ["f-mdd-3y"],
    evidenceIds: ["e-drawdown"],
    tags: ["behavior", "long", "capacity"],
    basePriority: 2,
    lensNotes: {
      gap: "你在「下跌 20%」情景中选择了「{p:riskWillingness}」，但客观承受能力为 {p:lossCapacity}。主观偏好高于客观能力时，最容易在压力下偏离计划。",
      long: "你的期限足够长，最大的风险可能不是市场，而是在 {f-mdd-3y} 这样的回撤中中途放弃。",
      default: "研究产品之前，先想清楚自己的计划边界。",
    },
  },
];

/**
 * 风险条目。baseSeverity 是「客观严重程度」的默认值；有可用事实时由 objectiveSeverity 依据事实计算，
 * 与画像无关（市场本身的跌幅不会因为用户更激进而改变）。个人相关度另行计算。
 */
export const RISKS: (WithLens<RiskItem> & { objective?: (f: Map<string, MarketFact>) => 1 | 2 | 3 | null })[] = [
  {
    id: "r-timing",
    title: "用钱时点与回撤重叠",
    summary: "需要现金时若处于回撤期，可能被迫低位卖出，将账面波动变成实际损失。",
    detail: "被迫卖出的锁定损失 ≈ 取款金额 × 回撤 ÷ (1 − 回撤)。可在情景模拟器中调整参数查看。",
    tags: ["liquidity", "sequence", "drawdown"],
    baseSeverity: 2,
    factIds: ["f-mdd-1y"],
    objective: (f) => bucket(Math.abs(num(f, "f-mdd-1y")), 10, 20),
    lensNotes: {
      liquidity: "这是与你最相关的风险：近 12 个月资金需要为「{p:liquidityNeed}」，独立应急储备为「{p:emergencyReserve}」。",
      long: "你有独立储备且基本不需要动用，此风险对你的影响较低。",
      default: "取决于你何时需要这笔钱。",
    },
  },
  {
    id: "r-drawdown",
    title: "阶段性深度回撤",
    summary: "近 3 年最大回撤 {f-mdd-3y}；宽基指数也会经历持续数月的下跌。",
    detail: "历史回撤不代表未来最大损失，真实市场可能出现更大跌幅。",
    tags: ["drawdown", "volatility", "capacity"],
    baseSeverity: 2,
    factIds: ["f-mdd-3y", "f-vol-1y"],
    objective: (f) => bucket(Math.abs(num(f, "f-mdd-3y")), 15, 25),
    lensNotes: {
      lowCapacity: "请将该幅度与你选择的可承受亏损区间（{p:lossCapacity}）对照，考虑暴露在其中的资金比例。",
      long: "长期视角下可承受，但需要确认回撤时不需要动用资金。",
      default: "需与自己的承受能力对照。",
    },
  },
  {
    id: "r-valuation",
    title: "估值与盈利预期变化",
    summary: "{label:f-pe-pct} {f-pe-pct}；若盈利预期下修，指数可能在估值不高时继续下跌。",
    detail: "估值分位只描述相对位置，不说明短期方向；数据缺失时不应据此判断。",
    tags: ["valuation", "long"],
    baseSeverity: 1,
    factIds: ["f-pe", "f-pe-pct"],
    objective: (f) => bucket(num(f, "f-pe-pct"), 50, 80),
    lensNotes: {
      long: "对长期储备而言，这是影响回报区间的核心变量，值得持续跟踪。",
      liquidity: "对 1 年内的资金，这一风险的影响远小于回撤时点风险。",
      default: "估值不是择时工具。",
    },
  },
  {
    id: "r-concentration",
    title: "行业集中度",
    summary: "第一大行业权重 {f-top-sector}，少数行业表现会主导指数。",
    detail: "如果你的工作或其他资产与这些行业高度相关，风险可能叠加。",
    tags: ["concentration", "composition"],
    baseSeverity: 1,
    factIds: ["f-top-sector"],
    objective: (f) => bucket(num(f, "f-top-sector"), 20, 35),
    lensNotes: {
      long: "长期持有时，可关注它与其他资产的相关性。",
      default: "需结合你的整体资产结构看。",
    },
  },
  {
    id: "r-behavior",
    title: "偏离计划的行为风险",
    summary: "在剧烈下跌中追加或止损，可能让结果显著偏离原计划。",
    detail: "主观风险偏好高于客观承受能力时，这一风险尤其突出。",
    tags: ["behavior", "capacity"],
    baseSeverity: 1,
    factIds: [],
    lensNotes: {
      gap: "你的主观偏好（「{p:riskWillingness}」）高于客观承受能力（{p:lossCapacity}），这一差距需要你自己先确认。",
      long: "长期计划中，行为纪律对结果的影响可能大于产品选择。",
      default: "提前设定计划边界。",
    },
  },
  {
    id: "r-tracking",
    title: "跟踪误差与折溢价",
    summary: "年化跟踪误差 {f-te}；场内折溢价率 {f-premium}。",
    detail: "折溢价率未知时不应假设为 0，场内交易前需查看实时数据。",
    tags: ["tracking", "cost"],
    baseSeverity: 1,
    factIds: ["f-te", "f-premium"],
    lensNotes: {
      advanced: "建议核对折溢价与盘口流动性。",
      default: "通常较小，但数据缺失时需要验证。",
    },
  },
];

function num(f: Map<string, MarketFact>, id: string): number {
  const v = f.get(id)?.value;
  return typeof v === "number" ? v : Number.NaN;
}
function bucket(v: number, mid: number, high: number): 1 | 2 | 3 | null {
  if (Number.isNaN(v)) return null;
  return v >= high ? 3 : v >= mid ? 2 : 1;
}

export const OPEN_QUESTIONS: OpenQuestion[] = [
  { id: "q-cash", question: "这笔钱中具体有多少会在 12 个月内用到？用款时间能否推迟？", why: "决定被迫卖出的金额上限。", tags: ["liquidity", "sequence"], needsPhase2: false },
  { id: "q-capacity", question: "如果账户下跌 25%（假设），你的计划会被打乱吗？", why: "验证客观承受能力与暴露比例是否匹配。", tags: ["capacity", "drawdown"], needsPhase2: false },
  { id: "q-valuation", question: "估值分位使用的是什么口径与样本区间？最新时点是何时？", why: "估值判断依赖口径、区间与时点。", tags: ["valuation", "long"], needsPhase2: true },
  { id: "q-premium", question: "场内交易时的实时折溢价率与成交深度如何？", why: "该字段未接入时不能假设为 0。", tags: ["tracking", "basics"], needsPhase2: true },
  { id: "q-plan", question: "长期计划的投入节奏和「停止条件」是什么？", why: "把纪律写在前面，减少回撤中的临时决策。", tags: ["behavior", "long"], needsPhase2: false },
  { id: "q-overlap", question: "你的其他资产或收入与指数的主要行业相关度高吗？", why: "判断集中度风险是否叠加。", tags: ["concentration", "composition"], needsPhase2: false },
];

/** 基于事实取值的确定性推断：条件不满足或依据缺失时不输出。 */
export const INFERENCE_RULES: (Inference & { when: (f: Map<string, MarketFact>) => boolean })[] = [
  {
    id: "i-1",
    statement: "近 3 年最大回撤 {f-mdd-3y} 远大于日常波动幅度，说明主要损失来自持续性下行阶段，而非每日噪音。",
    basis: ["f-mdd-3y", "f-vol-1y"],
    confidence: "medium",
    caveat: "基于历史序列的描述性推断，不预测未来。",
    when: (f) => Math.abs(num(f, "f-mdd-3y")) >= 10,
  },
  {
    id: "i-2a",
    statement: "{label:f-pe-pct} 处于中间区间（{f-pe-pct}），估值本身不是极端驱动因素。",
    basis: ["f-pe-pct"],
    confidence: "low",
    caveat: "分位不说明短期方向。",
    when: (f) => num(f, "f-pe-pct") >= 30 && num(f, "f-pe-pct") <= 70,
  },
  {
    id: "i-2b",
    statement: "{label:f-pe-pct} 较高（{f-pe-pct}），未来回报对盈利增长的依赖更大。",
    basis: ["f-pe-pct"],
    confidence: "low",
    caveat: "高分位不意味着一定下跌。",
    when: (f) => num(f, "f-pe-pct") > 70,
  },
  {
    id: "i-2c",
    statement: "{label:f-pe-pct} 较低（{f-pe-pct}），但低估值本身不保证短期上涨。",
    basis: ["f-pe-pct"],
    confidence: "low",
    caveat: "低分位可能伴随盈利下修。",
    when: (f) => num(f, "f-pe-pct") < 30,
  },
  {
    id: "i-3",
    statement: "对费率的敏感度随持有期增长而提高。",
    basis: ["f-fee"],
    confidence: "high",
    caveat: "这是算术关系，不依赖市场判断。",
    when: () => true,
  },
];

export const BRIEF_ITEMS: WithLens<BriefItem>[] = [
  { id: "b-vol", title: "近期波动 vs 1 年均值", body: "20 日年化波动率 {f-vol-1m}，1 年为 {f-vol-1y}。", factIds: ["f-vol-1m", "f-vol-1y"], tags: ["volatility", "drawdown"], basePriority: 3, lensNotes: { short: "你的期限较短，近期波动对到期金额的影响更直接。", liquidity: "近期波动放大时，如果需要取款，卖出价格的不确定性也更高。", long: "对长期计划而言，这更多是持有体验的变化。", default: "波动说明幅度，不说明方向。" } },
  { id: "b-dd", title: "近 1 年最大回撤 {f-mdd-1y}", body: "1 年内最大回撤 {f-mdd-1y}，3 年内为 {f-mdd-3y}。", factIds: ["f-mdd-1y", "f-mdd-3y"], tags: ["drawdown", "liquidity", "capacity"], basePriority: 4, lensNotes: { liquidity: "如果 12 个月内需要用钱，这个数字值得先与可用资金对照。", lowCapacity: "请与你选择的可承受亏损区间（{p:lossCapacity}）对照。", long: "长期看是阶段性的，但需确认回撤时不用动用资金。", default: "回撤要和用钱时间一起看。" } },
  { id: "b-val", title: "估值分位 {f-pe-pct}", body: "{label:f-pe-pct} {f-pe-pct}；指数 PE-TTM {f-pe}，股息率 {f-dy}。", factIds: ["f-pe", "f-pe-pct", "f-dy"], tags: ["valuation", "long"], basePriority: 3, lensNotes: { long: "长期储备可以把估值区间作为跟踪重点。", liquidity: "对 1 年内的资金，估值解释力有限。", default: "估值不是择时工具。" } },
  { id: "b-cost", title: "综合费率 {f-fee}", body: "管理费 + 托管费 {f-fee}，跟踪误差 {f-te}；折溢价率 {f-premium}。", factIds: ["f-fee", "f-te", "f-premium"], tags: ["cost", "long", "tracking"], basePriority: 2, lensNotes: { long: "持有 10 年以上时，费率是少数可以确定控制的变量。", short: "短期持有时费率影响很小。", default: "费用确定，收益不确定。" } },
  { id: "b-sector", title: "第一大行业权重 {f-top-sector}", body: "跟踪指数 {f-index}；第一大行业权重 {f-top-sector}。", factIds: ["f-top-sector", "f-index"], tags: ["concentration", "composition", "basics"], basePriority: 2, lensNotes: { novice: "行业权重说明你买入的一篮子股票主要集中在哪些行业。", default: "可以结合自己的其他资产看相关性。" } },
];
