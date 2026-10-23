import type { Fact, FactKey, IdentityProfile, Inference } from "@/types/identity";
import { valueLabel } from "@/lib/interview/catalog";

/**
 * 两位明确标注「虚构」的演示用户，与 InvestLens 原有的虚构画像 A / B 一致（便于对比与回归）。
 * 他们的「原话」是为演示编写的示例，不对应任何真实个人。
 */
function facts(entries: [FactKey, string, string | null][]): IdentityProfile["facts"] {
  const out: IdentityProfile["facts"] = {};
  for (const [key, value, quote] of entries) {
    const f: Fact = { key, value, label: valueLabel(key, value) ?? value, source: quote ? "stated" : "selected", quote, turnId: null, lockedByUser: false, updatedAt: "2026-10-22T00:00:00.000Z" };
    out[key] = f;
  }
  return out;
}

const inf = (id: string, key: Inference["key"], label: string, basis: string): Inference => ({ id, key, value: "yes", label, basis, confidence: "medium", status: "pending", turnId: null });

export const DEMO_IDENTITIES: Record<"A" | "B", IdentityProfile> = {
  A: {
    kind: "demo",
    label: "虚构用户 A · 一年内要结婚",
    confirmed: true,
    confirmedAt: null,
    skipped: [],
    contradictions: [],
    facts: facts([
      ["ageBand", "25to34", null],
      ["dependents", "none", null],
      ["nearTermExpense", "within1y", "明年结婚，婚礼和首付都要用钱"],
      ["nearTermExpenseShare", "most", "10 万里大概 6 万要留给婚礼"],
      ["lifeGoal", "希望婚后家里有一笔安心的钱", "希望婚后家里有一笔安心的钱"],
      ["investAmount", "50kto200k", null],
      ["incomeSource", "salary", null],
      ["incomeStability", "mostly_stable", null],
      ["reserveMonths", "lt3", "存款基本都在这 10 万里"],
      ["debt", "none", null],
      ["motivation", "growth", null],
      ["horizon", "lt1y", null],
      ["expectedOutcome", "double_fast", "希望一年能翻倍"],
      ["timeCommitment", "weekly", null],
      ["experience", "funds", null],
      ["lossImpact", "5to10", null],
      ["drawdownReaction", "buy_some", null],
      ["fomoReaction", "strong", "看到朋友赚了会很着急"],
    ]),
    inferences: [inf("demo-a-1", "chasingImpulse", "容易被短期上涨吸引", "你说看到朋友赚钱会很着急，并希望一年翻倍。"), inf("demo-a-2", "overconfidence", "对收益的预期可能偏乐观", "一年翻倍的目标远高于大多数资产的长期历史表现。")],
  },
  B: {
    kind: "demo",
    label: "虚构用户 B · 为十年后养老做准备",
    confirmed: true,
    confirmedAt: null,
    skipped: [],
    contradictions: [],
    facts: facts([
      ["ageBand", "45to54", null],
      ["dependents", "children", null],
      ["nearTermExpense", "none", null],
      ["lifeGoal", "退休后不用为钱发愁，还能照顾孩子", "退休后不用为钱发愁，还能照顾孩子"],
      ["investAmount", "200kto1m", null],
      ["incomeSource", "salary", null],
      ["incomeStability", "stable", null],
      ["reserveMonths", "6to12", null],
      ["debt", "manageable", null],
      ["motivation", "retirement", null],
      ["horizon", "gt10y", null],
      ["expectedOutcome", "steady_growth", null],
      ["timeCommitment", "monthly", null],
      ["experience", "stocks", null],
      ["lossImpact", "20to35", null],
      ["drawdownReaction", "hold", null],
      ["fomoReaction", "calm", null],
    ]),
    inferences: [inf("demo-b-1", "patience", "愿意长期等待", "你的期限在 10 年以上，下跌时选择按计划持有。")],
  },
};
