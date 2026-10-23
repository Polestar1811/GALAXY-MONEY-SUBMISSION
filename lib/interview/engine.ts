import type { AskedQuestion, Contradiction, Fact, FactKey, Inference, InterviewProgress, InterviewState, TraitKey, Turn } from "@/types/identity";
import { enforceCompliance } from "@/lib/agent/guards";
import { FACT_SPEC, FACT_SPECS, isValidValue, TRAIT_KEYS, TRAIT_LABELS, valueLabel } from "./catalog";
import { CORE_BY_ID, CORE_QUESTIONS, INTERVIEW_LIMITS, KEY_FACTS, askCore } from "./questions";

/**
 * 访谈状态机（纯函数，客户端与服务端共用）。
 * 硬约束全部在这里由程序执行，而不是依赖提示词：
 * - 单次访谈最多 20 题（含追问），追问最多 4 个；
 * - 模型提取的事实必须落在目录取值内，且「原话片段」必须真实出现在用户本轮回答中，否则只能作为待确认的推断；
 * - 用户点选的选项直接记为事实；跳过 / 拒答的字段保持未知；
 * - 用户手动修改过的事实不会被模型覆盖。
 */

/** 访谈模型一轮的结构化输出（已通过 Zod 校验，见 lib/interview/llm.ts）。 */
export interface TurnUnderstanding {
  acknowledgment: string;
  extractedFacts: { key: string; value: string; quote: string }[];
  inferredTraits: { key: string; value: string; basis: string; confidence: "low" | "medium" }[];
  missingInformation: string[];
  contradictions: { description: string; keys: string[] }[];
  next: { type: "core" | "followup" | "finish"; questionId?: string | null; text?: string | null; targets?: string[] | null };
  questionReason: string;
  completionEligibility: boolean;
}

export interface AnswerInput {
  text: string;
  /** 用户点选的快捷选项（对应题目的主要字段）。 */
  choice: string | null;
}

const now = () => new Date().toISOString();
const isFactKey = (k: string): k is FactKey => k in FACT_SPEC;
const isTraitKey = (k: string): k is TraitKey => (TRAIT_KEYS as string[]).includes(k);

