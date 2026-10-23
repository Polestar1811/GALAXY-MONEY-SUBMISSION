import type { AskedQuestion, FactKey, QuestionHelper } from "@/types/identity";
import { FACT_SPEC } from "./catalog";

/**
 * 16 个核心问题的题库。题库只是候选：已经从其它回答中得知的内容会跳过，
 * 信息充分时可以提前结束；具体问哪一题、怎样措辞由访谈模型结合用户回答决定（程序校验）。
 */
export interface CoreQuestion {
  id: string;
  group: "A" | "B" | "C" | "D";
  groupLabel: string;
  text: string;
  targets: FactKey[];
  /** 快捷选项对应的主要字段；用户也可以直接用自己的话回答。 */
  chipsFor: FactKey | null;
  sensitive: boolean;
  /** 选择下一题时的优先级（越小越先问）：先确认会改变风险边界的硬约束。 */
  priority: number;
}

export const CORE_QUESTIONS: CoreQuestion[] = [
  { id: "q01", group: "A", groupLabel: "人生阶段与家庭责任", text: "先简单认识一下：你现在处于哪个年龄阶段？", targets: ["ageBand"], chipsFor: "ageBand", sensitive: true, priority: 9 },
  { id: "q02", group: "A", groupLabel: "人生阶段与家庭责任", text: "目前有没有家人在经济上依赖你的收入？", targets: ["dependents"], chipsFor: "dependents", sensitive: true, priority: 7 },
  { id: "q03", group: "A", groupLabel: "人生阶段与家庭责任", text: "未来三年里，有没有结婚、买房、教育、照顾老人这类重要支出？", targets: ["nearTermExpense", "nearTermExpenseShare"], chipsFor: "nearTermExpense", sensitive: false, priority: 2 },
  { id: "q04", group: "A", groupLabel: "人生阶段与家庭责任", text: "如果财富能为你的人生带来一个改变，你最希望是什么？", targets: ["lifeGoal"], chipsFor: null, sensitive: false, priority: 1 },
  { id: "q05", group: "B", groupLabel: "财务状况与实际承受能力", text: "你大概准备拿出多少资金来探索投资？用区间回答就可以。", targets: ["investAmount"], chipsFor: "investAmount", sensitive: true, priority: 6 },
  { id: "q06", group: "B", groupLabel: "财务状况与实际承受能力", text: "你目前主要的收入来源是什么？稳定程度怎么样？", targets: ["incomeSource", "incomeStability"], chipsFor: "incomeStability", sensitive: true, priority: 8 },
  { id: "q07", group: "B", groupLabel: "财务状况与实际承受能力", text: "如果暂时没有收入，你现有的储备大概能支撑多久的日常生活？", targets: ["reserveMonths"], chipsFor: "reserveMonths", sensitive: true, priority: 3 },
  { id: "q08", group: "B", groupLabel: "财务状况与实际承受能力", text: "有没有房贷、消费贷或其他每月必须承担的支出？", targets: ["debt"], chipsFor: "debt", sensitive: true, priority: 5 },
  { id: "q09", group: "C", groupLabel: "投资动机与目标", text: "是什么让你开始关注投资的？", targets: ["motivation"], chipsFor: "motivation", sensitive: false, priority: 11 },
  { id: "q10", group: "C", groupLabel: "投资动机与目标", text: "你预计什么时候可能需要动用这笔钱？", targets: ["horizon"], chipsFor: "horizon", sensitive: false, priority: 2 },
  { id: "q11", group: "C", groupLabel: "投资动机与目标", text: "你希望投资给你带来怎样的结果？", targets: ["expectedOutcome"], chipsFor: "expectedOutcome", sensitive: false, priority: 4 },
  { id: "q12", group: "C", groupLabel: "投资动机与目标", text: "你愿意花多少时间来学习和管理投资？", targets: ["timeCommitment"], chipsFor: "timeCommitment", sensitive: false, priority: 12 },
  { id: "q13", group: "D", groupLabel: "投资经验与决策心理", text: "以前接触过哪些投资产品？哪怕只是存款、理财也可以说说。", targets: ["experience"], chipsFor: "experience", sensitive: false, priority: 10 },
  { id: "q14", group: "D", groupLabel: "投资经验与决策心理", text: "如果投资出现亏损，亏到多少会实质影响你的生活或计划？", targets: ["lossImpact"], chipsFor: "lossImpact", sensitive: false, priority: 3 },
  { id: "q15", group: "D", groupLabel: "投资经验与决策心理", text: "假设你的投资在一个月内下跌了 20%，你会怎么看待、怎么处理？", targets: ["drawdownReaction"], chipsFor: "drawdownReaction", sensitive: false, priority: 4 },
  { id: "q16", group: "D", groupLabel: "投资经验与决策心理", text: "如果朋友的投资半年上涨了 50%，而你没有参与，你会是什么感受？", targets: ["fomoReaction"], chipsFor: "fomoReaction", sensitive: false, priority: 13 },
];

export const CORE_BY_ID: Record<string, CoreQuestion> = Object.fromEntries(CORE_QUESTIONS.map((q) => [q.id, q]));

export const INTERVIEW_LIMITS = { maxQuestions: 20, maxFollowUps: 4, coreQuestions: CORE_QUESTIONS.length } as const;

/** 判断风险边界的关键信息：全部掌握（或用户明确跳过）后才允许提前结束。 */
export const KEY_FACTS: FactKey[] = ["horizon", "nearTermExpense", "reserveMonths", "lossImpact", "drawdownReaction", "experience"];

export function helperFor(key: FactKey | null): QuestionHelper {
  if (!key) return { kind: "none" };
  const spec = FACT_SPEC[key];
  if (!spec || spec.text) return { kind: "none" };
  return { kind: "chips", options: spec.values.map((v) => ({ code: v.code, label: v.label })) };
}

export function askCore(q: CoreQuestion, text?: string | null): AskedQuestion {
  return { id: q.id, kind: "core", text: text?.trim() || q.text, targets: q.targets, reason: null, helper: helperFor(q.chipsFor), sensitive: q.sensitive };
}
