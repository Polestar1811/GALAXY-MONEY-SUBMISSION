import type { InvestorProfile, ProfileFieldKey, ProfileSignals } from "@/types/profile";
import type { ResearchTag } from "@/types/research";
import { optionLabel } from "@/lib/profile/fields";
import type { LensKey } from "@/lib/demo-data/research-content";

/**
 * 确定性个性化规则（演示逻辑，非大模型）。
 * 每条规则只调整「研究优先级与解释」，从不修改事实层数据。
 */
export interface PersonalizationRule {
  id: string;
  name: string;
  field: ProfileFieldKey | "signals";
  when: (s: ProfileSignals, p: InvestorProfile) => boolean;
  /** 标签加权：正数前置，负数后置。 */
  boosts: Partial<Record<ResearchTag, number>>;
  trigger: (p: InvestorProfile) => string;
  effect: string;
}

const label = (p: InvestorProfile, k: ProfileFieldKey) => optionLabel(k, p[k]) ?? "未回答";

export const RULES: PersonalizationRule[] = [
  {
    id: "R1-liquidity",
    name: "近期资金需要",
    field: "liquidityNeed",
    when: (s) => s.liquidityPressure === "high",
    boosts: { liquidity: 4, sequence: 4, drawdown: 2 },
    trigger: (p) => `近 12 个月资金需要：${label(p, "liquidityNeed")}；应急储备：${label(p, "emergencyReserve")}`,
    effect: "「用钱时点 × 回撤」升至最高优先级",
  },
  {
    id: "R2-short-horizon",
    name: "短投资期限",
    field: "horizon",
    when: (s) => s.horizon === "short",
    boosts: { drawdown: 2, volatility: 3, long: -2, cost: -1 },
    trigger: (p) => `投资期限：${label(p, "horizon")}`,
    effect: "回撤与波动前置，长期变量（估值、费率复利）后置",
  },
  {
    id: "R3-long-horizon",
    name: "长投资期限",
    field: "horizon",
    when: (s) => s.horizon === "long",
    boosts: { valuation: 3, cost: 3, behavior: 2, long: 2, volatility: -1 },
    trigger: (p) => `投资期限：${label(p, "horizon")}`,
    effect: "估值区间、持有成本与持有纪律前置",
  },
  {
    id: "R4-reserve",
    name: "独立应急储备",
    field: "emergencyReserve",
    when: (s, p) => p.emergencyReserve === "yes" && s.liquidityPressure === "low",
    boosts: { liquidity: -3, sequence: -3 },
    trigger: (p) => `应急储备：${label(p, "emergencyReserve")}`,
    effect: "降低「被迫卖出」相关风险的权重",
  },
  {
    id: "R5-low-capacity",
    name: "客观承受能力较低",
    field: "lossCapacity",
    when: (s) => s.capacity === "low",
    boosts: { capacity: 3, drawdown: 2 },
    trigger: (p) => `可承受亏损：${label(p, "lossCapacity")}`,
    effect: "回撤风险等级上调，增加仓位边界问题",
  },
  {
    id: "R6-gap",
    name: "主观偏好高于客观能力",
    field: "riskWillingness",
    when: (s) => s.willingnessExceedsCapacity,
    boosts: { behavior: 3, capacity: 1 },
    trigger: (p) => `主观偏好「${label(p, "riskWillingness")}」 vs 承受能力「${label(p, "lossCapacity")}」`,
    effect: "提示行为风险，以客观承受能力为准设定研究边界",
  },
  {
    id: "R7-novice",
    name: "入门经验",
    field: "experience",
    when: (s) => s.experience === "novice",
    boosts: { basics: 3, composition: 2 },
    trigger: (p) => `投资经验：${label(p, "experience")}`,
    effect: "优先解释「你买的是什么」，展开术语",
  },
  {
    id: "R8-advanced",
    name: "资深经验",
    field: "experience",
    when: (s) => s.experience === "advanced",
    boosts: { tracking: 2, basics: -2 },
    trigger: (p) => `投资经验：${label(p, "experience")}`,
    effect: "解释精简，补充跟踪误差与口径细节",
  },
];

/** 研究视角 → 解释优先级。决定每个模块选用哪一条「这对你意味着」。 */
export function lensOrder(s: ProfileSignals): LensKey[] {
  const keys: LensKey[] = [];
  if (s.willingnessExceedsCapacity) keys.push("gap");
  if (s.liquidityPressure === "high") keys.push("liquidity");
  if (s.capacity === "low") keys.push("lowCapacity");
  if (s.horizon === "short") keys.push("short");
  if (s.horizon === "long") keys.push("long");
  if (s.experience === "novice") keys.push("novice");
  if (s.experience === "advanced") keys.push("advanced");
  keys.push("default");
  return keys;
}
