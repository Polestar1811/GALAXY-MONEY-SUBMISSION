/**
 * Galaxy Money V2 数据契约：深度访谈、投资人格与研究路径。
 *
 * 原则：
 * - 用户直接陈述 / 选择的信息（Fact）与模型推断（Inference）分开保存，推断必须带依据并等待用户确认；
 * - 未回答、跳过的事项保持未知，不由程序或模型补全；
 * - 用户手动修改过的事实（lockedByUser）不会再被模型覆盖。
 */

export type FactKey =
  | "ageBand"
  | "dependents"
  | "nearTermExpense"
  | "nearTermExpenseShare"
  | "lifeGoal"
  | "investAmount"
  | "incomeSource"
  | "incomeStability"
  | "reserveMonths"
  | "debt"
  | "motivation"
  | "horizon"
  | "expectedOutcome"
  | "timeCommitment"
  | "experience"
  | "lossImpact"
  | "drawdownReaction"
  | "fomoReaction";

export type TraitKey = "lossAversion" | "chasingImpulse" | "patience" | "controlNeed" | "overconfidence";

export type DimensionId = "lifeStage" | "capacity" | "willingness" | "knowledge" | "motivation" | "behavior" | "time";

/** stated：模型从用户原话中提取（必须附原话片段）；selected：用户点选的选项；edited：用户在画像页手动修改。 */
export type FactSource = "stated" | "selected" | "edited";

export interface Fact {
  key: FactKey;
  /** 目录中的取值编码；lifeGoal 等文本型字段为简短原文摘录。 */
  value: string;
  /** 面向用户的显示文本。 */
  label: string;
  source: FactSource;
  /** 用户原话片段（stated 时必有，且必须出现在该轮回答中）。 */
  quote: string | null;
  /** 来自哪一轮问答（用于「返回修改」时撤回）。 */
  turnId: string | null;
  lockedByUser: boolean;
  updatedAt: string;
}

export type InferenceStatus = "pending" | "confirmed" | "rejected";

export interface Inference {
  id: string;
  /** 可以是事实字段（模型推断了一个用户没有直接说的事实），也可以是决策倾向。 */
  key: FactKey | TraitKey;
  value: string;
  label: string;
  /** 依据：引用的用户原话或推理说明。 */
  basis: string;
  confidence: "low" | "medium";
  status: InferenceStatus;
  turnId: string | null;
}

export interface Contradiction {
  id: string;
  description: string;
  keys: FactKey[];
  origin: "rules" | "llm";
}

export type QuestionHelper =
  | { kind: "chips"; options: { code: string; label: string }[]; multi?: false }
  | { kind: "none" };

export interface AskedQuestion {
  /** 核心题为题库 id（q01–q16），追问为 fu-1…fu-4。 */
  id: string;
  kind: "core" | "followup";
  text: string;
  targets: FactKey[];
  /** 为什么问（追问时由模型给出，经长度与合规校验）。 */
  reason: string | null;
  helper: QuestionHelper;
  sensitive: boolean;
}

export interface Turn {
  id: string;
  question: AskedQuestion;
  answer: { text: string; choice: string | null } | null;
  skipped: boolean;
  /** 研究伙伴对这条回答的简短反馈（模型生成，经校验）。 */
  acknowledgment: string | null;
  /** 本轮的理解是否由大模型完成；fallback 表示模型不可用，只记录了用户点选的选项。 */
  ai: "llm" | "fallback" | "none";
  at: string;
}

export interface InterviewState {
  version: 2;
  turns: Turn[];
  current: AskedQuestion | null;
  facts: Partial<Record<FactKey, Fact>>;
  inferences: Inference[];
  /** 用户明确跳过 / 拒答的字段。 */
  skipped: FactKey[];
  contradictions: Contradiction[];
  followUpsUsed: number;
  status: "active" | "complete";
  /** 本次访谈中模型调用失败的次数（用于界面提示）。 */
  llmFailures: number;
}

export interface InterviewProgress {
  asked: number;
  max: number;
  followUpsUsed: number;
  maxFollowUps: number;
  /** 预计还需要的问题数（按尚未掌握的核心信息估算）。 */
  remainingEstimate: number;
  canFinish: boolean;
  /** 尚未掌握且影响判断的关键信息。 */
  keyGaps: FactKey[];
}

export type Level = "low" | "medium" | "high" | "unknown";

export interface EvidenceRef {
  factKey: FactKey | TraitKey;
  label: string;
  quote: string | null;
  source: FactSource | "inferred";
}

export interface Dimension {
  id: DimensionId;
  title: string;
  summary: string;
  level: Level;
  evidence: EvidenceRef[];
  unknown: FactKey[];
}

export interface RiskTriad {
  capacity: { level: Level; why: string };
  tolerance: { level: Level; why: string };
  required: { level: Level; why: string };
}

export interface Constraint {
  id: "near_term_need" | "no_reserve" | "heavy_debt" | "dependents_unstable" | "required_gt_capacity" | "willingness_gt_capacity" | "capacity_unknown";
  severity: "hard" | "soft" | "info";
  title: string;
  detail: string;
  keys: FactKey[];
}

export interface IdentityProfile {
  facts: Partial<Record<FactKey, Fact>>;
  inferences: Inference[];
  skipped: FactKey[];
  contradictions: Contradiction[];
  kind: "user" | "demo";
  label: string;
  confirmed: boolean;
  confirmedAt: string | null;
}

export interface IdentityNarrative {
  understanding: string[];
  topQuestions: { title: string; why: string }[];
  tendencies: { text: string; basis: string }[];
  uncertainties: { item: string; impact: string }[];
  source: "llm" | "rules";
  /** 生成失败或被护栏处理的说明。 */
  notes: string[];
}

export type PathId = "A" | "B" | "C";

export interface MoneyPath {
  id: PathId;
  title: string;
  tagline: string;
  /** 规则层决定：priority（建议先研究）、available、conditional（需先满足前提）。 */
  status: "priority" | "available" | "conditional";
  gate: string | null;
  why: string;
  helps: string;
  risks: string[];
  costs: string[];
  changes: string[];
  explore: string[];
}

export interface PathsResult {
  paths: MoneyPath[];
  /** 规则层给出的排序依据（向用户解释「为什么先看这条」）。 */
  orderReason: string;
  source: "llm" | "rules";
  notes: string[];
}
