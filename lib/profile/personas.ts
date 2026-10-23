import type { InvestorProfile } from "@/types/profile";

/**
 * 两套明确标记为「虚构」的演示画像。它们不对应任何真实个人。
 */
export const PERSONA_A: InvestorProfile = {
  id: "demo-persona-a",
  kind: "demo",
  label: "虚构画像 A · 近期用款",
  goal: "major_purchase",
  horizon: "lt1y",
  experience: "some",
  riskWillingness: "growth",
  lossCapacity: "5to10",
  liquidityNeed: "most",
  emergencyReserve: "no",
  incomeStability: "mostly_stable",
  skipped: [],
  status: "confirmed",
  confirmedAt: null,
  consent: { persistLocal: false, updatedAt: null },
};

export const PERSONA_B: InvestorProfile = {
  id: "demo-persona-b",
  kind: "demo",
  label: "虚构画像 B · 长期储备",
  goal: "retirement",
  horizon: "gt10y",
  experience: "experienced",
  riskWillingness: "balanced",
  lossCapacity: "20to35",
  liquidityNeed: "none",
  emergencyReserve: "yes",
  incomeStability: "stable",
  skipped: [],
  status: "confirmed",
  confirmedAt: null,
  consent: { persistLocal: false, updatedAt: null },
};

export const PERSONAS = { A: PERSONA_A, B: PERSONA_B } as const;

export interface PersonaMeta {
  id: "A" | "B";
  short: string;
  title: string;
  tagline: string;
  traits: string[];
}

export const PERSONA_META: Record<"A" | "B", PersonaMeta> = {
  A: {
    id: "A",
    short: "A",
    title: "近期用款型",
    tagline: "约 1 年内需要动用资金，暂无独立应急储备",
    traits: ["期限 < 1 年", "12 个月内需用大部分资金", "无独立储备", "主观偏好 > 客观承受"],
  },
  B: {
    id: "B",
    short: "B",
    title: "长期储备型",
    tagline: "为养老储备，应急资金独立，期限 10 年以上",
    traits: ["期限 > 10 年", "基本不需动用", "应急储备独立", "可承受 20–35% 波动"],
  },
};

export function emptyUserProfile(): InvestorProfile {
  return {
    id: "user-local",
    kind: "user",
    label: "我的画像",
    skipped: [],
    status: "draft",
    confirmedAt: null,
    consent: { persistLocal: false, updatedAt: null },
  };
}
