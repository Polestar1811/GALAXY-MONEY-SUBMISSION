import type { FinancialsSnapshot, MarketFact } from "@/types/market";
import type {
  BriefResult,
  DataSourceInfo,
  Inference,
  PersonalizedBriefItem,
  PersonalizedModule,
  PersonalizedQuestion,
  PersonalizedRisk,
  ResearchEngineInfo,
  ResearchRequest,
  ResearchResult,
  ResearchTask,
} from "@/types/research";
import { BRIEF_ITEMS, INFERENCE_RULES, MODULES, OPEN_QUESTIONS, RISKS } from "@/lib/demo-data/research-content";
import { getDemoEvidence } from "@/lib/demo-data/etf-510300";
import { deriveSignals } from "@/lib/personalization/signals";
import {
  appliedRules,
  buildContext,
  buildFocus,
  factFingerprint,
  fillTemplate,
  pickLensNote,
  rankItems,
  scoreTags,
  type RuleContext,
} from "@/lib/personalization/engine";
import type { MarketDataProvider } from "@/lib/providers/types";
import type { ResearchService } from "./types";

export const DEMO_ENGINE = {
  engine: "demo-rules",
  version: "2.0.0",
  isLLM: false,
  label: "演示逻辑 · 确定性规则，未调用大模型",
} as const;

export const RULE_ENGINE_LIVE: ResearchEngineInfo = {
  engine: "demo-rules",
  version: "2.0.0",
  isLLM: false,
  label: "确定性个性化规则 · 未调用大模型",
};

export const DISCLAIMERS = [
  "本页所有行情、指标与结论均为合成演示数据，非实时、非真实历史，不代表沪深300ETF 的实际表现。",
  "InvestLens 只提供研究辅助，不构成投资建议，不提供买卖指令、收益承诺或自动交易。",
  "个性化只改变研究顺序、风险强调与解释方式，不会改变任何事实数据。",
];

export const LIVE_DISCLAIMERS = [
  "行情来自同花顺扶摇金融数据（前复权日线 + 最近一次有效快照），非逐笔实时；标注「未知」的字段当前未接入，不代表为 0。",
  "InvestLens 只提供研究辅助，不构成投资建议，不提供买卖指令、收益承诺或自动交易。",
  "个性化只改变研究顺序、个人相关度与解释方式；客观指标与风险的客观严重程度对所有人相同。",
];

export function dataSourceInfo(fin: FinancialsSnapshot): DataSourceInfo {
  const times = fin.facts.map((f) => f.asOf).filter((x): x is string => !!x).sort();
  return {
    mode: fin.isDemo ? "demo" : "fuyao",
    label: fin.isDemo ? "合成演示数据 · 非实时" : "同花顺扶摇 · 真实行情",
    isDemo: fin.isDemo,
    asOf: times.length ? times[times.length - 1] : null,
    degraded: fin.degraded ?? [],
  };
}

/** 依据事实取值生成的确定性推断；依据字段未知时不输出。 */
export function buildInferences(byId: Map<string, MarketFact>, fill: (t: string) => string): Inference[] {
  return INFERENCE_RULES.filter((r) => r.basis.every((id) => byId.get(id)?.value !== null && byId.get(id)?.value !== undefined) && r.when(byId)).map(
    ({ when: _w, ...r }) => ({ ...r, statement: fill(r.statement) }),
  );
}

/** 个性化排序：所有画像共用同一份事实（fin），只改变顺序、相关度与解释。 */
export function personalize(fin: FinancialsSnapshot, req: Pick<ResearchRequest, "profile">) {
  const facts = fin.facts;
  const byId = new Map<string, MarketFact>(facts.map((f) => [f.id, f]));
  const signals = deriveSignals(req.profile);
  const ctx: RuleContext = buildContext(req.profile, signals);
  const fill = (t: string) => fillTemplate(t, byId, req.profile);

  const modules: PersonalizedModule[] = rankItems(MODULES, ctx).map(({ item, rank, score, reasons }) => {
    const { lensNotes, ...rest } = item;
    return { ...rest, summary: fill(item.summary), bullets: item.bullets.map(fill), rank, score, reasons, lensNote: fill(pickLensNote(lensNotes, ctx)), depth: signals.depth };
  });

  const risks: PersonalizedRisk[] = RISKS.map((r, index) => {
    const { boost, reasons } = scoreTags(r.tags, ctx);
    const shift = boost >= 8 ? 1 : boost <= -4 ? -1 : 0;
    const severity = Math.min(3, Math.max(1, r.baseSeverity + shift)) as 1 | 2 | 3;
    const objectiveFromFacts = r.objective?.(byId) ?? null;
    const { lensNotes, objective: _o, ...rest } = r;
    return {
      ...rest,
      summary: fill(r.summary),
      detail: fill(r.detail),
      objectiveSeverity: objectiveFromFacts ?? r.baseSeverity,
      objectiveBasis: objectiveFromFacts !== null ? `依据：${r.factIds.map((id) => byId.get(id)?.label).filter(Boolean).join("、")}` : "依据数据缺失，使用默认等级",
      severity,
      emphasized: boost >= 3,
      rank: 0,
      reasons,
      lensNote: fill(pickLensNote(lensNotes, ctx)),
      _score: r.baseSeverity * 3 + boost,
      _index: index,
    };
  })
    .sort((a, b) => b._score - a._score || a._index - b._index)
    .map(({ _score, _index, ...r }, i) => ({ ...r, rank: i + 1 }));

  const openQuestions: PersonalizedQuestion[] = rankItems(
    OPEN_QUESTIONS.map((q) => ({ ...q, basePriority: q.needsPhase2 ? 1 : 2 })),
    ctx,
  ).map(({ item, rank, reasons }) => {
    const { basePriority: _bp, ...q } = item;
    return { ...q, rank, reasons };
  });

  return { facts, byId, signals, ctx, fill, modules, risks, openQuestions };
}

