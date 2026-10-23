import type { Constraint, Dimension, DimensionId, EvidenceRef, Fact, FactKey, IdentityProfile, Inference, Level, RiskTriad } from "@/types/identity";
import type { InvestorProfile } from "@/types/profile";
import { FACT_SPEC, FACT_SPECS } from "@/lib/interview/catalog";

/**
 * 七维投资人格（确定性规则，客户端与服务端共用）。
 * 风险被拆成三件事，互不替代：
 * - Risk Capacity：客观承受能力（储备、负债、近期支出、可承受损失、期限）；
 * - Risk Tolerance：主观意愿（下跌时的反应、看到别人上涨的感受）；
 * - Required Risk：目标对风险的要求（期望结果与期限）。
 * 「不便透露」与未回答一律视为未知，不参与推断。
 */

type Facts = IdentityProfile["facts"];
const val = (f: Facts, k: FactKey): string | null => {
  const v = f[k]?.value;
  return v && v !== "prefer_not" ? v : null;
};

const evidence = (f: Facts, keys: FactKey[], inferences: Inference[] = []): EvidenceRef[] => {
  const out: EvidenceRef[] = [];
  for (const k of keys) {
    const fact = f[k];
    if (fact) out.push({ factKey: k, label: `${FACT_SPEC[k].label}：${fact.label}`, quote: fact.quote, source: fact.source });
  }
  for (const i of inferences) if (i.status !== "rejected") out.push({ factKey: i.key, label: i.label, quote: null, source: "inferred" });
  return out;
};

const unknownOf = (f: Facts, keys: FactKey[]) => keys.filter((k) => !val(f, k));

const DIM_KEYS: Record<DimensionId, FactKey[]> = {
  lifeStage: ["ageBand", "dependents", "nearTermExpense", "lifeGoal"],
  capacity: ["investAmount", "incomeSource", "incomeStability", "reserveMonths", "debt", "nearTermExpenseShare", "lossImpact"],
  willingness: ["drawdownReaction", "fomoReaction"],
  knowledge: ["experience"],
  motivation: ["motivation", "expectedOutcome", "lifeGoal"],
  behavior: ["fomoReaction", "drawdownReaction"],
  time: ["horizon", "timeCommitment"],
};

export function riskTriad(f: Facts): RiskTriad {
  // 客观承受能力：取各项约束中最紧的一项
  const signals: Level[] = [];
  const reasons: string[] = [];
  const loss = val(f, "lossImpact");
  if (loss) {
    signals.push(loss === "lt5" || loss === "5to10" ? "low" : loss === "10to20" ? "medium" : "high");
    reasons.push(`能承受的损失为${f.lossImpact!.label}`);
  }
  const reserve = val(f, "reserveMonths");
  if (reserve) {
    signals.push(reserve === "lt3" ? "low" : reserve === "3to6" ? "medium" : "high");
    reasons.push(`储备可支撑${f.reserveMonths!.label}`);
  }
  const expense = val(f, "nearTermExpense");
  const share = val(f, "nearTermExpenseShare");
  if (expense && expense !== "none") {
    signals.push(share === "most" || share === "partial" || expense === "within1y" ? "low" : "medium");
    reasons.push(`${f.nearTermExpense!.label}${share ? `（${f.nearTermExpenseShare!.label}）` : ""}`);
  }
  if (val(f, "debt") === "heavy") {
    signals.push("low");
    reasons.push("负债压力较大");
  }
  const horizon = val(f, "horizon");
  if (horizon) {
    signals.push(horizon === "lt1y" || horizon === "1to3y" ? "low" : horizon === "3to5y" ? "medium" : "high");
    reasons.push(`预计${f.horizon!.label}动用`);
  }
  const order: Level[] = ["low", "medium", "high"];
  const capacity: Level = signals.length === 0 ? "unknown" : order[Math.min(...signals.map((s) => order.indexOf(s)))];

  const react = val(f, "drawdownReaction");
  const fomo = val(f, "fomoReaction");
  let tolerance: Level = "unknown";
  if (react) tolerance = react === "sell_all" || react === "sell_some" ? "low" : react === "hold" ? "medium" : "high";
  const tolWhy = react ? `下跌 20% 时：${f.drawdownReaction!.label}${fomo ? `；看到别人大涨：${f.fomoReaction!.label}` : ""}` : "还不清楚你面对下跌时的反应";

  const out = val(f, "expectedOutcome");
  let required: Level = "unknown";
  let reqWhy = "还不清楚你希望投资带来什么结果";
  if (out) {
    required = out === "preserve" || out === "beat_deposit" ? "low" : out === "steady_growth" ? "medium" : "high";
    reqWhy = `你的期望：${f.expectedOutcome!.label}${horizon ? `，期限${f.horizon!.label}` : ""}`;
    if (out === "high_growth" && (horizon === "5to10y" || horizon === "gt10y")) {
      required = "medium";
      reqWhy += "；较长的期限降低了对短期高收益的依赖";
    }
  }
  return {
    capacity: { level: capacity, why: reasons.length ? reasons.join("；") : "关键的财务信息还未知" },
    tolerance: { level: tolerance, why: tolWhy },
    required: { level: required, why: reqWhy },
  };
}

