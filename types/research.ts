import type { Evidence } from "./evidence";
import type { MarketFact } from "./market";
import type { InvestorProfile, ProfileFieldKey, ProfileSignals } from "./profile";

/** 个性化标签：研究模块、风险与问题都通过标签和规则匹配。 */
export type ResearchTag =
  | "drawdown"
  | "liquidity"
  | "sequence"
  | "volatility"
  | "valuation"
  | "cost"
  | "tracking"
  | "composition"
  | "concentration"
  | "behavior"
  | "long"
  | "capacity"
  | "basics";

export interface ResearchRequest {
  symbol: string;
  question: string;
  /** 只有用户确认/选择的画像才会参与个性化；null 表示通用视角。 */
  profile: InvestorProfile | null;
  /** 第一迭代仅用于故障注入演示：error / unauthorized / slow。 */
  simulate?: SimulateMode;
}

export type SimulateMode = "none" | "error" | "unauthorized" | "slow" | "empty";

export interface ResearchTask {
  id: string;
  tool: "market.snapshot" | "market.history" | "market.financials" | "evidence.bind" | "personalization.rank";
  label: string;
  status: "done" | "skipped" | "failed";
  detail: string;
  isDemo: boolean;
}

/** 一条个性化原因 —— 「为什么看到这条」。 */
export interface PersonalizationReason {
  ruleId: string;
  ruleName: string;
  field: ProfileFieldKey | "signals";
  /** 触发规则的画像值的可读描述。 */
  trigger: string;
  effect: string;
  weight: number;
}

export interface Inference {
  id: string;
  statement: string;
  basis: string[];
  confidence: "low" | "medium" | "high";
  caveat: string;
}

export interface RiskItem {
  id: string;
  title: string;
  summary: string;
  detail: string;
  tags: ResearchTag[];
  baseSeverity: 1 | 2 | 3;
  factIds: string[];
}

export interface PersonalizedRisk extends RiskItem {
  /**
   * 客观严重程度：只由市场事实决定，对所有画像相同（市场跌幅不会因用户偏好改变）。
   */
  objectiveSeverity: 1 | 2 | 3;
  objectiveBasis: string;
  /** 与你的相关度（个人适用性）：由画像规则决定，可因人而异。字段名沿用第一迭代。 */
  severity: 1 | 2 | 3;
  emphasized: boolean;
  rank: number;
  reasons: PersonalizationReason[];
  /** 与当前画像相关的风险解释。 */
  lensNote: string;
}

export interface ResearchModule {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  bullets: string[];
  factIds: string[];
  evidenceIds: string[];
  tags: ResearchTag[];
  basePriority: number;
}

export interface PersonalizedModule extends ResearchModule {
  rank: number;
  score: number;
  reasons: PersonalizationReason[];
  /** 「这对你意味着什么」—— 根据研究视角选择的解释。 */
  lensNote: string;
  depth: ProfileSignals["depth"];
}

export interface OpenQuestion {
  id: string;
  question: string;
  why: string;
  tags: ResearchTag[];
  needsPhase2: boolean;
}

export interface PersonalizedQuestion extends OpenQuestion {
  rank: number;
  reasons: PersonalizationReason[];
}

export interface ResearchFocus {
  headline: string;
  summary: string;
  /** 研究顺序提示，如「先流动性，再估值」。 */
  sequence: string[];
}

export interface BriefItem {
  id: string;
  title: string;
  body: string;
  factIds: string[];
  tags: ResearchTag[];
  basePriority: number;
}

export interface PersonalizedBriefItem extends BriefItem {
  rank: number;
  reasons: PersonalizationReason[];
  lensNote: string;
}

export interface ResearchEngineInfo {
  engine: "demo-rules" | "llm";
  version: string;
  isLLM: boolean;
  label: string;
}

export interface DataSourceInfo {
  mode: "demo" | "fuyao";
  label: string;
  isDemo: boolean;
  /** 事实层中最新的有效时间（ISO），演示数据为 null。 */
  asOf: string | null;
  degraded: { capability: string; code: string; message: string }[];
}

export interface ResearchResult {
  symbol: string;
  dataSource?: DataSourceInfo;
  news?: import("./market").NewsItem[];
  question: string;
  engine: ResearchEngineInfo;
  tasks: ResearchTask[];
  /** 事实层：对所有画像完全相同。 */
  facts: MarketFact[];
  evidence: Evidence[];
  inferences: Inference[];
  modules: PersonalizedModule[];
  risks: PersonalizedRisk[];
  openQuestions: PersonalizedQuestion[];
  focus: ResearchFocus;
  signals: ProfileSignals;
  appliedRules: AppliedRule[];
  disclaimers: string[];
  /** 事实层指纹：用于直观证明 A/B 切换时事实不变。 */
  factFingerprint: string;
}

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  trigger: string;
  effect: string;
  field: ProfileFieldKey | "signals";
}

export interface BriefResult {
  symbol: string;
  dataSource?: DataSourceInfo;
  items: PersonalizedBriefItem[];
  facts: MarketFact[];
  engine: ResearchEngineInfo;
  factFingerprint: string;
  signals: ProfileSignals;
}
