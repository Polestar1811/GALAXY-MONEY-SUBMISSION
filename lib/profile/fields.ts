import type { ProfileFieldKey, ProfileValues } from "@/types/profile";

export interface FieldOption<V extends string = string> {
  value: V;
  label: string;
  hint?: string;
}

export interface FieldGlossary {
  term: string;
  definition: string;
}

export interface ProfileFieldMeta {
  key: ProfileFieldKey;
  label: string;
  /** Genesis 中由研究伙伴提出的问题。 */
  question: string;
  /** 为什么问这个问题。 */
  why: string;
  options: FieldOption[];
  optional: boolean;
  /** 是否属于需要格外谨慎的信息（收入相关）。 */
  sensitive: boolean;
  glossary?: FieldGlossary;
  /** 这项信息如何影响研究展示（与 lib/personalization/rules.ts 对应）。 */
  influences: string[];
  group: "目标" | "经验" | "风险" | "资金";
}

/**
 * 画像字段的唯一信息源：Genesis、画像管理页、个性化规则说明都从这里读取。
 */
export const PROFILE_FIELDS: ProfileFieldMeta[] = [
  {
    key: "goal",
    label: "投资目标",
    group: "目标",
    question: "先从目标开始：这笔钱最主要是为了什么？",
    why: "目标决定我们优先研究「增长空间」还是「资金安全」。",
    optional: false,
    sensitive: false,
    options: [
      { value: "wealth_growth", label: "长期财富增值", hint: "没有明确用途，希望稳步增长" },
      { value: "retirement", label: "养老储备", hint: "为退休后的生活做准备" },
      { value: "education", label: "子女教育", hint: "有一个大致的使用年份" },
      { value: "major_purchase", label: "大额支出", hint: "如购房首付、装修、换车" },
      { value: "learning", label: "学习了解市场", hint: "小额投入，以学习为主" },
    ],
    influences: ["决定研究结论卡的切入角度", "大额支出目标会提高「资金使用时点」模块的优先级"],
  },
  {
    key: "horizon",
    label: "投资期限",
    group: "目标",
    question: "这笔钱大概可以投资多长时间？",
    why: "期限越短，短期回撤对你的影响越直接。",
    optional: false,
    sensitive: false,
    options: [
      { value: "lt1y", label: "1 年以内" },
      { value: "1to3y", label: "1 – 3 年" },
      { value: "3to5y", label: "3 – 5 年" },
      { value: "5to10y", label: "5 – 10 年" },
      { value: "gt10y", label: "10 年以上" },
    ],
    glossary: {
      term: "投资期限",
      definition: "预计不需要动用这笔资金的时间长度，而不是计划持有某只产品的时间。",
    },
    influences: ["短期限：回撤、波动模块前置", "长期限：估值区间、持有成本与持有纪律前置"],
  },
  {
    key: "experience",
    label: "投资经验",
    group: "经验",
    question: "你之前接触过哪些投资？",
    why: "这决定我们解释的深度 —— 不是门槛，只是讲法不同。",
    optional: false,
    sensitive: false,
    options: [
      { value: "novice", label: "刚开始", hint: "主要是存款、货币基金" },
      { value: "some", label: "有一些经验", hint: "买过基金或 ETF，1–3 年" },
      { value: "experienced", label: "比较丰富", hint: "3 年以上，股票与 ETF 都有" },
      { value: "professional", label: "专业背景", hint: "从业或系统学习过投研" },
    ],
    glossary: {
      term: "ETF",
      definition: "交易型开放式指数基金，在交易所像股票一样买卖，通常跟踪某个指数，例如沪深300。",
    },
    influences: ["新手：展开术语解释、优先说明「你买的是什么」", "专业：解释更精简，补充跟踪误差等细节"],
  },
  {
    key: "riskWillingness",
    label: "主观风险偏好",
    group: "风险",
    question: "假设你持有的指数基金一个月内下跌了 20%，你最可能怎么做？",
    why: "这衡量的是你「愿意」承受多少波动 —— 它和「能够」承受多少不一定相同。",
    optional: false,
    sensitive: false,
    options: [
      { value: "conservative", label: "尽快全部卖出", hint: "避免继续下跌" },
      { value: "cautious", label: "卖出一部分", hint: "降低焦虑" },
      { value: "balanced", label: "按计划持有", hint: "不做额外操作" },
      { value: "growth", label: "考虑小幅增加", hint: "认为是更便宜的价格" },
      { value: "aggressive", label: "考虑大幅增加", hint: "主动寻找下跌机会" },
    ],
    glossary: {
      term: "主观风险偏好",
      definition: "你在心理上愿意接受的波动程度。InvestLens 不会仅凭它来判断你适合什么。",
    },
    influences: ["与客观承受能力对比，若偏好更高则提示「持有纪律」与「仓位边界」"],
  },
  {
    key: "lossCapacity",
    label: "客观损失承受能力",
    group: "风险",
    question: "这笔投资最多亏损多少，仍然不会影响你的日常生活或既定计划？",
    why: "这是「能够」承受的上限，通常比主观感受更能决定风险边界。",
    optional: false,
    sensitive: false,
    options: [
      { value: "lt5", label: "5% 以内" },
      { value: "5to10", label: "5% – 10%" },
      { value: "10to20", label: "10% – 20%" },
      { value: "20to35", label: "20% – 35%" },
      { value: "gt35", label: "35% 以上" },
    ],
    glossary: {
      term: "客观承受能力",
      definition: "由收入、储备、负债和资金用途决定的实际亏损上限，与心理偏好无关。",
    },
    influences: ["承受能力较低：回撤模块与仓位边界问题前置，风险等级上调"],
  },
  {
    key: "liquidityNeed",
    label: "近期资金需要",
    group: "资金",
    question: "未来 12 个月内，你是否可能需要动用这笔钱？",
    why: "如果需要用钱时恰好遇到下跌，可能被迫在低点卖出。",
    optional: false,
    sensitive: false,
    options: [
      { value: "most", label: "很可能需要大部分" },
      { value: "some", label: "可能需要一部分" },
      { value: "none", label: "基本不需要" },
    ],
    glossary: {
      term: "流动性需要",
      definition: "在特定时间点必须把投资变成现金的需求。它会放大短期回撤的实际影响。",
    },
    influences: ["有近期用款：「资金使用时点」风险升至最高优先级，情景模拟默认开启取款"],
  },
  {
    key: "emergencyReserve",
    label: "独立应急储备",
    group: "资金",
    question: "除了这笔投资，你是否有单独的应急储备（约 3–6 个月生活开支）？",
    why: "独立储备意味着市场下跌时你不必卖出投资来应急。",
    optional: false,
    sensitive: false,
    options: [
      { value: "yes", label: "有，且独立存放" },
      { value: "partial", label: "有一部分" },
      { value: "no", label: "暂时没有" },
    ],
    influences: ["有独立储备：降低流动性风险权重", "没有储备：提高流动性与回撤风险权重"],
  },
  {
    key: "incomeStability",
    label: "收入稳定性（可选）",
    group: "资金",
    question: "最后一个可选问题：你的收入大致稳定吗？可以直接跳过。",
    why: "只用于判断回撤期间是否需要动用投资；我们不会询问或推断具体收入。",
    optional: true,
    sensitive: true,
    options: [
      { value: "stable", label: "稳定" },
      { value: "mostly_stable", label: "大致稳定" },
      { value: "variable", label: "波动较大" },
      { value: "prefer_not", label: "不便透露" },
    ],
    influences: ["收入波动较大：轻微提高流动性风险权重；选择「不便透露」不会产生任何推断"],
  },
];

export const FIELD_MAP: Record<ProfileFieldKey, ProfileFieldMeta> = Object.fromEntries(
  PROFILE_FIELDS.map((f) => [f.key, f]),
) as Record<ProfileFieldKey, ProfileFieldMeta>;

export function optionLabel(key: ProfileFieldKey, value: ProfileValues[ProfileFieldKey] | undefined): string | null {
  if (!value) return null;
  return FIELD_MAP[key].options.find((o) => o.value === value)?.label ?? null;
}

export const REQUIRED_FIELDS = PROFILE_FIELDS.filter((f) => !f.optional).map((f) => f.key);
