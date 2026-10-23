"use client";

import type { MarketFact } from "@/types/market";
import { formatFact } from "@/lib/format";
import { InfoTip } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const STATUS_LABEL: Record<MarketFact["status"], { text: string; cls: string }> = {
  ok: { text: "数据源", cls: "text-teal" },
  demo: { text: "演示", cls: "text-warn" },
  computed: { text: "计算", cls: "text-info" },
  unverified: { text: "待核验", cls: "text-brand" },
  unknown: { text: "未知", cls: "text-faint" },
  stale: { text: "过期", cls: "text-risk" },
  anomaly: { text: "异常", cls: "text-danger" },
};

export function FactTile({ fact, focus = false, className }: { fact: MarketFact; focus?: boolean; className?: string }) {
  const st = STATUS_LABEL[fact.status];
  const numeric = typeof fact.value === "number";
  const negative = numeric && (fact.value as number) < 0;
  const isRet = fact.metric.startsWith("return");
  return (
    <div
      data-fact-id={fact.id}
      className={cn(
        "group relative rounded-xl border bg-surface-2/60 px-3.5 py-3 transition-colors",
        focus ? "border-brand/35 bg-brand-soft/40" : "border-line-soft hover:border-line",
        className,
      )}
    >
      {focus && (
        <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_2px_rgb(243_242_239/0.6)]" title="与当前视角的研究重点相关" />
      )}
      <div className="flex items-center gap-1 pr-3 text-[11.5px] text-muted">
        <span className="truncate">{fact.label}</span>
        <InfoTip
          label={`${fact.label} 口径说明`}
          content={
            <span>
              {fact.definition ?? "暂无口径说明"}
              <br />
              <span className="text-faint">
                来源：{fact.source.name} · {fact.asOfLabel}
              </span>
            </span>
          }
        />
      </div>
      <div
        className={cn(
          "num mt-1.5 truncate text-[19px] font-medium leading-none",
          fact.value === null ? "text-faint" : isRet ? (negative ? "text-down" : "text-up") : "text-fg",
        )}
      >
        {formatFact(fact)}
      </div>
      <div className={cn("mt-2 text-[10.5px] font-medium", st.cls)}>● {st.text}</div>
    </div>
  );
}