export function constraintsOf(f: Facts): Constraint[] {
  const out: Constraint[] = [];
  const expense = val(f, "nearTermExpense");
  const share = val(f, "nearTermExpenseShare");
  const horizon = val(f, "horizon");
  if ((expense && expense !== "none" && share !== "none") || horizon === "lt1y" || horizon === "1to3y")
    out.push({
      id: "near_term_need",
      severity: share === "small" ? "soft" : "hard",
      title: "近期有必须使用的资金",
      detail: "近一两年要用的钱，不适合承担短期大幅波动；需要先把它和可以长期投资的部分分开。",
      keys: ["nearTermExpense", "nearTermExpenseShare", "horizon"],
    });
  if (val(f, "reserveMonths") === "lt3")
    out.push({ id: "no_reserve", severity: "hard", title: "应急储备不足 3 个月", detail: "没有足够的应急储备时，一次意外支出就可能迫使你在下跌时卖出投资。", keys: ["reserveMonths"] });
  if (val(f, "debt") === "heavy") out.push({ id: "heavy_debt", severity: "hard", title: "负债压力较大", detail: "高息或沉重的负债通常应先被考虑，投资收益未必能覆盖负债成本。", keys: ["debt"] });
  const dep = val(f, "dependents");
  const stab = val(f, "incomeStability");
  if (dep && dep !== "none" && (stab === "variable" || stab === "none"))
    out.push({ id: "dependents_unstable", severity: "soft", title: "有家人依赖、收入不稳定", detail: "家庭责任加上收入波动，会降低你能实际承受的损失。", keys: ["dependents", "incomeStability"] });
  const t = riskTriad(f);
  if (t.required.level === "high" && (t.capacity.level === "low" || t.capacity.level === "medium"))
    out.push({ id: "required_gt_capacity", severity: "soft", title: "目标对风险的要求高于实际承受能力", detail: "想要的收益越高，可能经历的亏损越深；目前的财务条件不一定承受得住。", keys: ["expectedOutcome", "lossImpact", "reserveMonths"] });
  if (t.tolerance.level === "high" && t.capacity.level === "low")
    out.push({ id: "willingness_gt_capacity", severity: "soft", title: "愿意承担的风险高于实际承受能力", detail: "心理上不怕波动，不代表财务上承受得住；研究时会以实际承受能力为边界。", keys: ["drawdownReaction", "lossImpact"] });
  if (!val(f, "lossImpact") && !val(f, "reserveMonths"))
    out.push({ id: "capacity_unknown", severity: "info", title: "实际承受能力还不清楚", detail: "你没有告诉我们可承受的损失和储备情况，涉及风险的结论会更保守，并标注不确定。", keys: ["lossImpact", "reserveMonths"] });
  return out;
}

const LEVEL_WORD: Record<Level, string> = { low: "较低", medium: "中等", high: "较高", unknown: "未知" };

