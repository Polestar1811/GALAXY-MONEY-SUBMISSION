"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpenCheck,
  Calculator,
  CandlestickChart,
  CircleHelp,
  Columns2,
  FileStack,
  Gauge,
  ListChecks,
  ListOrdered,
  ShieldAlert,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LensId } from "@/types/profile";
import type { ResearchResult, SimulateMode } from "@/types/research";
import { useProfile } from "@/lib/profile/store";
import { PERSONAS } from "@/lib/profile/personas";
import { useResearch, useSnapshot } from "@/lib/client/hooks";
import { parseSimulate } from "@/lib/providers/types";
import { formatNumber, formatSigned } from "@/lib/format";
import { LensSegmented } from "@/components/layout/LensSwitcher";
import { Badge, SourceBadge } from "@/components/ui/badge";
import { AgentPanel } from "./AgentPanel";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/primitives";
import { PanelSkeleton, RetryButton, StateView } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { EvidencePanel } from "./EvidencePanel";
import { FactTile } from "./FactTile";
import { FocusCard } from "./FocusCard";
import { ModuleList } from "./ModuleList";
import { PriceChart } from "./PriceChart";
import { QuestionList, RiskPanel } from "./RiskPanel";
import { ScenarioSimulator, scenarioDefaults } from "./ScenarioSimulator";
import { DiffBanner, WhyPanel, diffResults } from "./WhyPanel";
import { SimpleSummary } from "./SimpleSummary";
import { Segmented } from "@/components/ui/segmented";

function lensName(l: LensId | null, hasSelf: boolean) {
  if (l === "A") return "画像 A";
  if (l === "B") return "画像 B";
  if (l === "self" && hasSelf) return "我的画像";
  return "通用视角";
}

