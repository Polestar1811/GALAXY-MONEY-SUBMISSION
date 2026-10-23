import type { Evidence } from "@/types/evidence";
import type { MarketFact } from "@/types/market";
import type { PersonalizedRisk } from "@/types/research";
import type { AIAnswer, AnswerFinding, AnswerRisk, RawAnswer, Verification } from "./schema";

/**
 * 输出护栏：所有模型输出在返回给用户前都要经过这里。
 * 1. 合规：删除买卖指令、收益承诺、确定性涨跌 / 概率表述、目标价。
 * 2. 证据：引用的 Evidence ID 必须存在；事实类结论没有有效证据时降级为「未验证」。
 * 3. 数字：结论中的数值必须能在事实层（或用户问题 / 画像）中找到，否则标记为未验证。
 * 4. 完整性：客观严重程度 ≥ 2 的风险若被模型遗漏，用规则风险补回（不因用户乐观而省略负面信息）。
 */

export const COMPLIANCE_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "trade-advice", re: /(建议|推荐|应该|应当|最好|不妨|可以考虑)[^。！？!?；;\n]{0,6}(买入|卖出|加仓|减仓|清仓|抄底|止损|满仓|全仓|梭哈|建仓|离场)/ },
  { id: "trade-imperative", re: /(立即|马上|赶紧|尽快|现在就)[^。！？!?；;\n]{0,4}(买|卖|入场|离场|加仓|减仓)/ },
  { id: "guarantee", re: /(稳赚|保本|保证收益|收益保证|保证盈利|无风险|零风险|稳赚不赔|只涨不跌)/ },
  { id: "certainty", re: /(必然|一定会|肯定会|必将)[^。！？!?；;\n]{0,4}(上涨|下跌|涨|跌|反弹|回升)|必涨|必跌/ },
  { id: "probability", re: /(上涨|下跌|涨|跌|盈利|亏损)的?(概率|可能性)(为|是|达|约|高达)?\s*\d|\d+(\.\d+)?\s*%\s*的?(概率|可能性)/ },
  // 给出了目标价（数字，或「为 / 是 / 在 / 看 / 上调 / 下调 / 定在」等赋值表述）才算违规；只提到「目标价」一词不算
  {
    id: "price-target",
    re: /目标(价|位)[^。！？!?；;\n]{0,8}\d|目标(价|位)\s*(为|是|在|看|上看|指向|上调|下调|调至|定在|约|大约|有望)|看到\s*\d+(\.\d+)?\s*元/,
  },
];

/**
 * 拒绝 / 免责表述：说明「本工具不提供某类内容」，而不是给出该内容。
 * 只收录针对工具自身能力与范围的否定；「不建议买入」「不宜加仓」等仍是投资建议，不在此列。
 */
const REFUSAL_SRC =
  "(不|无法|不能|不会|不予|难以|没法)(提供|给出|给|做出|作出|预测|判断|保证|承诺|回答|估计|确定)" +
  "|不(做|作)(任何)?(预测|判断|推荐|建议|承诺)" +
  "|(不在|超出)[^，,。]{0,12}(范围|能力|边界)" +
  "|不构成|拒绝" +
  "|(未|没有)(提供|覆盖|接入|包含)" +
  "|(并非|不是)(投资|买卖|交易)?(建议|推荐|预测|承诺)";