/** 比较原话时忽略空白与标点。 */
export function normalizeForQuote(s: string): string {
  return s.toLowerCase().replace(/[\s，,。.！!？?、；;：:“”"'‘’（）()【】\[\]…—\-~]/g, "");
}

export function quoteInAnswer(quote: string, answer: string): boolean {
  const q = normalizeForQuote(quote);
  return q.length >= 2 && normalizeForQuote(answer).includes(q);
}

const CN_DIGIT: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/**
 * 文本中的数值：全部阿拉伯数字；中文数字只在后接金额 / 比例单位时计入（「一万」「三成」「二十岁」），
 * 避免把「一年」「一些」这类普通用语当作数字。
 */
export function allNumbers(text: string): number[] {
  const out = Array.from(text.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)).map((m) => Number(m[0]));
  for (const m of text.matchAll(/([零一二两三四五六七八九十百千]+)(?=\s*(?:万|千|元|块|成|岁|%))/g)) {
    const s = m[1];
    let total = 0;
    let cur = 0;
    for (const ch of s) {
      if (ch in CN_DIGIT) cur = CN_DIGIT[ch];
      else {
        const unit = ch === "十" ? 10 : ch === "百" ? 100 : 1000;
        total += (cur || 1) * unit;
        cur = 0;
      }
    }
    total += cur;
    if (total > 0) out.push(total);
  }
  return out;
}

/**
 * 研究伙伴的回应、矛盾说明与追问中出现的数字，必须出现在用户的回答、已知信息或访谈问题里；
 * 否则视为错误转述（真实验收中模型曾把用户的「10%–20%」说成「5% 以内」），不展示该句。
 */
export function numbersGrounded(text: string, sources: string[]): boolean {
  const allowed = new Set(sources.flatMap(allNumbers));
  return allNumbers(text).every((n) => allowed.has(n));
}

function groundSources(state: InterviewState, answer?: AnswerInput): string[] {
  return [
    ...state.turns.flatMap((t) => [t.answer?.text ?? "", t.question.text]),
    ...(state.current ? [state.current.text] : []),
    answer?.text ?? "",
    ...Object.values(state.facts).map((f) => f!.label),
  ];
}

/** 「不便透露」只在用户明确拒答时成立（真实验收中模型曾把「没有别的储备」误记为不便透露）。 */
export const REFUSAL_RE = /不(想|方便|愿意?|太想)(说|透露|回答|讲|告诉)|不便透露|保密|隐私|不告诉|无可奉告|跳过|不回答|不说了/;

/**
 * 从用户原话中解析人民币金额（如「10 万」「8000 元」「50w」）。解析不到返回 null。
 * 用于资金区间：用户给出了明确金额时，以用户的数字为准，而不是模型的归类（真实验收中模型曾把「50 万」归为 5–20 万）。
 */
export function parseCny(text: string): number | null {
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(万|w|千|k|元|块)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const v = unit === "万" || unit === "w" ? n * 10_000 : unit === "千" || unit === "k" ? n * 1_000 : n;
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function amountBand(v: number): string {
  return v < 10_000 ? "lt10k" : v < 50_000 ? "10kto50k" : v < 200_000 ? "50kto200k" : v < 1_000_000 ? "200kto1m" : "gt1m";
}

export function newInterview(): InterviewState {
  return {
    version: 2,
    turns: [],
    current: askCore(CORE_BY_ID.q04),
    facts: {},
    inferences: [],
    skipped: [],
    contradictions: [],
    followUpsUsed: 0,
    status: "active",
    llmFailures: 0,
  };
}

/** 已掌握：有事实，或用户明确跳过 / 拒答。 */
export function isResolved(state: Pick<InterviewState, "facts" | "skipped">, key: FactKey): boolean {
  return !!state.facts[key] || state.skipped.includes(key);
}

export function askedCoreIds(state: InterviewState): string[] {
  const ids = state.turns.filter((t) => t.question.kind === "core").map((t) => t.question.id);
  return state.current?.kind === "core" ? [...ids, state.current.id] : ids;
}

/** 尚未问过、且仍有未掌握信息的核心题，按优先级排序。 */
export function coreCandidates(state: InterviewState) {
  const asked = new Set(askedCoreIds(state));
  return CORE_QUESTIONS.filter((q) => !asked.has(q.id) && q.targets.some((t) => !isResolved(state, t))).sort((a, b) => a.priority - b.priority);
}

export function progress(state: InterviewState): InterviewProgress {
  const answered = state.turns.length;
  const keyGaps = KEY_FACTS.filter((k) => !isResolved(state, k));
  const remainingCore = coreCandidates(state).length;
  const room = INTERVIEW_LIMITS.maxQuestions - answered;
  return {
    asked: answered + (state.current ? 1 : 0),
    max: INTERVIEW_LIMITS.maxQuestions,
    followUpsUsed: state.followUpsUsed,
    maxFollowUps: INTERVIEW_LIMITS.maxFollowUps,
    remainingEstimate: Math.max(0, Math.min(room, remainingCore)),
    canFinish: answered >= 1,
    keyGaps,
  };
}

/** 规则层能确定的矛盾（不依赖模型）。 */
export function ruleContradictions(facts: InterviewState["facts"]): Contradiction[] {
  const v = (k: FactKey) => facts[k]?.value;
  const out: Contradiction[] = [];
  const lowCapacity = v("lossImpact") === "lt5" || v("lossImpact") === "5to10";
  if (v("expectedOutcome") === "double_fast" && (lowCapacity || v("reserveMonths") === "lt3"))
    out.push({ id: "c-required-capacity", origin: "rules", keys: ["expectedOutcome", "lossImpact", "reserveMonths"], description: "希望短期内大幅增长，但能承受的损失或应急储备有限：高收益目标通常意味着更大的亏损可能。" });
  if ((v("drawdownReaction") === "buy_more" || v("drawdownReaction") === "buy_some") && lowCapacity)
    out.push({ id: "c-willing-capacity", origin: "rules", keys: ["drawdownReaction", "lossImpact"], description: "下跌时愿意加仓，但实际能承受的损失较小：意愿与能力之间存在落差。" });
  if ((v("nearTermExpense") === "within1y" || v("nearTermExpense") === "1to3y") && (v("horizon") === "5to10y" || v("horizon") === "gt10y") && (v("nearTermExpenseShare") === "most" || v("nearTermExpenseShare") === "partial"))
    out.push({ id: "c-horizon-expense", origin: "rules", keys: ["horizon", "nearTermExpense", "nearTermExpenseShare"], description: "计划长期不动用这笔钱，但其中有相当部分可能用于近几年的重要支出。" });
  return out;
}

function mergeContradictions(state: InterviewState, llm: TurnUnderstanding["contradictions"], turnId: string): Contradiction[] {
  const rules = ruleContradictions(state.facts);
  const sources = groundSources(state);
  const fromLlm: Contradiction[] = llm
    .map((c, i) => ({
      id: `c-llm-${turnId}-${i}`,
      origin: "llm" as const,
      keys: c.keys.filter(isFactKey),
      description: enforceCompliance(c.description.trim().slice(0, 140)).text,
    }))
    .filter((c) => c.description.length >= 6 && c.keys.length > 0 && numbersGrounded(c.description, sources));
  // 模型给出的矛盾只保留最近 3 条（真实验收中同一矛盾会被不同措辞反复报告）
  const llmAll = [...state.contradictions.filter((c) => c.origin === "llm"), ...fromLlm].slice(-3);
  const seen = new Set<string>();
  return [...rules, ...llmAll].filter((c) => {
    const sig = c.origin === "rules" ? c.id : normalizeForQuote(c.description);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  }).slice(0, 6);
}

/** 校验并写入模型提取的事实。不符合目录或原话不在回答中的「事实」降级为待确认的推断。 */
function applyExtraction(state: InterviewState, turnId: string, answer: AnswerInput, u: TurnUnderstanding | null, question: AskedQuestion): { facts: InterviewState["facts"]; inferences: Inference[] } {
  const facts = { ...state.facts };
  const inferences = [...state.inferences];
  const put = (f: Fact) => {
    const existing = facts[f.key];
    if (existing?.lockedByUser) return; // 用户手动修改过的事实不被覆盖
    facts[f.key] = f;
  };

  // 1. 用户点选的选项：确定性记录
  const core = CORE_BY_ID[question.id];
  if (answer.choice && core?.chipsFor && isValidValue(core.chipsFor, answer.choice)) {
    put({ key: core.chipsFor, value: answer.choice, label: valueLabel(core.chipsFor, answer.choice) ?? answer.choice, source: "selected", quote: null, turnId, lockedByUser: false, updatedAt: now() });
  }

  if (!u) return { facts, inferences };

  // 2. 模型从原话中提取的事实
  let n = 0;
  for (const e of u.extractedFacts.slice(0, 8)) {
    if (!isFactKey(e.key)) continue;
    const spec = FACT_SPEC[e.key];
    let value = spec.text ? e.quote.trim().slice(0, 80) : e.value;
    // 拒答必须真的是拒答；否则这项保持未知，而不是记成「不便透露」
    if (value === "prefer_not" && !REFUSAL_RE.test(answer.text)) continue;
    // 用户给出了明确金额：区间以用户的数字为准
    if (e.key === "investAmount" && value !== "prefer_not") {
      const v = parseCny(e.quote) ?? parseCny(answer.text);
      if (v !== null) value = amountBand(v);
    }
    if (!isValidValue(e.key, value)) continue;
    // 用户已经点选了同一字段：以点选为准
    if (answer.choice && core?.chipsFor === e.key) continue;
    if (quoteInAnswer(e.quote, answer.text)) {
      put({ key: e.key, value, label: valueLabel(e.key, value) ?? value, source: "stated", quote: e.quote.trim().slice(0, 120), turnId, lockedByUser: false, updatedAt: now() });
    } else {
      inferences.push({ id: `inf-${turnId}-${n++}`, key: e.key, value, label: valueLabel(e.key, value) ?? value, basis: "模型的理解（未在你的原话中找到对应表述，需要你确认）", confidence: "low", status: "pending", turnId });
    }
  }

  // 3. 推断（倾向 / 未直接陈述的事实）：只能作为待确认项
  for (const t of u.inferredTraits.slice(0, 4)) {
    const basis = enforceCompliance(t.basis.trim().slice(0, 160)).text;
    if (!basis) continue;
    if (isTraitKey(t.key)) {
      if (inferences.some((x) => x.key === t.key && x.status !== "rejected")) continue;
      inferences.push({ id: `inf-${turnId}-${n++}`, key: t.key, value: "yes", label: TRAIT_LABELS[t.key], basis, confidence: t.confidence, status: "pending", turnId });
    } else if (isFactKey(t.key) && !facts[t.key] && isValidValue(t.key, t.value)) {
      if (inferences.some((x) => x.key === t.key && x.status === "pending")) continue;
      inferences.push({ id: `inf-${turnId}-${n++}`, key: t.key, value: t.value, label: valueLabel(t.key, t.value) ?? t.value, basis, confidence: t.confidence, status: "pending", turnId });
    }
  }
  return { facts, inferences };
}

/** 程序决定下一题：模型只能在规则允许的范围内提议。 */
export function selectNext(state: InterviewState, u: TurnUnderstanding | null): { next: AskedQuestion | null; followUpUsed: boolean } {
  if (state.turns.length >= INTERVIEW_LIMITS.maxQuestions) return { next: null, followUpUsed: false };
  const candidates = coreCandidates(state);
  const keyGaps = KEY_FACTS.filter((k) => !isResolved(state, k));
  const p = u?.next;

  if (p?.type === "followup" && state.followUpsUsed < INTERVIEW_LIMITS.maxFollowUps) {
    const text = enforceCompliance((p.text ?? "").trim()).text;
    const targets = (p.targets ?? []).filter(isFactKey);
    const previous = state.turns.map((t) => normalizeForQuote(t.question.text));
    const meaningful = targets.some((t) => !isResolved(state, t) || state.contradictions.some((c) => c.keys.includes(t)));
    const grounded = numbersGrounded(text, [...groundSources(state), ...FACT_SPECS.flatMap((s) => s.values.map((v) => v.label))]);
    if (text.length >= 6 && text.length <= 160 && targets.length > 0 && meaningful && grounded && !previous.includes(normalizeForQuote(text))) {
      const reason = enforceCompliance((u?.questionReason ?? "").trim().slice(0, 160)).text || null;
      return {
        next: { id: `fu-${state.followUpsUsed + 1}`, kind: "followup", text, targets, reason, helper: { kind: "none" }, sensitive: targets.some((t) => FACT_SPEC[t].sensitive) },
        followUpUsed: true,
      };
    }
  }
  if (p?.type === "finish" && keyGaps.length === 0) return { next: null, followUpUsed: false };
  if (p?.type === "core" && p.questionId) {
    const q = candidates.find((c) => c.id === p.questionId);
    if (q) {
      const phrased = enforceCompliance((p.text ?? "").trim()).text;
      return { next: askCore(q, phrased.length >= 6 && phrased.length <= 160 ? phrased : null), followUpUsed: false };
    }
  }
  if (candidates.length === 0) return { next: null, followUpUsed: false };
  return { next: askCore(candidates[0]), followUpUsed: false };
}

/** 记录一轮回答。u 为 null 表示模型不可用：只记录点选的选项，自由文本保持未解析，不编造。 */
export function applyAnswer(state: InterviewState, answer: AnswerInput, u: TurnUnderstanding | null): InterviewState {
  if (state.status !== "active" || !state.current) return state;
  const question = state.current;
  const turnId = `t${state.turns.length + 1}`;
  const { facts, inferences } = applyExtraction(state, turnId, answer, u, question);
  let ack = u ? enforceCompliance(u.acknowledgment.trim().slice(0, 140)).text || null : null;
  // 回应中转述的数字必须与用户原话 / 已知信息一致，否则不展示这句回应
  if (ack && !numbersGrounded(ack, groundSources({ ...state, facts }, answer))) ack = null;
  const turn: Turn = {
    id: turnId,
    question,
    answer: { text: answer.text.slice(0, 1000), choice: answer.choice },
    skipped: false,
    acknowledgment: ack,
    ai: u ? "llm" : answer.text.trim() ? "fallback" : "none",
    at: now(),
  };
  const draft: InterviewState = { ...state, turns: [...state.turns, turn], facts, inferences, current: null, llmFailures: state.llmFailures + (u || !answer.text.trim() ? 0 : 1) };
  draft.contradictions = mergeContradictions(draft, u?.contradictions ?? [], turnId);
  const { next, followUpUsed } = selectNext(draft, u);
  return { ...draft, current: next, followUpsUsed: draft.followUpsUsed + (followUpUsed ? 1 : 0), status: next ? "active" : "complete" };
}

/** 跳过当前问题：相关字段记为「用户跳过」，保持未知。 */
export function applySkip(state: InterviewState): InterviewState {
  if (state.status !== "active" || !state.current) return state;
  const question = state.current;
  const turn: Turn = { id: `t${state.turns.length + 1}`, question, answer: null, skipped: true, acknowledgment: null, ai: "none", at: now() };
  const skipped = Array.from(new Set([...state.skipped, ...question.targets.filter((t) => !state.facts[t])]));
  const draft: InterviewState = { ...state, turns: [...state.turns, turn], skipped, current: null };
  const { next } = selectNext(draft, null);
  return { ...draft, current: next, status: next ? "active" : "complete" };
}

/** 返回上一题：撤回上一轮及其产生的事实与推断，重新回答。 */
export function rewind(state: InterviewState): InterviewState {
  const last = state.turns[state.turns.length - 1];
  if (!last) return state;
  const facts = { ...state.facts };
  for (const k of Object.keys(facts) as FactKey[]) if (facts[k]?.turnId === last.id && !facts[k]?.lockedByUser) delete facts[k];
  const skipped = last.skipped ? state.skipped.filter((k) => !last.question.targets.includes(k)) : state.skipped;
  const turns = state.turns.slice(0, -1);
  // 如果当前题是追问，回退后它不再计入
  const followUpsUsed = turns.filter((t) => t.question.kind === "followup").length + (last.question.kind === "followup" ? 1 : 0);
  const draft: InterviewState = {
    ...state,
    turns,
    facts,
    skipped,
    inferences: state.inferences.filter((i) => i.turnId !== last.id),
    current: last.question,
    followUpsUsed,
    status: "active",
  };
  return { ...draft, contradictions: mergeContradictions({ ...draft, contradictions: draft.contradictions.filter((c) => !c.id.includes(`-${last.id}-`)) }, [], last.id) };
}

/** 用户主动提前结束。 */
export function finishEarly(state: InterviewState): InterviewState {
  return { ...state, current: null, status: "complete" };
}

/** 用户在画像页手动修改一项事实：锁定，之后不被模型覆盖。value 为 null 表示删除。 */
export function editFact(state: Pick<InterviewState, "facts" | "skipped" | "inferences">, key: FactKey, value: string | null) {
  const facts = { ...state.facts };
  if (value === null) {
    delete facts[key];
    return { ...state, facts, skipped: Array.from(new Set([...state.skipped, key])) };
  }
  if (!isValidValue(key, value)) return state;
  facts[key] = { key, value, label: valueLabel(key, value) ?? value, source: "edited", quote: null, turnId: null, lockedByUser: true, updatedAt: now() };
  return {
    ...state,
    facts,
    skipped: state.skipped.filter((k) => k !== key),
    // 该字段的待确认推断已被用户的明确选择取代
    inferences: state.inferences.map((i) => (i.key === key && i.status === "pending" ? { ...i, status: "rejected" as const } : i)),
  };
}

/** 确认或拒绝一条推断。确认「事实型」推断会把它写为用户确认的事实。 */
export function reviewInference(state: Pick<InterviewState, "facts" | "skipped" | "inferences">, id: string, accept: boolean) {
  const inf = state.inferences.find((i) => i.id === id);
  if (!inf) return state;
  const inferences = state.inferences.map((i) => (i.id === id ? { ...i, status: accept ? ("confirmed" as const) : ("rejected" as const) } : i));
  if (accept && isFactKey(inf.key)) {
    const s = editFact({ ...state, inferences }, inf.key, inf.value);
    return { ...s, inferences };
  }
  return { ...state, inferences };
}
