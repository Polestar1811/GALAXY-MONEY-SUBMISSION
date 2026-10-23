import { z } from "zod";
import type { InvestorProfile } from "@/types/profile";

export const fieldKeySchema = z.enum([
  "goal",
  "horizon",
  "experience",
  "riskWillingness",
  "lossCapacity",
  "liquidityNeed",
  "emergencyReserve",
  "incomeStability",
]);

export const investorProfileSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["user", "demo"]),
  label: z.string().min(1).max(40),
  goal: z.enum(["wealth_growth", "retirement", "education", "major_purchase", "learning"]).optional(),
  horizon: z.enum(["lt1y", "1to3y", "3to5y", "5to10y", "gt10y"]).optional(),
  experience: z.enum(["novice", "some", "experienced", "professional"]).optional(),
  riskWillingness: z.enum(["conservative", "cautious", "balanced", "growth", "aggressive"]).optional(),
  lossCapacity: z.enum(["lt5", "5to10", "10to20", "20to35", "gt35"]).optional(),
  liquidityNeed: z.enum(["most", "some", "none"]).optional(),
  emergencyReserve: z.enum(["yes", "partial", "no"]).optional(),
  incomeStability: z.enum(["stable", "mostly_stable", "variable", "prefer_not"]).optional(),
  skipped: z.array(fieldKeySchema),
  status: z.enum(["draft", "confirmed"]),
  confirmedAt: z.string().nullable(),
  consent: z.object({
    persistLocal: z.boolean(),
    updatedAt: z.string().nullable(),
  }),
});

/** 校验外部输入（localStorage / API 请求体）。非法数据直接丢弃，不做猜测性修复。 */
export function parseProfile(input: unknown): InvestorProfile | null {
  const r = investorProfileSchema.safeParse(input);
  return r.success ? (r.data as InvestorProfile) : null;
}
