/**
 * 投资者画像。只包含用户主动提供的信息；
 * 系统推断出的「研究视角」(ProfileSignals) 与用户事实严格分开，并标注为推断。
 */

export type Goal = "wealth_growth" | "retirement" | "education" | "major_purchase" | "learning";
export type Horizon = "lt1y" | "1to3y" | "3to5y" | "5to10y" | "gt10y";
export type Experience = "novice" | "some" | "experienced" | "professional";
/** 主观风险偏好：愿意承受多少波动。 */
export type RiskWillingness = "conservative" | "cautious" | "balanced" | "growth" | "aggressive";
/** 客观损失承受能力：亏损多少仍不影响生活和计划。 */
export type LossCapacity = "lt5" | "5to10" | "10to20" | "20to35" | "gt35";
export type LiquidityNeed = "most" | "some" | "none";
export type EmergencyReserve = "yes" | "partial" | "no";
export type IncomeStability = "stable" | "mostly_stable" | "variable" | "prefer_not";

export interface ProfileValues {
  goal?: Goal;
  horizon?: Horizon;
  experience?: Experience;
  riskWillingness?: RiskWillingness;
  lossCapacity?: LossCapacity;
  liquidityNeed?: LiquidityNeed;
  emergencyReserve?: EmergencyReserve;
  incomeStability?: IncomeStability;
}

export type ProfileFieldKey = keyof ProfileValues;

export interface ProfileConsent {
  /** 仅在用户明确选择「仅保存在此设备」后为 true。 */
  persistLocal: boolean;
  updatedAt: string | null;
}

export interface InvestorProfile extends ProfileValues {
  id: string;
  kind: "user" | "demo";
  label: string;
  /** 用户主动跳过的问题。 */
  skipped: ProfileFieldKey[];
  status: "draft" | "confirmed";
  confirmedAt: string | null;
  consent: ProfileConsent;
}

/** 由画像推导出的研究视角 —— 这是推断，不是用户事实。 */
export interface ProfileSignals {
  horizon: "short" | "medium" | "long" | "unknown";
  liquidityPressure: "high" | "medium" | "low" | "unknown";
  capacity: "low" | "medium" | "high" | "unknown";
  willingness: "low" | "medium" | "high" | "unknown";
  experience: "novice" | "intermediate" | "advanced" | "unknown";
  /** 主观偏好高于客观承受能力。 */
  willingnessExceedsCapacity: boolean;
  /** 解释深度。 */
  depth: "detailed" | "standard" | "concise";
}

export type LensId = "self" | "A" | "B";
