"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { useState } from "react";
import type { PersonalizedBriefItem } from "@/types/research";
import { ReasonList } from "@/components/research/ModuleList";
import { cn } from "@/lib/cn";

export function MarketBrief({ items }: { items: PersonalizedBriefItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="divide-y divide-line-soft" aria-label="个人市场简报">
      {items.map((it) => {
        const expanded = open === it.id;
        return (
          <motion.li layout key={it.id} transition={{ type: "spring", stiffness: 380, damping: 36 }} className="px-5 py-3.5">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                  it.rank === 1 ? "bg-brand-soft text-fg" : "bg-surface-2 text-faint",
                )}
              >
                {it.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-fg">{it.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{it.body}</p>
                <p className="mt-2 flex gap-1.5 text-[12.5px] leading-relaxed text-fg-2">
                  <Lightbulb className="mt-[3px] h-3.5 w-3.5 shrink-0 text-teal" />
                  {it.lensNote}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : it.id)}
                  aria-expanded={expanded}
                  className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-faint transition-colors hover:text-fg-2"
                >
                  为什么展示给你
                  <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 rounded-lg border border-line-soft bg-bg-deep/40 p-3">
                        <ReasonList reasons={it.reasons} empty="未命中个性化规则，按默认优先级展示" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
