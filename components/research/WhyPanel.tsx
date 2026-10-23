"use client";

import Link from "next/link";
import { ArrowUpRight, Fingerprint, GitCompareArrows, ShieldCheck } from "lucide-react";
import type { InvestorProfile } from "@/types/profile";
import type { ResearchResult } from "@/types/research";
import { PROFILE_FIELDS, optionLabel } from "@/lib/profile/fields";
import { SIGNAL_LABELS } from "@/lib/personalization/signals";
import { Badge, FictionBadge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/** 「为什么与你有关」：展示参与个性化的画像、推断出的研究视角与命中的规则。 */
export function WhyPanel({ result, profile }: { result: ResearchResult; profile: InvestorProfile | null }) {
  const s = result.signals;
  const signals: { label: string; value: string; warn?: boolean }[] = [
    { label: "期限视角", value: SIGNAL_LABELS.horizon[s.horizon] },
    { label: "流动性压力", value: SIGNAL_LABELS.liquidityPressure[s.liquidityPressure], warn: s.liquidityPressure === "high" },
    { label: "客观承受能力", value: SIGNAL_LABELS.capacity[s.capacity], warn: s.capacity === "low" },
    { label: "解释深度", value: SIGNAL_LABELS.depth[s.depth] },
  ];

  return (
    <div className="space-y-5 px-5 pb-5">
      {profile ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[13px] font-medium text-fg">{profile.label}</span>
            {profile.kind === "demo" ? <FictionBadge /> : <Badge tone="teal">已确认</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-1.5">
            {PROFILE_FIELDS.filter((f) => f.key !== "incomeStability").map((f) => (
              <div key={f.key} className="rounded-lg border border-line-soft bg-bg-deep/40 px-2.5 py-1.5">
                <dt className="text-[10.5px] text-faint">{f.label}</dt>
                <dd className="truncate text-[12px] text-fg-2">{optionLabel(f.key, profile[f.key]) ?? <span className="text-faint">未回答</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[12.5px] leading-relaxed text-muted">
          当前为通用视角，未使用任何画像。切换到虚构画像 A / B，或
          <Link href="/genesis" className="mx-1 text-brand hover:underline">
            建立你的画像
          </Link>
          查看个性化差异。
        </p>
      )}

      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="kicker">研究视角</span>
          <Badge tone="neutral">推断</Badge>
          <InfoTip content="这些是根据画像回答推导出的研究视角，用于排序与解释，不是关于你的事实。可在画像页修正原始回答。" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {signals.map((x) => (
            <div key={x.label} className="flex items-center justify-between rounded-lg border border-line-soft px-2.5 py-1.5">
              <span className="text-[11.5px] text-muted">{x.label}</span>
              <span className={cn("text-[12px] font-medium", x.warn ? "text-risk" : "text-fg-2")}>{x.value}</span>
            </div>
          ))}
        </div>
        {s.willingnessExceedsCapacity && (
          <p className="mt-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2 text-[12px] leading-relaxed text-fg-2">
            <span className="font-medium text-warn">愿意 ≠ 能够：</span>
            主观风险偏好高于客观承受能力。InvestLens 以客观承受能力为准设定研究边界。
          </p>
        )}
      </div>

      <div>
        <div className="kicker mb-2">命中的个性化规则 · {result.appliedRules.length}</div>
        {result.appliedRules.length === 0 ? (
          <p className="text-[12px] text-faint">无 —— 内容按默认顺序展示。</p>
        ) : (
          <ul className="space-y-2">
            {result.appliedRules.map((r) => (
              <li key={r.ruleId} className="rounded-lg border border-line-soft bg-surface-2/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-fg">{r.ruleName}</span>
                  <span className="num text-[10px] text-faint">{r.ruleId}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-muted">{r.trigger}</p>
                <p className="mt-1 text-[12px] text-fg">→ {r.effect}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-teal/20 bg-teal-soft/50 px-3 py-2.5 text-[11.5px] leading-relaxed text-fg-2">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
        个性化只改变顺序、风险强调和解释方式，不会修改任何事实数值。
      </div>

      <Link href="/settings/profile" className="inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline">
        查看或修正画像 <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export interface ResultDiff {
  moduleMoves: number;
  riskChanges: number;
  questionMoves: number;
  noteChanges: number;
  focusChanged: boolean;
  factsEqual: boolean;
}

export function diffResults(a: ResearchResult, b: ResearchResult): ResultDiff {
  const moves = <T extends { id: string; rank: number }>(x: T[], y: T[]) =>
    x.filter((i) => y.find((j) => j.id === i.id)?.rank !== i.rank).length;
  return {
    moduleMoves: moves(a.modules, b.modules),
    riskChanges: a.risks.filter((r) => {
      const o = b.risks.find((x) => x.id === r.id);
      return !o || o.rank !== r.rank || o.severity !== r.severity || o.emphasized !== r.emphasized;
    }).length,
    questionMoves: moves(a.openQuestions, b.openQuestions),
    noteChanges: a.modules.filter((m) => b.modules.find((x) => x.id === m.id)?.lensNote !== m.lensNote).length,
    focusChanged: a.focus.headline !== b.focus.headline,
    factsEqual: a.factFingerprint === b.factFingerprint && JSON.stringify(a.facts) === JSON.stringify(b.facts),
  };
}

/** A/B 差异提示条：直观展示「事实不变，重点改变」。 */
export function DiffBanner({
  result,
  diff,
  counterpartLabel,
  onCompare,
}: {
  result: ResearchResult;
  diff: ResultDiff | null;
  counterpartLabel: string;
  onCompare?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line-soft bg-surface px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-teal/30 bg-teal-soft text-teal">
          <Fingerprint className="h-4 w-4" />
        </span>
        <div>
          <div className="text-[11px] text-faint">事实层指纹</div>
          <div className="num text-[13px] font-medium text-fg" data-testid="fact-fingerprint">
            {result.factFingerprint}
            <span className="ml-2 text-[11.5px] font-normal text-teal">
              {diff ? (diff.factsEqual ? `与${counterpartLabel}一致 · ${result.facts.length} 项事实` : "不一致") : `${result.facts.length} 项事实`}
            </span>
          </div>
        </div>
      </div>
      <div className="hidden h-8 w-px bg-line-soft sm:block" />
      {diff ? (
        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted" data-testid="diff-summary">
          <span className="inline-flex items-center gap-1.5 text-fg-2">
            <GitCompareArrows className="h-3.5 w-3.5 text-brand" />
            相对{counterpartLabel}：
          </span>
          <span>
            模块顺序 <b className="num font-medium text-fg">{diff.moduleMoves}</b> 处
          </span>
          <span>
            风险强调 <b className="num font-medium text-fg">{diff.riskChanges}</b> 项
          </span>
          <span>
            解释重点 <b className="num font-medium text-fg">{diff.noteChanges}</b> 处
          </span>
          <span>
            待验证问题 <b className="num font-medium text-fg">{diff.questionMoves}</b> 处
          </span>
          {diff.focusChanged && <span className="text-fg">研究焦点已改变</span>}
        </div>
      ) : (
        <p className="flex-1 text-[12px] text-muted">切换到画像 A 或 B，查看同一事实下研究重点如何变化。</p>
      )}
      {onCompare && (
        <button type="button" onClick={onCompare} className="shrink-0 text-[12px] text-brand hover:underline">
          并排对比
        </button>
      )}
    </div>
  );
}