const REFUSAL = new RegExp(REFUSAL_SRC);
/** 引号中的内容多为复述用户的请求；含数字的引文可能是实际给出的点位或概率，不做豁免。 */
const QUOTED = /[「『“"][^」』”"]{0,80}[」』”"]/g;
/** 子句边界：逗号、冒号与转折 / 结论连词。转折后的内容独立判断，避免「不能保证，但建议买入」被整体豁免。 */
const CLAUSE = /[，,：:]|但是|但|不过|然而|所以|因此|因而|而是/;
/** 交易指令只有紧跟在拒绝表述之后（如「不提供立即买入…」）才视为被否定；其余类别允许稍远的否定与后置否定（「目标价不在…范围内」）。 */
const DIRECTIVES = new Set(["trade-advice", "trade-imperative"]);

function inRefusalScope(clause: string, m: RegExpMatchArray, id: string): boolean {
  const start = m.index ?? 0;
  const end = start + m[0].length;
  const directive = DIRECTIVES.has(id);
  for (const r of clause.matchAll(new RegExp(REFUSAL_SRC, "g"))) {
    const rStart = r.index ?? 0;
    const rEnd = rStart + r[0].length;
    if (rStart <= start && start - rEnd <= (directive ? 2 : 6)) return true;
    if (!directive && rStart >= end && rStart - end <= 6) return true;
  }
  return false;
}

/** 返回句子中第一个不在拒绝语境内的违规规则；没有则返回 null。 */
function violation(sentence: string): string | null {
  const hits = COMPLIANCE_PATTERNS.filter((c) => c.re.test(sentence));
  if (!hits.length) return null;
  // 没有任何拒绝表述：保持原有行为，命中即删除
  if (!REFUSAL.test(sentence)) return hits[0].id;
  const neutral = sentence.replace(QUOTED, (q) => (/\d/.test(q) ? q : "「」"));
  for (const clause of neutral.split(CLAUSE)) {
    for (const c of COMPLIANCE_PATTERNS) {
      for (const m of clause.matchAll(new RegExp(c.re.source, "g"))) {
        if (!inRefusalScope(clause, m, c.id)) return c.id;
      }
    }
  }
  return null;
}

/**
 * 按句删除违规表述，返回清洗后的文本与命中的规则。
 * 违规词出现在拒绝语境中（「无法给出目标价」「目标价不在本工具的范围内」）时保留整句：
 * 拒绝理由本身是用户需要看到的解释；同句中任何不在拒绝语境内的违规表述仍会导致整句删除。
 */
export function enforceCompliance(text: string): { text: string; removed: string[] } {
  const parts = text.split(/(?<=[。！？!?；;\n])/);
  const removed: string[] = [];
  const kept = parts.filter((p) => {
    const hit = violation(p);
    if (hit) removed.push(`${hit}: ${p.trim().slice(0, 60)}`);
    return !hit;
  });
  return { text: kept.join("").trim(), removed };
}

/** 从文本中提取需要核验的数值（带小数或百分号的数字、或 ≥ 100 的数字）。 */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  // 日期与时刻不是行情数值（真实验收中模型会引用「2026-10-22 收盘」），先剔除，避免误判
  const withoutDates = text
    .replace(/(?:19|20)\d{2}\s*[-/.年]\s*\d{1,2}(?:\s*[-/.月]\s*\d{1,2}\s*日?)?/g, " ")
    .replace(/(?:19|20)\d{2}\s*年/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ");
  // 支持千分位（如 1,264.0），否则会被拆成 1 与 264.0 并误判为未核验数值
  for (const m of withoutDates.matchAll(/[-−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*%?|[-−]?\d+(?:\.\d+)?\s*%?/g)) {
    const raw = m[0].replace(/\s+/g, "").replace(/,/g, "");
    const n = Number(raw.replace("%", "").replace("−", "-"));
    if (Number.isNaN(n)) continue;
    if (raw.includes(".") || raw.includes("%") || Math.abs(n) >= 100) out.push(raw);
  }
  return out;
}

export function buildNumberWhitelist(facts: MarketFact[], extraTexts: string[]): number[] {
  const nums: number[] = [];
  for (const f of facts) if (typeof f.value === "number") nums.push(f.value, Math.abs(f.value));
  for (const t of extraTexts) for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) nums.push(Number(m[0]));
  return nums;
}

export function numberIsKnown(raw: string, whitelist: number[]): boolean {
  const n = Math.abs(Number(raw.replace("%", "").replace("−", "-")));
  return whitelist.some((w) => {
    const a = Math.abs(w);
    // 允许常见的四舍五入：绝对误差 0.06，或相对误差 1%
    return Math.abs(a - n) <= 0.06 || (a > 0 && Math.abs(a - n) / a <= 0.01);
  });
}

export interface GuardContext {
  facts: MarketFact[];
  evidence: Evidence[];
  ruleRisks: PersonalizedRisk[];
  numberWhitelist: number[];
}

export function verifyAnswer(raw: RawAnswer, ctx: GuardContext): { answer: AIAnswer; verification: Verification } {
  const evidenceIds = new Set(ctx.evidence.map((e) => e.id));
  const invalid = new Set<string>();
  const unverifiedNumbers = new Set<string>();
  const complianceRemoved: string[] = [];

  const clean = (text: string) => {
    const r = enforceCompliance(text);
    complianceRemoved.push(...r.removed);
    return r.text;
  };
  const checkIds = (ids: string[]) => {
    const ok = ids.filter((id) => evidenceIds.has(id));
    ids.filter((id) => !evidenceIds.has(id)).forEach((id) => invalid.add(id));
    return { ok: Array.from(new Set(ok)), bad: ids.filter((id) => !evidenceIds.has(id)) };
  };
  const checkNumbers = (text: string) => {
    const bad = extractNumbers(text).filter((n) => !numberIsKnown(n, ctx.numberWhitelist));
    bad.forEach((n) => unverifiedNumbers.add(n));
    return bad;
  };

  const findings: AnswerFinding[] = [];
  raw.findings.forEach((f, i) => {
    const statement = clean(f.statement);
    if (!statement) return;
    const ids = checkIds(f.evidenceIds);
    const badNums = checkNumbers(statement);
    const issues: string[] = [];
    if (ids.bad.length) issues.push(`已移除无效证据引用：${ids.bad.join("、")}`);
    if (badNums.length) issues.push(`数值无法在事实层核验：${badNums.join("、")}`);
    let kind: AnswerFinding["kind"] = f.kind;
    if (f.kind === "fact" && ids.ok.length === 0) {
      kind = "unverified";
      issues.push("事实类结论缺少有效证据");
    }
    if (badNums.length) kind = "unverified";
    findings.push({ id: `F${i + 1}`, kind, statement, evidenceIds: ids.ok, issues });
  });

  const ruleById = new Map(ctx.ruleRisks.map((r) => [r.id, r]));
  const risks: AnswerRisk[] = [];
  for (const r of raw.risks) {
    const rule = ruleById.get(r.riskId);
    if (!rule || risks.some((x) => x.riskId === r.riskId)) continue; // 模型不能发明风险类别
    const explanation = clean(r.explanation);
    if (!explanation) continue;
    const ids = checkIds(r.evidenceIds);
    const badNums = checkNumbers(explanation);
    const issues: string[] = [];
    if (ids.bad.length) issues.push(`已移除无效证据引用：${ids.bad.join("、")}`);
    if (badNums.length) issues.push(`数值无法在事实层核验：${badNums.join("、")}`);
    risks.push({
      riskId: rule.id,
      title: rule.title,
      explanation,
      evidenceIds: ids.ok,
      objectiveSeverity: rule.objectiveSeverity,
      personalRelevance: rule.severity,
      source: "llm",
      issues,
    });
  }

  // 不得遗漏客观严重程度较高的风险
  const restoredRisks: string[] = [];
  for (const rule of ctx.ruleRisks) {
    if (rule.objectiveSeverity >= 2 && !risks.some((x) => x.riskId === rule.id)) {
      restoredRisks.push(rule.id);
      risks.push({
        riskId: rule.id,
        title: rule.title,
        explanation: `${rule.summary}（模型未解读此风险，已按规则补回）`,
        evidenceIds: [],
        objectiveSeverity: rule.objectiveSeverity,
        personalRelevance: rule.severity,
        source: "rules",
        issues: [],
      });
    }
  }
  // 按规则引擎的个人相关度排序（模型不能改变优先级）
  const order = new Map(ctx.ruleRisks.map((r) => [r.id, r.rank]));
  risks.sort((a, b) => (order.get(a.riskId) ?? 99) - (order.get(b.riskId) ?? 99));

  const summary = clean(raw.summary);
  checkNumbers(summary);

  const answer: AIAnswer = {
    summary: summary || "（模型摘要因合规校验被移除，请参考下方经过核验的结论。）",
    findings,
    risks,
    uncertainties: raw.uncertainties.map(clean).filter(Boolean),
    informationGaps: raw.informationGaps.map(clean).filter(Boolean),
    followUps: raw.followUps.map(clean).filter(Boolean).slice(0, 3),
  };

  return {
    answer,
    verification: {
      invalidEvidenceIds: Array.from(invalid),
      unverifiedNumbers: Array.from(unverifiedNumbers),
      complianceRemoved,
      restoredRisks,
      passed: invalid.size === 0 && unverifiedNumbers.size === 0 && complianceRemoved.length === 0,
    },
  };
}
