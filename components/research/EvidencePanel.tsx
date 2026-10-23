"use client";

import { useEffect, useRef } from "react";
import type { Evidence } from "@/types/evidence";
import type { MarketFact } from "@/types/market";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

const STATUS: Record<Evidence["status"], { label: string; tone: "warn" | "info" | "brand" | "teal" | "neutral" | "danger" }> = {
  demo: { label: "演示", tone: "warn" },
  computed: { label: "计算", tone: "info" },
  unverified: { label: "待核验", tone: "brand" },
  verified: { label: "已核验", tone: "teal" },
  missing: { label: "含缺失", tone: "neutral" },
  conflict: { label: "冲突", tone: "danger" },
};

export function EvidencePanel({
  evidence,
  facts,
  highlight,
}: {
  evidence: Evidence[];
  facts: Map<string, MarketFact>;
  highlight: string | null;
}) {
  const refs = useRef<Record<string, HTMLLIElement | null>>({});
  useEffect(() => {
    if (highlight) refs.current[highlight]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlight]);

  return (
    <ul className="space-y-2">
      {evidence.map((e) => {
        const st = STATUS[e.status];
        return (
          <li
            key={e.id}
            ref={(el) => {
              refs.current[e.id] = el;
            }}
            className={cn(
              "rounded-xl border px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-300",
              highlight === e.id ? "border-brand/50 bg-brand-soft/50 shadow-[0_0_0_3px_rgb(243_242_239/0.12)]" : "border-line-soft bg-surface-2/40",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-medium text-fg">{e.title}</p>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-[52px_1fr] gap-x-2 gap-y-1 text-[11.5px]">
              <dt className="text-faint">字段</dt>
              <dd className="text-fg-2">{e.factIds.map((id) => facts.get(id)?.label ?? id).join("、")}</dd>
              <dt className="text-faint">来源</dt>
              <dd className="text-fg-2">
                {e.source.name}
                {e.source.url === null && <span className="text-faint">（无外部 URL）</span>}
              </dd>
              <dt className="text-faint">时点</dt>
              <dd className="text-fg-2">{e.asOfLabel}</dd>
              {e.documentRef && (
                <>
                  <dt className="text-faint">接口</dt>
                  <dd className="num break-all text-fg-2">{e.documentRef}</dd>
                </>
              )}
              {e.value !== undefined && e.value !== null && (
                <>
                  <dt className="text-faint">取值</dt>
                  <dd className="num text-fg-2">{String(e.value)}</dd>
                </>
              )}
              <dt className="text-faint">编号</dt>
              <dd className="num text-faint">
                {e.id}
                {e.requestId && <span className="ml-2">request_id {e.requestId.slice(0, 12)}…</span>}
              </dd>
              {e.url && (
                <>
                  <dt className="text-faint">{e.kind === "news" ? "原文" : "文档"}</dt>
                  <dd className="min-w-0">
                    <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand hover:underline">
                      {e.kind === "news" ? "打开原文" : "接口文档"} ↗
                    </a>
                  </dd>
                </>
              )}
            </dl>
            <p className="mt-2 border-t border-line-soft pt-2 text-[11.5px] leading-relaxed text-muted">
              <span className="text-warn">限制：</span>
              {e.limitations}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