export function buildDimensions(profile: Pick<IdentityProfile, "facts" | "inferences">): Dimension[] {
  const f = profile.facts;
  const t = riskTriad(f);
  const pick = (keys: string[]) => profile.inferences.filter((i) => keys.includes(i.key) && i.status !== "rejected");
  const label = (k: FactKey) => f[k]?.label ?? null;

  const dims: Dimension[] = [
    {
      id: "lifeStage",
      title: "人生阶段",
      summary: [label("ageBand") && `${label("ageBand")}`, label("dependents") && `家人依赖：${label("dependents")}`, label("nearTermExpense")].filter(Boolean).join("；") || "我们还不了解你的人生阶段与家庭责任。",
      level: "unknown",
      evidence: evidence(f, DIM_KEYS.lifeStage),
      unknown: unknownOf(f, DIM_KEYS.lifeStage),
    },
    {
      id: "capacity",
      title: "财务承受能力（客观）",
      summary: `客观承受能力${LEVEL_WORD[t.capacity.level]}。${t.capacity.why}。`,
      level: t.capacity.level,
      evidence: evidence(f, DIM_KEYS.capacity),
      unknown: unknownOf(f, DIM_KEYS.capacity),
    },
    {
      id: "willingness",
      title: "风险意愿（主观）",
      summary: `主观风险意愿${LEVEL_WORD[t.tolerance.level]}。${t.tolerance.why}。这是你愿意承受的程度，不等于你能够承受的程度。`,
      level: t.tolerance.level,
      evidence: evidence(f, DIM_KEYS.willingness, pick(["lossAversion"])),
      unknown: unknownOf(f, DIM_KEYS.willingness),
    },
    {
      id: "knowledge",
      title: "知识与经验",
      summary: label("experience") ? `投资经验：${label("experience")}。我们会据此调整解释的深度。` : "我们还不了解你的投资经验。",
      level: !f.experience ? "unknown" : ["none", "deposit_only"].includes(f.experience.value) ? "low" : f.experience.value === "funds" ? "medium" : "high",
      evidence: evidence(f, DIM_KEYS.knowledge),
      unknown: unknownOf(f, DIM_KEYS.knowledge),
    },
    {
      id: "motivation",
      title: "投资动机",
      summary: [label("motivation") && `起因：${label("motivation")}`, label("expectedOutcome") && `期望：${label("expectedOutcome")}`, f.lifeGoal && `希望财富带来的改变：「${f.lifeGoal.value}」`].filter(Boolean).join("；") || "我们还不了解你投资的出发点。",
      level: t.required.level,
      evidence: evidence(f, DIM_KEYS.motivation),
      unknown: unknownOf(f, DIM_KEYS.motivation),
    },
    {
      id: "behavior",
      title: "决策行为倾向（初步推断）",
      summary: pick(["lossAversion", "chasingImpulse", "patience", "controlNeed", "overconfidence"]).length
        ? `可能的倾向：${pick(["lossAversion", "chasingImpulse", "patience", "controlNeed", "overconfidence"]).map((i) => i.label).join("、")}。这是根据少量回答做的初步推断，不是人格诊断。`
        : label("fomoReaction")
          ? `看到别人大涨时：${label("fomoReaction")}。`
          : "还没有足够信息推断你的决策倾向。",
      level: "unknown",
      evidence: evidence(f, DIM_KEYS.behavior, pick(["lossAversion", "chasingImpulse", "patience", "controlNeed", "overconfidence"])),
      unknown: unknownOf(f, DIM_KEYS.behavior),
    },
    {
      id: "time",
      title: "时间与精力",
      summary: [label("horizon") && `预计${label("horizon")}动用`, label("timeCommitment") && `管理时间：${label("timeCommitment")}`].filter(Boolean).join("；") || "我们还不了解你的投资期限与可投入的时间。",
      level: !f.horizon ? "unknown" : ["lt1y", "1to3y"].includes(f.horizon.value) ? "low" : f.horizon.value === "3to5y" ? "medium" : "high",
      evidence: evidence(f, DIM_KEYS.time),
      unknown: unknownOf(f, DIM_KEYS.time),
    },
  ];
  return dims;
}

/** 已知 / 未知字段统计（用于「我们还不确定的事情」）。 */
export function unknownFacts(profile: Pick<IdentityProfile, "facts">): FactKey[] {
  return FACT_SPECS.map((s) => s.key).filter((k) => !val(profile.facts, k));
}

/**
 * 映射到 InvestLens 原有的 8 个画像字段，使专业研究工作台的个性化与 AI Agent 无需改动即可使用 V2 画像。
 * 只做确定的对应；没有对应信息的字段保持缺失。
 */
export function toLegacyProfile(profile: IdentityProfile, persistLocal: boolean): InvestorProfile {
  const f = profile.facts;
  const v = (k: FactKey) => val(f, k);
  const out: InvestorProfile = {
    id: profile.kind === "demo" ? `demo-${profile.label}` : "user-local",
    kind: profile.kind === "demo" ? "demo" : "user",
    label: profile.kind === "demo" ? profile.label.slice(0, 40) : "我的画像",
    skipped: [],
    status: "confirmed",
    confirmedAt: profile.confirmedAt,
    consent: { persistLocal, updatedAt: profile.confirmedAt },
  };
  const exp = v("nearTermExpense");
  const share = v("nearTermExpenseShare");
  const motivation = v("motivation");
  if (exp && exp !== "none" && (share === "most" || share === "partial")) out.goal = "major_purchase";
  else if (motivation === "retirement") out.goal = "retirement";
  else if (motivation === "curiosity") out.goal = "learning";
  else if (motivation) out.goal = "wealth_growth";
  const h = v("horizon");
  if (h) out.horizon = h as InvestorProfile["horizon"];
  const e = v("experience");
  if (e) out.experience = e === "none" || e === "deposit_only" ? "novice" : e === "funds" ? "some" : e === "stocks" ? "experienced" : "professional";
  const r = v("drawdownReaction");
  if (r) out.riskWillingness = ({ sell_all: "conservative", sell_some: "cautious", hold: "balanced", buy_some: "growth", buy_more: "aggressive" } as const)[r as "hold"];
  const l = v("lossImpact");
  if (l) out.lossCapacity = l as InvestorProfile["lossCapacity"];
  if (exp) out.liquidityNeed = exp === "none" || share === "none" ? "none" : share === "most" || (exp === "within1y" && share !== "small") ? "most" : "some";
  const rs = v("reserveMonths");
  if (rs) out.emergencyReserve = rs === "lt3" ? "no" : rs === "3to6" ? "partial" : "yes";
  const s = v("incomeStability");
  if (s) out.incomeStability = s === "none" ? "variable" : (s as InvestorProfile["incomeStability"]);
  else if (f.incomeStability?.value === "prefer_not") out.incomeStability = "prefer_not";
  return out;
}

export function factList(facts: IdentityProfile["facts"]): Fact[] {
  return FACT_SPECS.map((s) => facts[s.key]).filter((x): x is Fact => !!x);
}
