import { z } from "zod";
import type { FactKey, IdentityProfile, InterviewState } from "@/types/identity";
import { FACT_KEYS, isValidValue, TRAIT_KEYS } from "@/lib/interview/catalog";

/**
 * V2 API 请求体校验：访谈状态与画像由客户端保存（服务端不存储），因此服务端必须校验形状、长度与目录取值。
 * 非法数据直接拒绝，不做猜测性修复。
 */
const s = (max: number) => z.string().max(max);
const factKey = z.enum(FACT_KEYS as [FactKey, ...FactKey[]]);
const anyKey = z.enum([...FACT_KEYS, ...TRAIT_KEYS] as [string, ...string[]]);

const factSchema = z
  .object({
    key: factKey,
    value: s(80),
    label: s(120),
    source: z.enum(["stated", "selected", "edited"]),
    quote: s(160).nullable(),
    turnId: s(12).nullable(),
    lockedByUser: z.boolean(),
    updatedAt: s(40),
  })
  .refine((f) => isValidValue(f.key, f.value), "invalid fact value");

const inferenceSchema = z.object({
  id: s(40),
  key: anyKey,
  value: s(80),
  label: s(120),
  basis: s(240),
  confidence: z.enum(["low", "medium"]),
  status: z.enum(["pending", "confirmed", "rejected"]),
  turnId: s(12).nullable(),
});

const contradictionSchema = z.object({ id: s(60), description: s(200), keys: z.array(factKey).max(6), origin: z.enum(["rules", "llm"]) });

const factsSchema = z
  .record(z.string(), factSchema)
  .refine((r) => Object.entries(r).every(([k, f]) => k === f.key), "fact key mismatch")
  .refine((r) => Object.keys(r).length <= FACT_KEYS.length);

const questionSchema = z.object({
  id: s(12),
  kind: z.enum(["core", "followup"]),
  text: s(200),
  targets: z.array(factKey).max(6),
  reason: s(240).nullable(),
  helper: z.union([
    z.object({ kind: z.literal("chips"), options: z.array(z.object({ code: s(40), label: s(80) })).max(12), multi: z.literal(false).optional() }),
    z.object({ kind: z.literal("none") }),
  ]),
  sensitive: z.boolean(),
});

const turnSchema = z.object({
  id: s(12),
  question: questionSchema,
  answer: z.object({ text: s(1000), choice: s(40).nullable() }).nullable(),
  skipped: z.boolean(),
  acknowledgment: s(200).nullable(),
  ai: z.enum(["llm", "fallback", "none"]),
  at: s(40),
});

export const interviewStateSchema = z.object({
  version: z.literal(2),
  turns: z.array(turnSchema).max(20),
  current: questionSchema.nullable(),
  facts: factsSchema,
  inferences: z.array(inferenceSchema).max(60),
  skipped: z.array(factKey).max(FACT_KEYS.length),
  contradictions: z.array(contradictionSchema).max(10),
  followUpsUsed: z.number().int().min(0).max(4),
  status: z.enum(["active", "complete"]),
  llmFailures: z.number().int().min(0).max(100),
});

export const identityProfileSchema = z.object({
  facts: factsSchema,
  inferences: z.array(inferenceSchema).max(60),
  skipped: z.array(factKey).max(FACT_KEYS.length),
  contradictions: z.array(contradictionSchema).max(10),
  kind: z.enum(["user", "demo"]),
  label: s(60),
  confirmed: z.boolean(),
  confirmedAt: s(40).nullable(),
});

export const parseInterviewState = (x: unknown) => interviewStateSchema.safeParse(x) as { success: true; data: InterviewState } | { success: false; error: z.ZodError };
export const parseIdentityProfile = (x: unknown) => identityProfileSchema.safeParse(x) as { success: true; data: IdentityProfile } | { success: false; error: z.ZodError };
