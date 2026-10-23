import type { InvestorProfile, ProfileFieldKey, ProfileSignals } from "@/types/profile";
import type { MarketFact } from "@/types/market";
import type { AppliedRule, PersonalizationReason, ResearchFocus, ResearchTag } from "@/types/research";
import { formatFact } from "@/lib/format";
import { optionLabel } from "@/lib/profile/fields";
import type { LensKey } from "@/lib/demo-data/research-content";
import { RULES, lensOrder, type PersonalizationRule } from "./rules";

export interface RuleContext {
  profile: InvestorProfile | null;
  signals: ProfileSignals;
  active: PersonalizationRule[];
  lenses: LensKey[];
}

export function buildContext(profile: InvestorProfile | null, signals: ProfileSignals): RuleContext {
  const active = profile ? RULES.filter((r) => r.when(signals, profile)) : [];
  return { profile, signals, active, lenses: lensOrder(signals) };
}

export function appliedRules(ctx: RuleContext): AppliedRule[] {
  if (!ctx.profile) return [];
  const p = ctx.profile;
  return ctx.active.map((r) => ({ ruleId: r.id, ruleName: r.name, trigger: r.trigger(p), effect: r.effect, field: r.field }));
}

/** 计算某个条目在当前规则下的加权与原因。 */
export function scoreTags(tags: ResearchTag[], ctx: RuleContext): { boost: number; reasons: PersonalizationReason[] } {
  let boost = 0;
  const reasons: PersonalizationReason[] = [];
  if (!ctx.profile) return { boost, reasons };
  for (const r of ctx.active) {
    let w = 0;
    for (const t of tags) w += r.boosts[t] ?? 0;
    if (w !== 0) {
      boost += w;
      reasons.push({
        ruleId: r.id,
        ruleName: r.name,
        field: r.field,
        trigger: r.trigger(ctx.profile),
        effect: r.effect,
        weight: w,
      });
    }
  }
  reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return { boost, reasons };
}

/** 稳定排序：分数高者在前，同分按基础优先级、再按原始顺序。 */
export function rankItems<T extends { tags: ResearchTag[]; basePriority: number }>(items: T[], ctx: RuleContext) {
  return items
    .map((item, index) => {
      const { boost, reasons } = scoreTags(item.tags, ctx);
      return { item, index, score: item.basePriority + boost, boost, reasons };
    })
    .sort((a, b) => b.score - a.score || b.item.basePriority - a.item.basePriority || a.index - b.index)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

export function pickLensNote(notes: Partial<Record<LensKey, string>> & { default: string }, ctx: RuleContext): string {
  if (!ctx.profile) return notes.default;
  for (const k of ctx.lenses) {
    const n = notes[k];
    if (n) return n;
  }
  return notes.default;
}

/** 模板填充：{f-id} → 事实值；{p:field} → 用户画像中的选项文字。 */
export function fillTemplate(text: string, facts: Map<string, MarketFact>, profile: InvestorProfile | null): string {
  return text
    .replace(/\{label:(f-[a-z0-9-]+)\}/g, (_, id: string) => facts.get(id)?.label ?? "该指标")
    .replace(/\{(f-[a-z0-9-]+)\}/g, (_, id: string) => {
      const f = facts.get(id);
      return f ? formatFact(f) : "未知";
    })
    .replace(/\{p:([a-zA-Z]+)\}/g, (_, key: string) => {
      if (!profile) return "未回答";
      return optionLabel(key as ProfileFieldKey, profile[key as ProfileFieldKey]) ?? "未回答";
    });
}

export function buildFocus(ctx: RuleContext, orderedKickers: string[]): ResearchFocus {
  const s = ctx.signals;
  const sequence = orderedKickers.slice(0, 4);
  if (!ctx.profile) {
    return {
      headline: "通用视角：先看风险结构，再看估值与成本",
      summary: "尚未选择画像，研究内容按默认顺序展示。建立画像后，InvestLens 会根据你的目标与约束调整研究重点。",
      sequence,
    };
  }
  if (s.liquidityPressure === "high") {
    return {
      headline: "先确认：近期要用的钱，能否避免在回撤中被迫卖出",
      summary: "你的画像显示近期资金需要较高、缺少独立储备。对你而言，研究的第一问不是「它会不会涨」，而是「用钱时如果正在下跌怎么办」。",
      sequence,
    };
  }
  if (s.horizon === "long") {
    return {
      headline: "以十年为尺度：关注估值区间、持有成本与持有纪律",
      summary: "你的画像显示期限较长、应急资金独立。短期回撤对你的用款影响较小，长期回报区间更取决于入场估值、费用复利和能否坚持计划。",
      sequence,
    };
  }
  if (s.capacity === "low") {
    return {
      headline: "先明确边界：你能承受的亏损低于这类资产的历史回撤",
      summary: "研究重点放在回撤幅度与暴露比例的匹配，而不是收益空间。",
      sequence,
    };
  }
  return {
    headline: "平衡视角：同时关注回撤承受与长期变量",
    summary: "你的画像没有极端约束，研究按风险、估值、成本的顺序展开。",
    sequence,
  };
}

/** FNV-1a 32 位哈希：对事实层做稳定指纹，直观证明 A/B 切换时事实不变。 */
export function factFingerprint(facts: MarketFact[]): string {
  const canonical = JSON.stringify(
    facts.map((f) => [f.id, f.symbol, f.metric, f.value, f.unit, f.asOf, f.status, f.source.id, f.isDemo]),
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
}
