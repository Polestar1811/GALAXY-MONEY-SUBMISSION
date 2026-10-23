"use client";

import { AlertTriangle, CircleHelp, Inbox, Lock, RefreshCw, SearchX, ServerCrash } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Skeleton } from "./primitives";

type StateKind = "empty" | "error" | "unauthorized" | "unknown" | "unsupported" | "anomaly";

const ICON: Record<StateKind, ReactNode> = {
  empty: <Inbox />,
  error: <ServerCrash />,
  unauthorized: <Lock />,
  unknown: <CircleHelp />,
  unsupported: <SearchX />,
  anomaly: <AlertTriangle />,
};

const TONE: Record<StateKind, string> = {
  empty: "text-muted border-line bg-surface-2",
  error: "text-danger border-danger/30 bg-danger/10",
  unauthorized: "text-warn border-warn/30 bg-warn/10",
  unknown: "text-info border-info/30 bg-info/10",
  unsupported: "text-brand border-brand/30 bg-brand-soft",
  anomaly: "text-risk border-risk/30 bg-risk/10",
};

/** 统一的状态展示：空、错误、未授权、未知、不支持、异常。 */
export function StateView({
  kind,
  title,
  description,
  action,
  className,
  compact = false,
  code,
}: {
  kind: StateKind;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  code?: string;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn("flex flex-col items-center text-center", compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12", className)}
    >
      <span className={cn("grid place-items-center rounded-xl border [&_svg]:h-5 [&_svg]:w-5", compact ? "h-9 w-9" : "h-11 w-11", TONE[kind])}>
        {ICON[kind]}
      </span>
      <div className="max-w-md">
        <p className={cn("font-semibold text-fg", compact ? "text-sm" : "text-[15px]")}>{title}</p>
        {description && <div className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</div>}
        {code && <p className="mt-2 font-mono text-[11px] text-faint">code: {code}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function RetryButton({ onRetry, label = "重试" }: { onRetry: () => void; label?: string }) {
  return (
    <Button size="sm" variant="secondary" onClick={onRetry}>
      <RefreshCw className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

/** 加载骨架：研究面板通用。 */
export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 p-5", className)} aria-busy="true" aria-label="加载中">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
