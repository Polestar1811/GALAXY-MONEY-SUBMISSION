import type { InvestorProfile, ProfileSignals } from "@/types/profile";

const WILLINGNESS_LEVEL = { conservative: 1, cautious: 2, balanced: 3, growth: 4, aggressive: 5 } as const;
const CAPACITY_LEVEL = { lt5: 1, "5to10": 2, "10to20": 3, "20to35": 4, gt35: 5 } as const;

export const NEUTRAL_SIGNALS: ProfileSignals = {
  horizon: "unknown",
  liquidityPressure: "unknown",
  capacity: "unknown",
  willingness: "unknown",
  experience: "unknown",
  willingnessExceedsCapacity: false,
  depth: "standard",
};

/**
 * 从用户提供的画像推导研究视角。这些是「推断」，UI 中必须标注，
 * 且只基于用户回答过的字段；跳过的字段保持 unknown，不做猜测。
 */
export function deriveSignals(p: InvestorProfile | null): ProfileSignals {
  if (!p) return NEUTRAL_SIGNALS;

  const horizon: ProfileSignals["horizon"] = !p.horizon
    ? "unknown"
    : p.horizon === "lt1y" || p.horizon === "1to3y"
      ? "short"
      : p.horizon === "3to5y"
        ? "medium"
        : "long";

  let liquidityPressure: ProfileSignals["liquidityPressure"] = "unknown";
  if (p.liquidityNeed || p.emergencyReserve) {
    let score = 0;
    if (p.liquidityNeed === "most") score += 3;
    if (p.liquidityNeed === "some") score += 2;
    if (p.emergencyReserve === "no") score += 2;
    if (p.emergencyReserve === "partial") score += 1;
    if (p.incomeStability === "variable") score += 1;
    liquidityPressure = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  }

  const capLevel = p.lossCapacity ? CAPACITY_LEVEL[p.lossCapacity] : null;
  const capacity: ProfileSignals["capacity"] = capLevel === null ? "unknown" : capLevel <= 2 ? "low" : capLevel === 3 ? "medium" : "high";

  const willLevel = p.riskWillingness ? WILLINGNESS_LEVEL[p.riskWillingness] : null;
  const willingness: ProfileSignals["willingness"] = willLevel === null ? "unknown" : willLevel <= 2 ? "low" : willLevel === 3 ? "medium" : "high";

  const experience: ProfileSignals["experience"] = !p.experience
    ? "unknown"
    : p.experience === "novice"
      ? "novice"
      : p.experience === "some"
        ? "intermediate"
        : "advanced";

  const willingnessExceedsCapacity = willLevel !== null && capLevel !== null && willLevel - capLevel >= 2;

  const depth: ProfileSignals["depth"] =
    experience === "novice" ? "detailed" : p.experience === "professional" ? "concise" : "standard";

  return { horizon, liquidityPressure, capacity, willingness, experience, willingnessExceedsCapacity, depth };
}

export const SIGNAL_LABELS = {
  horizon: { short: "短期", medium: "中期", long: "长期", unknown: "未知" },
  liquidityPressure: { high: "较高", medium: "中等", low: "较低", unknown: "未知" },
  capacity: { low: "较低", medium: "中等", high: "较高", unknown: "未知" },
  willingness: { low: "保守", medium: "平衡", high: "积极", unknown: "未知" },
  experience: { novice: "入门", intermediate: "进阶", advanced: "资深", unknown: "未知" },
  depth: { detailed: "详细解释", standard: "标准", concise: "精简" },
} as const;
