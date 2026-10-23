"use client";

import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

/** 可访问的分段控件：role=radiogroup，方向键切换。 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  ariaLabel,
  className,
  accent = "brand",
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  size?: "sm" | "md";
  ariaLabel: string;
  className?: string;
  accent?: "brand" | "neutral";
}) {
  const layoutId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = options.findIndex((o) => o.value === value);
  const tabStop = activeIndex >= 0 ? activeIndex : Math.max(0, options.findIndex((o) => !o.disabled));

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    for (let k = 1; k <= options.length; k++) {
      const n = (i + dir * k + options.length) % options.length;
      if (!options[n].disabled) {
        onChange(options[n].value);
        refs.current[n]?.focus();
        break;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("relative inline-flex items-center rounded-md border border-line-soft bg-bg-deep/60 p-0.5", className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative z-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-200",
              size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3.5 text-[13px]",
              active ? "text-fg" : "text-muted hover:text-fg-2",
              o.disabled && "opacity-40",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className={cn(
                  "absolute inset-0 -z-10 rounded-md border",
                  accent === "brand" ? "border-brand/40 bg-brand-soft" : "border-line bg-surface-3",
                )}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
