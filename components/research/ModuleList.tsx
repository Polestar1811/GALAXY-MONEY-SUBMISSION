"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronDown, FileSearch, Lightbulb, Minus } from "lucide-react";
import { useState } from "react";
import type { MarketFact } from "@/types/market";
import type { PersonalizationReason, PersonalizedModule } from "@/types/research";
import { formatFact } from "@/lib/format";
import { cn } from "@/lib/cn";

export function RankDelta({ delta, against }: { delta: number | null; against: string }) {
  if (delta === null) return null;
  if (delta === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10.5px] text-faint" title={`与${against}相同`}>
        <Minus className="h-3 w-3" />
      </span>
    );
  const up = delta > 0;
  return (
    <span
      className={cn("num inline-flex items-center gap-0.5 rounded px-1 text-[10.5px]", up ? "bg-brand-soft text-fg" : "bg-white/[0.04] text-faint")}
      title={`相对${against}${up ? "前移" : "后移"} ${Math.abs(delta)} 位`}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta)}
    </span>
  );
}

export function ReasonList({ reasons, empty = "按默认顺序展示" }: { reasons: PersonalizationReason[]; empty?: string }) {
  if (reasons.length === 0) return <p className="text-[12px] text-faint">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {reasons.map((r) => (
        <li key={r.ruleId} className="flex items-start gap-2 text-[12px] leading-relaxed">
          <span
            className={cn(
              "num mt-[1px] shrink-0 rounded px-1 text-[10.5px]",
              r.weight > 0 ? "bg-brand-soft text-fg" : "bg-white/[0.05] text-faint",
            )}
          >
            {r.weight > 0 ? `+${r.weight}` : r.weight}
          </span>
          <span className="text-fg-2">
            <span className="text-muted">{r.trigger}</span>
            <span className="mx-1 text-faint">→</span>
            {r.weight > 0 ? "前置" : "后置"}（{r.ruleName}）
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ModuleList({
  modules,
  counterpart,
  counterpartLabel,
  facts,
  onEvidence,
}: {
  modules: PersonalizedModule[];
  counterpart: PersonalizedModule[] | null;
  counterpartLabel: string;
  facts: Map<string, MarketFact>;
  onEvidence: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(modules[0]?.id ?? null);

  return (
    <ol className="space-y-2.5" aria-label="研究模块（按与你的相关性排序）">
      {modules.map((m) => {
        const other = counterpart?.find((x) => x.id === m.id);
        const delta = other ? other.rank - m.rank : null;
        const expanded = open === m.id;
        return (
          <motion.li
            layout
            key={m.id}
            id={m.id}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className={cn(
              "scroll-mt-28 overflow-hidden rounded-xl border bg-surface-2/50 transition-colors",
              m.rank === 1 ? "border-brand/30" : "border-line-soft",
            )}
          >
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : m.id)}
              aria-expanded={expanded}
              aria-controls={`${m.id}-body`}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-white/[0.015]"
            >
              <span
                className={cn(
                  "num grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[12px] font-semibold",
                  m.rank === 1 ? "border-brand/40 bg-brand-soft text-fg" : "border-line-soft bg-bg-deep/50 text-muted",
                )}
              >
                {m.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="kicker !tracking-[0.08em]">{m.kicker}</span>
                  <RankDelta delta={delta} against={counterpartLabel} />
                </span>
                <span className="mt-0.5 block text-[14.5px] font-semibold text-fg">{m.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted">{m.summary}</span>
              </span>
              <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-faint transition-transform duration-200", expanded && "rotate-180")} />
            </button>

            <div className="mx-4 mb-3.5 flex gap-2.5 rounded-lg border border-teal/20 bg-teal-soft/60 px-3 py-2.5">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
              <p className="text-[12.5px] leading-relaxed text-fg-2">
                <span className="mr-1 font-medium text-teal">对你意味着</span>
                {m.lensNote}
              </p>
            </div>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  id={`${m.id}-body`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-4 border-t border-line-soft px-4 py-4 md:grid-cols-[1.4fr_1fr]">
                    <div>
                      <div className="kicker mb-2">要点</div>
                      <ul className="space-y-1.5">
                        {m.bullets.map((b) => (
                          <li key={b} className="flex gap-2 text-[13px] leading-relaxed text-fg-2">
                            <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                            {b}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {m.factIds.map((id) => {
                          const f = facts.get(id);
                          if (!f) return null;
                          return (
                            <span key={id} className="inline-flex items-center gap-1.5 rounded-md border border-line-soft bg-bg-deep/50 px-2 py-1 text-[11.5px]">
                              <span className="text-faint">{f.label}</span>
                              <span className="num text-fg-2">{formatFact(f)}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="kicker mb-2">为什么排在第 {m.rank} 位</div>
                        <ReasonList reasons={m.reasons} />
                      </div>
                      <div>
                        <div className="kicker mb-2">证据</div>
                        <div className="flex flex-wrap gap-1.5">
                          {m.evidenceIds.map((id) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => onEvidence(id)}
                              className="inline-flex items-center gap-1 rounded-md border border-line-soft px-2 py-1 text-[11.5px] text-muted transition-colors hover:border-brand/40 hover:text-fg"
                            >
                              <FileSearch className="h-3 w-3" />
                              {id}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ol>
  );
}
