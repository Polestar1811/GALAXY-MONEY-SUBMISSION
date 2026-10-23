"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Hand, Sparkles } from "lucide-react";
import type { ResearchResult } from "@/types/research";
import { Badge } from "@/components/ui/badge";

/** 研究结论卡：个性化研究焦点 + 研究顺序。结论是「研究方向」，不是买卖建议。 */
export function FocusCard({ result, lensLabel }: { result: ResearchResult; lensLabel: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface p-5 sm:p-6 before:absolute before:top-0 before:left-0 before:h-full before:w-[2px] before:bg-fg">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-2">
          <Sparkles className="h-3.5 w-3.5" /> 研究焦点
        </span>
        <Badge tone="brand">{lensLabel}</Badge>
        <Badge tone="neutral" title={result.engine.label}>
          {result.engine.label}
        </Badge>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={result.focus.headline}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22 }}
        >
          <h2 className="mt-3 text-[20px] leading-snug font-semibold tracking-[-0.015em] text-fg text-balance sm:text-[23px]">
            {result.focus.headline}
          </h2>
          <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-fg-2">{result.focus.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="建议的研究顺序">
            <span className="mr-1 text-[11.5px] text-faint">研究顺序</span>
            {result.focus.sequence.map((s, i) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bg-deep/50 px-2 py-1 text-[12px] text-fg-2">
                  <span className="num text-[10.5px] text-brand">{i + 1}</span>
                  {s}
                </span>
                {i < result.focus.sequence.length - 1 && <ArrowRight className="h-3 w-3 text-faint" />}
              </span>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex items-start gap-2 border-t border-line-soft pt-3 text-[11.5px] leading-relaxed text-muted">
        <Hand className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
        InvestLens 帮你决定「先研究什么」，而不是「买还是卖」。是否投资、投多少，始终由你决定。
      </div>
    </div>
  );
}
