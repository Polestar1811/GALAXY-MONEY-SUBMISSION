import type { Constraint, IdentityNarrative, IdentityProfile } from "@/types/identity";
import { FACT_SPEC } from "@/lib/interview/catalog";
import { buildDimensions, constraintsOf, riskTriad, unknownFacts } from "./dimensions";

const LEVEL_WORD = { low: "较低", medium: "中等", high: "较高", unknown: "未知" } as const;

/**
 * 投资人格叙述的输入（同时用于大模型与规则兜底）：只包含字段、取值与规则结论，不包含访谈原话。
 */
export function narrativeInput(profile: IdentityProfile) {
  const triad = riskTriad(profile.facts);
  return {
    facts: Object.values(profile.facts).map((f) => ({ field: FACT_SPEC[f!.key].label, value: f!.label, source: f!.source })),
    inferences: profile.inferences.filter((i) => i.status !== "rejected").map((i) => ({ item: i.label, basis: i.basis, status: i.status === "confirmed" ? "用户已确认" : "待确认推断" })),
    unknown: unknownFacts(profile).map((k) => FACT_SPEC[k].label),
    user_declined: profile.skipped.map((k) => FACT_SPEC[k].label),
    // 用中文程度词（而不是 low/high 编码），避免模型把编码原样写进给用户的叙述
    risk: {
      capacity_objective: { level: LEVEL_WORD[triad.capacity.level], why: triad.capacity.why },
      tolerance_subjective: { level: LEVEL_WORD[triad.tolerance.level], why: triad.tolerance.why },
      required_by_goal: { level: LEVEL_WORD[triad.required.level], why: triad.required.why },
    },
    constraints: constraintsOf(profile.facts).map((c) => ({ severity: c.severity, title: c.title, detail: c.detail })),
    dimensions: buildDimensions(profile).map((d) => ({ title: d.title, summary: d.summary })),
    contradictions: profile.contradictions.map((c) => c.description),
  };
}

const TOP_QUESTION: Record<Constraint["id"], { title: string; why: string }> = {
  near_term_need: { title: "先保障近期必须使用的资金", why: "这部分钱不适合承担短期波动，需要先和长期资金分开考虑。" },
  no_reserve: { title: "先建立足够的应急储备", why: "没有储备时，意外支出可能迫使你在下跌时卖出投资。" },
  heavy_debt: { title: "先评估负债成本", why: "高息负债的成本可能超过投资的预期收益。" },
  dependents_unstable: { title: "明确家庭责任对风险边界的影响", why: "家人依赖与收入波动会降低实际能承受的损失。" },
  required_gt_capacity: { title: "重新审视收益期望与可承受损失", why: "越高的收益目标，通常意味着越深的潜在亏损。" },
  willingness_gt_capacity: { title: "以实际承受能力为风险边界", why: "愿意承担风险不代表财务上承受得住。" },
  capacity_unknown: { title: "弄清楚你实际能承受多少损失", why: "这决定了哪些研究方向适合你。" },
};

/** 规则兜底叙述：大模型不可用时使用，明确标注来源。 */
export function rulesNarrative(profile: IdentityProfile): IdentityNarrative {
  const t = riskTriad(profile.facts);
  const cons = constraintsOf(profile.facts);
  const word = { low: "较低", medium: "中等", high: "较高", unknown: "还不清楚" } as const;
  const goal = profile.facts.lifeGoal ? `你希望财富能带来的改变是「${profile.facts.lifeGoal.value}」。` : "";
  const understanding = [
    `${goal}从你的回答看，你的客观风险承受能力${word[t.capacity.level]}（${t.capacity.why}），主观上愿意承担的波动${word[t.tolerance.level]}，目标对风险的要求${word[t.required.level]}。这三件事需要分开看。`,
    cons.length ? `目前最需要优先考虑的约束是：${cons.filter((c) => c.severity !== "info").map((c) => c.title).join("、") || cons[0].title}。` : "目前没有发现明显的硬性财务约束，但仍建议先确认应急储备和资金用途。",
  ];
  const tops = cons.filter((c) => c.severity !== "info").map((c) => TOP_QUESTION[c.id]);
  if (tops.length < 3 && (t.required.level === "medium" || t.required.level === "high")) tops.push({ title: "探索长期财富增长的方式", why: "在保障必要支出之后，长期增长值得进一步研究。" });
  if (tops.length < 3) tops.push(TOP_QUESTION.capacity_unknown);
  if (tops.length < 3) tops.push({ title: "了解不同资产的风险与代价", why: "理解每种选择可能的结果，才能自己做决定。" });
  return {
    understanding,
    topQuestions: tops.slice(0, 3),
    tendencies: profile.inferences.filter((i) => i.status !== "rejected" && i.key.length > 0 && !(i.key in FACT_SPEC)).map((i) => ({ text: i.label, basis: i.basis })).slice(0, 3),
    uncertainties: unknownFacts(profile).slice(0, 5).map((k) => ({ item: FACT_SPEC[k].label, impact: "未知时，相关的风险判断会更保守，并在研究中标注不确定。" })),
    source: "rules",
    notes: [],
  };
}