export function ResearchWorkspace({ symbol }: { symbol: string }) {
  const sp = useSearchParams();
  const simulate: SimulateMode = parseSimulate(sp.get("simulate"));
  const { lens, setLens, activeProfile, hydrated } = useProfile();

  // ?lens=A|B 用于演示入口直达
  useEffect(() => {
    const l = sp.get("lens");
    if (hydrated && (l === "A" || l === "B")) setLens(l);
  }, [hydrated, sp, setLens]);

  const snap = useSnapshot(symbol, simulate);
  const research = useResearch(symbol, activeProfile, simulate);
  // 对照画像：A ↔ B；我的画像/通用 → 对照 B
  const counterpartLens: "A" | "B" = lens === "B" ? "A" : "B";
  const counterpart = useResearch(symbol, activeProfile ? PERSONAS[counterpartLens] : null, simulate);
  const counterpartLabel = activeProfile ? `画像 ${counterpartLens}` : "通用视角";

  const [evidenceFocus, setEvidenceFocus] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  // 简明模式（面向普通用户，从 Galaxy Money 主流程进入时默认）与专业模式（完整研究终端，直接访问时默认）
  const [mode, setModeState] = useState<"simple" | "pro">(() => (sp.get("mode") === "simple" ? "simple" : "pro"));
  useEffect(() => {
    const m = sp.get("mode");
    if (m === "simple" || m === "pro") setModeState(m);
  }, [sp]);
  const simple = mode === "simple";

  const r = research.data;
  const facts = useMemo(() => new Map((r?.facts ?? []).map((f) => [f.id, f])), [r]);
  const cp = counterpart.data && r && counterpart.data !== r && activeProfile ? counterpart.data : null;
  const diff = useMemo(() => (r && cp ? diffResults(r, cp) : null), [r, cp]);
  const label = lensName(lens, !!activeProfile && lens === "self");
  const focusFacts = useMemo(() => new Set(r?.modules.slice(0, 2).flatMap((m) => m.factIds) ?? []), [r]);

  const showEvidence = (id: string) => {
    setEvidenceFocus(id);
    setTimeout(() => setEvidenceFocus(null), 2400);
  };

  /* ---------- 错误 / 不支持 ---------- */
  const err = snap.status === "error" ? snap.error : research.status === "error" ? research.error : null;
  if (err) {
    const kind = err.code === "UNSUPPORTED_SYMBOL" ? "unsupported" : err.code === "UNAUTHORIZED" || err.code === "NOT_CONFIGURED" ? "unauthorized" : "error";
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6">
        <Panel>
          <StateView
            kind={kind}
            title={
              kind === "unsupported"
                ? `${decodeURIComponent(symbol)} 暂未接入数据`
                : err.code === "NOT_CONFIGURED"
                  ? "真实数据源未配置"
                  : err.code === "RATE_LIMITED"
                    ? "请求过于频繁"
                  : kind === "unauthorized"
                    ? "当前没有该数据的访问权限"
                    : "研究服务暂时不可用"
            }
            description={
              <>
                {err.message}
                {kind === "unsupported" && (
                  <>
                    <br />
                    InvestLens 不会为没有数据的标的生成任何分析或数字。
                  </>
                )}
              </>
            }
            code={err.code}
            action={
              <>
                {kind !== "unsupported" && <RetryButton onRetry={() => (snap.reload(), research.reload())} />}
                <Button asChild size="sm" variant="primary">
                  <Link href="/research/510300.SH">打开 510300.SH</Link>
                </Button>
              </>
            }
          />
        </Panel>
      </div>
    );
  }

  const s = snap.data;
  const mdd1 = Number(facts.get("f-mdd-1y")?.value ?? -12);
  const mdd3 = Number(facts.get("f-mdd-3y")?.value ?? -30);

  return (
    <div className="mx-auto max-w-[1360px] space-y-4 px-4 py-5 sm:px-6 lg:py-6">
      {/* ---------- 资产头部 ---------- */}
      <section aria-label="资产概览" className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <Link href="/app" className="hover:text-fg-2">
              主页
            </Link>
            <span className="text-faint">/</span>
            <span>研究工作台</span>
            <SourceBadge className="ml-1" isDemo={s ? s.isDemo : null} demoLabel="合成演示案例 · 非实时" liveLabel="真实行情 · 同花顺扶摇" />
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-2">
            <div>
              <h1 className="flex items-center gap-3 text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">
                {s ? s.name : <Skeleton className="h-8 w-40" />}
                <span className="num rounded-md border border-line-soft bg-surface-2 px-2 py-0.5 text-[13px] font-normal text-muted">{symbol}</span>
              </h1>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge>ETF</Badge>
                <Badge>{s?.exchange ?? "—"}</Badge>
                <Badge tone="brand">跟踪 {s?.trackingIndex ?? "—"}（待核验）</Badge>
              </div>
            </div>
            {s && (
              <div className="flex items-end gap-3">
                <span className="num text-[30px] leading-none font-medium sm:text-[34px]">{formatNumber(s.last, 3)}</span>
                <span className={cn("num pb-1 text-[14px]", (s.changePct ?? 0) >= 0 ? "text-up" : "text-down")}>
                  {formatSigned(s.change, 3)} · {formatSigned(s.changePct, 2, "%")}
                </span>
                <span className="pb-1 text-[11px] text-faint">{s.asOfLabel}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <span className="hidden text-[11.5px] text-muted md:block">切换研究视角 · 事实不变，重点改变</span>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<"simple" | "pro">
              ariaLabel="显示模式"
              size="sm"
              value={mode}
              onChange={setModeState}
              options={[
                { value: "simple", label: "简明" },
                { value: "pro", label: "专业" },
              ]}
            />
            <LensSegmented className="hidden md:inline-flex" />
            {activeProfile && (
              <Button variant={compare ? "outline" : "ghost"} size="sm" onClick={() => setCompare((v) => !v)} aria-pressed={compare}>
                <Columns2 className="h-3.5 w-3.5" /> 并排对比
              </Button>
            )}
          </div>
        </div>
      </section>

      {simple ? (
        r ? (
          <SimpleSummary facts={facts} snap={s ?? null} />
        ) : (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        )
      ) : r ? (
        <DiffBanner result={r} diff={diff} counterpartLabel={counterpartLabel} onCompare={activeProfile ? () => setCompare(true) : undefined} />
      ) : (
        <Skeleton className="h-[58px] w-full rounded-lg" />
      )}

      {compare && r && cp && <CompareView a={r} b={cp} aLabel={label} bLabel={counterpartLabel} onClose={() => setCompare(false)} />}
      {r?.dataSource && r.dataSource.degraded.length > 0 && (
        <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warn/25 bg-warn/[0.06] px-4 py-2.5 text-[12px] text-fg-2">
          <span className="font-medium text-warn">部分可选数据不可用</span>
          {r.dataSource.degraded.map((d) => (
            <span key={d.capability} className="text-muted">
              {d.capability}（{d.code}）
            </span>
          ))}
          <span className="text-faint">对应字段显示为「未知」，研究结论不会使用它们。</span>
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        {/* ---------- 主栏 ---------- */}
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Panel>
            <PanelHeader
              icon={<CandlestickChart />}
              kicker="价格走势"
              title={s && !s.isDemo ? "前复权日线" : "合成价格序列"}
              actions={s && !s.isDemo ? <Badge tone="teal">扶摇 · interval=1d</Badge> : <Badge>不对应真实日期</Badge>}
            />
            <PriceChart symbol={symbol} simulate={simulate} />
          </Panel>

          {!simple && (
          <Panel>
            <PanelHeader
              icon={<Gauge />}
              kicker="事实层"
              title="关键指标"
              actions={
                <span className="hidden items-center gap-1.5 text-[11px] text-faint sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" /> 与当前研究焦点相关
                </span>
              }
            />
            <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-3 xl:grid-cols-4">
              {r
                ? r.facts.filter((f) => f.id !== "f-index").map((f) => <FactTile key={f.id} fact={f} focus={!!activeProfile && focusFacts.has(f.id)} />)
                : Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[86px]" />)}
            </div>
          </Panel>
          )}

          {r ? <FocusCard result={r} lensLabel={label} /> : <Skeleton className="h-[200px] rounded-lg" />}

          {/* AI 研究（第二迭代：真实 LLM + 工具调用） */}
          <Panel id="ai-research">
            <PanelHeader
              icon={<Sparkles />}
              kicker="AI 研究"
              title="提出你的研究问题"
              actions={<Badge tone="brand">理解 → 计划 → 取数 → 核验 → 个性化 → 结论</Badge>}
            />
            <AgentPanel symbol={symbol} profile={activeProfile} lens={lens} lensLabel={label} onEvidence={showEvidence} />
          </Panel>
          {simple && (
            <p className="rounded-lg border border-line-soft px-4 py-3 text-[13px] text-muted">
              想看完整的指标、研究模块、风险排序、情景模拟与每个数字的证据？
              <button type="button" className="ml-1 text-fg underline-offset-4 hover:underline" onClick={() => setModeState("pro")}>
                切换到专业模式
              </button>
            </p>
          )}
          {!simple && (
          <>
          <Panel>
            <PanelHeader
              icon={<ListOrdered />}
              kicker="结构化研究"
              title="研究模块 · 按与你的相关性排序"
              actions={activeProfile ? <Badge tone="brand">{label}</Badge> : <Badge>默认顺序</Badge>}
            />
            <div className="px-5 pb-5">
              {r ? (
                <ModuleList modules={r.modules} counterpart={cp?.modules ?? null} counterpartLabel={counterpartLabel} facts={facts} onEvidence={showEvidence} />
              ) : (
                <PanelSkeleton rows={4} className="p-0" />
              )}
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel className="overflow-hidden">
              <PanelHeader icon={<ShieldAlert />} kicker="风险分析" title="风险 · 按与你的相关性排序" />
              {r ? <RiskPanel risks={r.risks} counterpart={cp?.risks ?? null} counterpartLabel={counterpartLabel} /> : <PanelSkeleton />}
            </Panel>
            <Panel>
              <PanelHeader icon={<CircleHelp />} kicker="待验证" title="研究前需要确认的问题" />
              <div className="px-5 pb-5">{r ? <QuestionList questions={r.openQuestions} /> : <PanelSkeleton className="p-0" />}</div>
              {r && (
                <div className="border-t border-line-soft px-5 py-4">
                  <div className="kicker mb-2">推断（非事实）</div>
                  <ul className="space-y-2">
                    {r.inferences.map((i) => (
                      <li key={i.id} className="text-[12.5px] leading-relaxed text-fg-2">
                        {i.statement}
                        <span className="ml-1.5 text-[11px] text-faint">
                          置信度 {i.confidence === "high" ? "高" : i.confidence === "medium" ? "中" : "低"} · {i.caveat}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>

          <Panel id="scenario">
            <PanelHeader icon={<Calculator />} kicker="情景模拟器" title="如果……会怎样（假设计算）" actions={<Badge tone="warn">不是收益预测</Badge>} />
            {r ? (
              <ScenarioSimulator key={`${lens}-${r.factFingerprint}`} defaults={scenarioDefaults(r.signals, mdd1, mdd3)} lensLabel={label} />
            ) : (
              <PanelSkeleton rows={3} />
            )}
          </Panel>
          </>
          )}
        </div>

        {/* ---------- 右栏 ---------- */}
        <aside className="min-w-0 xl:col-span-4" aria-label="个性化解释与证据">
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-1">
            <Panel>
              <PanelHeader icon={<BookOpenCheck />} kicker="可解释个性化" title="为什么与你有关" />
              {r ? <WhyPanel result={r} profile={activeProfile} /> : <PanelSkeleton rows={4} />}
            </Panel>
            {!simple && (
            <>
            <Panel>
              <PanelHeader icon={<FileStack />} kicker="证据区" title="事实证据与限制" actions={r && <Badge>{r.evidence.length} 条</Badge>} />
              <div className="max-h-[520px] overflow-y-auto px-5 pb-5">
                {r ? <EvidencePanel evidence={r.evidence} facts={facts} highlight={evidenceFocus} /> : <PanelSkeleton className="p-0" />}
              </div>
            </Panel>
            <Panel>
              <PanelHeader icon={<Workflow />} kicker="执行记录" title="研究任务" />
              <ul className="space-y-2 px-5 pb-5">
                {r?.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2.5 text-[12px]">
                    <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", t.status === "done" ? "bg-teal" : t.status === "failed" ? "bg-danger" : "bg-faint")} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-fg-2">{t.label}</span>
                        <span className="num text-[10.5px] text-faint">{t.tool}</span>
                      </div>
                      <div className="truncate text-[11.5px] text-muted">{t.detail}</div>
                    </div>
                  </li>
                )) ?? <Skeleton className="h-24" />}
                {r && (
                  <li className="pt-1 text-[11px] text-faint">
                    <ListChecks className="mr-1 inline h-3 w-3" /> {r.engine.label}
                  </li>
                )}
              </ul>
            </Panel>
            </>
            )}
            {r && (
              <ul className="space-y-1.5 px-1 text-[11px] leading-relaxed text-faint md:col-span-2 xl:col-span-1">
                {r.disclaimers.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function CompareView({ a, b, aLabel, bLabel, onClose }: { a: ResearchResult; b: ResearchResult; aLabel: string; bLabel: string; onClose: () => void }) {
  const Col = ({ r, label }: { r: ResearchResult; label: string }) => (
    <div className="min-w-0 rounded-xl border border-line-soft bg-surface-2/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="brand">{label}</Badge>
        <span className="num text-[11px] text-faint">FP {r.factFingerprint}</span>
      </div>
      <p className="text-[13.5px] font-semibold text-fg">{r.focus.headline}</p>
      <div className="kicker mt-3 mb-1.5">模块顺序</div>
      <ol className="space-y-1">
        {r.modules.map((m) => (
          <li key={m.id} className="flex gap-2 text-[12.5px] text-fg-2">
            <span className="num w-4 text-faint">{m.rank}</span>
            {m.title}
          </li>
        ))}
      </ol>
      <div className="kicker mt-3 mb-1.5">风险前三</div>
      <ol className="space-y-1">
        {r.risks.slice(0, 3).map((x) => (
          <li key={x.id} className="flex items-center gap-2 text-[12.5px] text-fg-2">
            <span className="num w-4 text-faint">{x.rank}</span>
            {x.title}
            <span className={cn("text-[10.5px]", x.severity === 3 ? "text-risk" : x.severity === 2 ? "text-warn" : "text-faint")}>
              {x.severity === 3 ? "高" : x.severity === 2 ? "中" : "低"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <Panel className="animate-fade-up">
      <PanelHeader
        icon={<Columns2 />}
        kicker="并排对比"
        title="同一组事实，两种研究重点"
        actions={
          <Button size="sm" variant="ghost" onClick={onClose}>
            收起
          </Button>
        }
      />
      <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">
        <Col r={a} label={aLabel} />
        <Col r={b} label={bLabel} />
      </div>
      <p className="px-5 pb-4 text-[11.5px] text-teal">✓ 两侧事实层指纹一致：{a.factFingerprint === b.factFingerprint ? "是" : "否"}</p>
    </Panel>
  );
}

