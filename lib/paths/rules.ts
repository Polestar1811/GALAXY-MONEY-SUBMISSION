import type { IdentityProfile, MoneyPath, PathId } from "@/types/identity";
import { constraintsOf, riskTriad } from "@/lib/identity/dimensions";

/**
 * 研究路径的规则层（确定性）：决定三条路径的顺序、状态与前提条件。
 * 大模型只负责写「为什么与你有关」等解释，不能改变这里的排序、状态和前提（见 synthesis.ts）。
 * 关键硬约束：近期必须用钱、应急储备不足、负债压力大时，增长路径一律标为「需先满足前提」，
 * 不因用户的高风险偏好而放开。
 */
export const PATH_BASE: Record<PathId, { title: string; tagline: string; focus: string }> = {
  A: { title: "优先保障资金安全与可用性", tagline: "研究现金管理、近期资金需要与低波动资产", focus: "资金安全、流动性、近期必要支出、应急储备" },
  B: { title: "平衡稳定与长期增长", tagline: "研究不同资产组合在历史上的收益与回撤", focus: "股债等资产搭配、回撤与收益的取舍、再平衡" },
  C: { title: "探索长期财富增长", tagline: "研究宽基指数与长期权益市场及其风险", focus: "长期权益资产、宽基 ETF、长期持有的波动与纪律" },
};

export interface PathPlan {
  order: PathId[];
  status: Record<PathId, MoneyPath["status"]>;
  gate: Record<PathId, string | null>;
  orderReason: string;
}

export function planPaths(profile: Pick<IdentityProfile, "facts">): PathPlan {
  const cons = constraintsOf(profile.facts);
  const hard = cons.filter((c) => c.severity === "hard");
  const t = riskTriad(profile.facts);
  const horizon = profile.facts.horizon?.value;
  const longHorizon = horizon === "5to10y" || horizon === "gt10y";

  if (hard.length) {
    const titles = hard.map((c) => c.title).join("、");
    return {
      order: ["A", "B", "C"],
      status: { A: "priority", B: "available", C: "conditional" },
      gate: { A: null, B: hard.some((c) => c.id === "no_reserve") ? "建议在应急储备充足之后再研究" : null, C: `需要先解决：${titles}` },
      orderReason: `你目前有硬性约束（${titles}），所以先研究如何保障资金安全；增长类方向在这些约束解决之前只作为了解，不作为优先方向。`,
    };
  }
  if (t.capacity.level === "unknown") {
    return {
      order: ["B", "A", "C"],
      status: { A: "available", B: "priority", C: "conditional" },
      gate: { A: null, B: null, C: "需要先弄清楚你实际能承受多少损失" },
      orderReason: "我们还不清楚你实际能承受多少损失，所以先从平衡类方向开始研究，增长类方向需要先补充这项信息。",
    };
  }
  if (t.capacity.level === "high" && longHorizon && t.tolerance.level !== "low") {
    return {
      order: ["C", "B", "A"],
      status: { A: "available", B: "available", C: "priority" },
      gate: { A: null, B: null, C: null },
      orderReason: "你的期限较长、应急储备与可承受损失相对充足，长期增长值得优先研究；平衡与现金管理仍是理解风险的重要参照。",
    };
  }
  return {
    order: ["B", "A", "C"],
    status: { A: "available", B: "priority", C: t.capacity.level === "low" ? "conditional" : "available" },
    gate: { A: null, B: null, C: t.capacity.level === "low" ? "你的实际承受能力较低，高波动方向需谨慎了解" : null },
    orderReason: "你的情况适合先研究稳定与增长之间的平衡，再根据自己的承受能力决定是否进一步了解增长类方向。",
  };
}

/** 规则兜底的路径内容（大模型不可用时使用）。 */
export function rulesPaths(profile: Pick<IdentityProfile, "facts">): MoneyPath[] {
  const plan = planPaths(profile);
  const f = profile.facts;
  const near = f.nearTermExpense && f.nearTermExpense.value !== "none" ? `你提到${f.nearTermExpense.label}` : null;
  const horizon = f.horizon ? `你预计${f.horizon.label}动用这笔钱` : null;
  const base: Record<PathId, Omit<MoneyPath, "id" | "status" | "gate">> = {
    A: {
      ...PATH_BASE.A,
      why: [near, f.reserveMonths && `储备可支撑${f.reserveMonths.label}`].filter(Boolean).join("，") + (near || f.reserveMonths ? "。" : "") + "近期要用的钱首先需要的是确定性，而不是更高的收益。",
      helps: "确保近期必要支出和应急资金不受市场波动影响，让其余资金可以更从容地做长期安排。",
      risks: ["收益通常较低，长期可能跑不赢通胀", "现金管理工具也有少量波动或流动性限制"],
      costs: ["放弃了这部分资金的长期增长机会"],
      changes: ["近期支出完成或推迟", "应急储备已经充足"],
      explore: ["近期必须使用的钱有多少、什么时候用？", "现金管理类工具的收益与取用规则有什么不同？"],
    },
    B: {
      ...PATH_BASE.B,
      why: (horizon ? `${horizon}，` : "") + "平衡类组合同时考虑稳定和增长，可以帮助你看清收益与回撤之间的取舍。",
      helps: "用历史数据比较不同股债搭配的收益与最大回撤，找到自己真正能接受的波动范围。",
      risks: ["历史表现不代表未来", "股票与债券可能同时下跌"],
      costs: ["需要定期检查与再平衡", "收益不会像单一高风险资产那样高"],
      changes: ["投资期限明显缩短或延长", "可承受损失发生变化"],
      explore: ["不同股债比例在历史上的最大回撤是多少？", "多久再平衡一次比较合理？"],
    },
    C: {
      ...PATH_BASE.C,
      why: (horizon ? `${horizon}。` : "") + "长期权益资产在历史上提供过较高的长期回报，但过程中的波动和回撤也更大。",
      helps: "理解宽基指数等长期资产的增长来源，以及坚持长期持有需要承受什么。",
      risks: ["可能出现 30% 以上的阶段性下跌", "回撤后恢复可能需要数年"],
      costs: ["需要较长的时间和稳定的心态", "短期内可能看到较大的账面亏损"],
      changes: ["近期出现必须用钱的计划", "可承受损失下降"],
      explore: ["宽基指数历史上最长的回撤恢复期有多长？", "如果遇到 30% 的下跌，我的生活会受影响吗？"],
    },
  };
  return plan.order.map((id) => ({ id, ...base[id], status: plan.status[id], gate: plan.gate[id] }));
}