/**
 * 规则研究服务：适用于任何 MarketDataProvider（演示或扶摇）。
 * 第二迭代中它作为 AI 研究 Agent 的「Personalize」阶段，以及无需大模型时的即时研究视图。
 */
export class DemoResearchService implements ResearchService {
  readonly engine: ResearchEngineInfo;

  constructor(private provider: MarketDataProvider) {
    this.engine = provider.info.isDemo ? DEMO_ENGINE : RULE_ENGINE_LIVE;
  }

  async research(req: ResearchRequest): Promise<ResearchResult> {
    const fin = await this.provider.getFinancials(req.symbol);
    return this.fromFinancials(fin, req);
  }

  fromFinancials(fin: FinancialsSnapshot, req: Pick<ResearchRequest, "symbol" | "question" | "profile">): ResearchResult {
    const p = personalize(fin, req);
    const evidence = fin.evidence ?? getDemoEvidence();
    const live = !fin.isDemo;
    const known = p.facts.filter((f) => f.value !== null).length;

    const tasks: ResearchTask[] = [
      { id: "t1", tool: "market.snapshot", label: "读取资产快照", status: "done", detail: `${this.provider.info.label} · getSnapshot(${req.symbol})`, isDemo: !live },
      { id: "t2", tool: "market.financials", label: "读取指标与构成", status: "done", detail: `${p.facts.length} 项事实，其中 ${known} 项有值`, isDemo: !live },
      { id: "t3", tool: "evidence.bind", label: "绑定证据与限制说明", status: "done", detail: `${evidence.length} 条证据${fin.degraded?.length ? `，${fin.degraded.length} 项可选能力降级` : ""}`, isDemo: !live },
      {
        id: "t4",
        tool: "personalization.rank",
        label: "按画像排序研究重点",
        status: req.profile ? "done" : "skipped",
        detail: req.profile ? `命中 ${p.ctx.active.length} 条规则 · 仅调整顺序与解释` : "未选择画像，使用通用顺序",
        isDemo: false,
      },
    ];

    return {
      symbol: req.symbol,
      question: req.question,
      engine: this.engine,
      dataSource: dataSourceInfo(fin),
      news: fin.news ?? [],
      tasks,
      facts: p.facts,
      evidence,
      inferences: buildInferences(p.byId, p.fill),
      modules: p.modules,
      risks: p.risks,
      openQuestions: p.openQuestions,
      focus: buildFocus(p.ctx, p.modules.map((m) => m.kicker)),
      signals: p.signals,
      appliedRules: appliedRules(p.ctx),
      disclaimers: live ? LIVE_DISCLAIMERS : DISCLAIMERS,
      factFingerprint: factFingerprint(p.facts),
    };
  }

  async brief(req: Omit<ResearchRequest, "question">): Promise<BriefResult> {
    const fin = await this.provider.getFinancials(req.symbol);
    const byId = new Map<string, MarketFact>(fin.facts.map((f) => [f.id, f]));
    const signals = deriveSignals(req.profile);
    const ctx = buildContext(req.profile, signals);
    const fill = (t: string) => fillTemplate(t, byId, req.profile);

    const items: PersonalizedBriefItem[] = rankItems(BRIEF_ITEMS, ctx).map(({ item, rank, reasons }) => {
      const { lensNotes, ...rest } = item;
      return { ...rest, title: fill(item.title), body: fill(item.body), rank, reasons, lensNote: fill(pickLensNote(lensNotes, ctx)) };
    });

    return {
      symbol: req.symbol,
      dataSource: dataSourceInfo(fin),
      items,
      facts: fin.facts,
      engine: this.engine,
      factFingerprint: factFingerprint(fin.facts),
      signals,
    };
  }
}
