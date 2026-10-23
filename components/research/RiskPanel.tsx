"use client";

import { motion } from "motion/react";
import { ChevronDown, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { PersonalizedQuestion, PersonalizedRisk } from "@/types/research";
import { Badge } from "@/components/ui/badge";
import { SeverityMeter } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { RankDelta, ReasonList } from "./ModuleList";
import { ObjectiveChip } from "./AgentPanel";

export function RiskPanel({
  risks,
  counterpart,
  counterpartLabel,
}: {
  risks: PersonalizedRisk[];
  counterpart: PersonalizedRisk[] | null;
  counterpartLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="divide-y divide-line-soft" aria-label="风险（按与你的相关性排序）">
      {risks.map((r) => {
        const other = counterpart?.find((x) => x.id === r.id);
        const delta = other ? other.rank - r.rank : null;
        const sevChanged = other && other.severity !== r.severity;
        const expanded = open === r.id;
        return (
          <motion.li layout key={r.id} transition={{ type: "spring", stiffness: 380, damping: 36 }} className="relative">
            {r.emphasized && <span className="absolute top-3 bottom-3 left-0 w-[2px] rounded-r bg-risk" aria-hidden />}
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : r.id)}
              aria-expanded={expanded}
              className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-white/[0.015]"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-fg">{r.title}</span>
                  {r.emphasized && <Badge tone="risk">与你高度相关</Badge>}
                  <RankDelta delta={delta} against={counterpartLabel} />
                  {sevChanged && (
                    <span className="text-[10.5px] text-faint">
                      {counterpartLabel}：{other!.severity === 3 ? "高" : other!.severity === 2 ? "中" : "低"}关注
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">{r.summary}</span>
                <span className="mt-1.5 block text-[12.5px] leading-relaxed text-fg-2">
                  <ShieldAlert className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-risk" />
                  {r.lensNote}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                <ObjectiveChip level={r.objectiveSeverity} />
                <span title="与你的相关度：由画像规则决定">
                  <SeverityMeter level={r.severity} />
                </span>
                <ChevronDown className={cn("h-4 w-4 text-faint transition-transform", expanded && "rotate-180")} />
              </span>
            </button>
            {expanded && (
              <div className="animate-fade-up space-y-3 px-5 pb-4">
                <p className="rounded-lg border border-line-soft bg-bg-deep/40 px-3 py-2 text-[12.5px] leading-relaxed text-fg-2">{r.detail}</p>
                <p className="text-[11.5px] text-faint">
                  客观严重程度只由市场事实决定（{r.objectiveBasis}），所有画像相同；右侧关注等级表示与你的相关度。
                </p>
                <div>
                  <div className="kicker mb-1.5">为什么是这个关注等级</div>
                  <ReasonList reasons={r.reasons} empty="未命中个性化规则，保持基础等级" />
                </div>
              </div>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}

export function QuestionList({ questions }: { questions: PersonalizedQuestion[] }) {
  return (
    <ol className="space-y-2" aria-label="待验证问题">
      {questions.map((q) => (
        <motion.li
          layout
          key={q.id}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className="flex gap-3 rounded-xl border border-line-soft bg-surface-2/40 px-4 py-3"
        >
          <span className="num mt-0.5 text-[11px] text-faint">Q{q.rank}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-relaxed text-fg">{q.question}</p>
            <p className="mt-1 text-[12px] text-muted">{q.why}</p>
          </div>
          {q.needsPhase2 ? (
            <Badge tone="info" className="h-fit">
              需真实数据
            </Badge>
          ) : (
            <Badge tone="teal" className="h-fit">
              需你确认
            </Badge>
          )}
        </motion.li>
      ))}
    </ol>
  );
}
