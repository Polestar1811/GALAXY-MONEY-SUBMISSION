import { z } from "zod";
import type { ResearchResult } from "@/types/research";

/** 研究计划阶段可选择的白名单研究工具（只读，不含任何交易能力）。 */
export const TOOL_NAMES = ["market_snapshot", "price_history", "fund_profile_valuation", "fund_news"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_LABELS: Record<ToolName, string> = {
  market_snapshot: "行情快照",
  price_history: "历史日线与回撤 / 波动计算",
  fund_profile_valuation: "基金资料与估值分位",
  fund_news: "基金资讯",
};

export const FOCUS_TAGS = [
  "drawdown",
  "liquidity",
  "sequence",
  "volatility",
  "valuation",
  "cost",
  "tracking",
  "composition",
  "concentration",
  "behavior",
  "long",
  "capacity",
  "basics",
] as const;

/* ---------- Understand + Plan 输出 ---------- */
export const planSchema = z.object({
  intent: z.string().min(1).max(200),
  outOfScope: z.boolean().default(false),
  outOfScopeReason: z.string().max(200).nullish(),
  focusTags: z.array(z.string()).max(8).default([]),
  steps: z
    .array(z.object({ tool: z.string(), purpose: z.string().max(160) }))
    .min(1)
    .max(8),
});
export type RawPlan = z.infer<typeof planSchema>;

export interface ResearchPlan {
  intent: string;
  outOfScope: boolean;
  outOfScopeReason: string | null;
  focusTags: (typeof FOCUS_TAGS)[number][];
  steps: { tool: ToolName; purpose: string }[];
  source: "llm" | "fallback";
  notes: string[];
}

/* ---------- Respond 输出 ---------- */
/**
 * 列表超长时截断而不是整体拒绝：真实验收中 deepseek-flash 返回了 7 条信息缺口（上限 6），
 * 导致一份证据完整、合规的回答被整体判为失败。文本长度仍是硬上限（截断句子可能改变含义）。
 */
const capped = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).transform((a) => a.slice(0, max));

export const answerSchema = z.object({
  summary: z.string().min(1).max(1600),
  findings: capped(
    z.object({
      kind: z.enum(["fact", "inference"]),
      statement: z.string().min(1).max(500),
      evidenceIds: z.array(z.string()).default([]).transform((a) => a.slice(0, 6)),
    }),
    10,
  ),
  risks: capped(
    z.object({
      riskId: z.string(),
      explanation: z.string().min(1).max(500),
      evidenceIds: z.array(z.string()).default([]).transform((a) => a.slice(0, 6)),
    }),
    8,
  ).default([]),
  uncertainties: capped(z.string().max(400), 8).default([]),
  informationGaps: capped(z.string().max(400), 10).default([]),
  followUps: capped(z.string().max(160), 4).default([]),
});export type RawAnswer = z.infer<typeof answerSchema>;

export type FindingKind = "fact" | "inference" | "unverified";

export interface AnswerFinding {
  id: string;
  kind: FindingKind;
  statement: string;
  evidenceIds: string[];
  /** 校验说明（如引用无效、数字无法在事实层找到）。 */
  issues: string[];
}

export interface AnswerRisk {
  riskId: string;
  title: string;
  explanation: string;
  evidenceIds: string[];
  /** 客观严重程度与个人相关度都来自规则引擎，模型无权修改。 */
  objectiveSeverity: 1 | 2 | 3;
  personalRelevance: 1 | 2 | 3;
  source: "llm" | "rules";
  issues: string[];
}

export interface AIAnswer {
  summary: string;
  findings: AnswerFinding[];
  risks: AnswerRisk[];
  uncertainties: string[];
  informationGaps: string[];
  followUps: string[];
}

export interface Verification {
  invalidEvidenceIds: string[];
  unverifiedNumbers: string[];
  complianceRemoved: string[];
  restoredRisks: string[];
  passed: boolean;
}

export type AgentStage = "understand" | "plan" | "retrieve" | "verify" | "personalize" | "respond";

export const STAGE_LABELS: Record<AgentStage, string> = {
  understand: "理解问题与画像",
  plan: "生成研究计划",
  retrieve: "调用金融数据工具",
  verify: "核验数据与证据",
  personalize: "按画像调整研究重点",
  respond: "生成研究结论",
};

export interface ToolCallRecord {
  id: string;
  tool: string;
  label: string;
  status: "running" | "done" | "failed" | "skipped";
  detail: string;
  ms?: number;
}

export interface ProfileFieldUse {
  field: string;
  label: string;
  value: string;
}

/** 各阶段真实耗时（毫秒，从收到请求开始计）。规划与数据获取并行执行，因此各阶段之和可能大于总耗时。 */
export interface AgentTimings {
  totalMs: number;
  /** 第一个进度事件发出的时间。 */
  firstEventMs: number;
  /** 数据获取（扶摇 / 演示数据集）。 */
  dataMs: number | null;
  /** 研究规划（含模型调用与修复重试）。 */
  planMs: number | null;
  verifyMs: number | null;
  personalizeMs: number | null;
  /** 最终回答的模型生成。 */
  respondLlmMs: number | null;
  /** 证据 / 数值 / 合规校验。 */
  guardsMs: number | null;
}

export interface LLMCallRecord {
  stage: AgentStage;
  model: string;
  latencyMs: number;
  firstChunkMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
}

export interface AgentResult {
  runId: string;
  symbol: string;
  question: string;
  status: "complete" | "degraded" | "out_of_scope";
  plan: ResearchPlan;
  /** 规则个性化后的研究视图（与本次 AI 回答使用同一份事实快照）。 */
  research: ResearchResult;
  snapshotId: string;
  answer: AIAnswer | null;
  verification: Verification;
  profileFieldsUsed: ProfileFieldUse[];
  profileFieldsWithheld: string[];
  tools: ToolCallRecord[];
  llm: { model: string; plannerModel?: string; calls: number; latencyMs: number; callLog?: LLMCallRecord[] } | null;
  timings?: AgentTimings;
  error: { stage: AgentStage; code: string; message: string } | null;
  createdAt: string;
}

export type AgentEvent =
  | { type: "stage"; stage: AgentStage; status: "running" | "done" | "failed" | "skipped"; detail?: string }
  | { type: "tool"; call: ToolCallRecord }
  | { type: "plan"; plan: ResearchPlan }
  /** 模型流式生成的真实进度（只有字符计数，不含任何推理内容）。 */
  | { type: "llm"; stage: AgentStage; model: string; reasoningChars: number; contentChars: number; elapsedMs: number }
  | { type: "result"; result: AgentResult }
  | { type: "error"; code: string; message: string; stage?: AgentStage };
