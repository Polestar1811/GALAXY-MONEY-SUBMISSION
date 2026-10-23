"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ---------- Slider ---------- */
export function Slider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  ariaLabel,
  tone = "brand",
  className,
}: {
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
  tone?: "brand" | "teal" | "risk";
  className?: string;
}) {
  const fill = tone === "teal" ? "bg-teal" : tone === "risk" ? "bg-risk" : "bg-brand";
  return (
    <SliderPrimitive.Root
      className={cn("relative flex h-5 w-full touch-none select-none items-center", className)}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onValueChange(v[0])}
      aria-label={ariaLabel}
    >
      <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-line">
        <SliderPrimitive.Range className={cn("absolute h-full rounded-full", fill)} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="block h-4 w-4 rounded-full border-2 border-fg bg-bg shadow-[0_0_0_4px_rgb(243_242_239/0.18)] transition-[box-shadow,transform] duration-150 hover:scale-110 focus-visible:shadow-[0_0_0_6px_rgb(243_242_239/0.35)] focus-visible:outline-none"
      />
    </SliderPrimitive.Root>
  );
}

/* ---------- Switch ---------- */
export function Switch({
  checked,
  onCheckedChange,
  id,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      className="relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-line bg-surface-3 transition-colors duration-200 data-[state=checked]:border-teal/60 data-[state=checked]:bg-teal/80"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-[3px] rounded-full bg-fg shadow transition-transform duration-200 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[#06231E]" />
    </SwitchPrimitive.Root>
  );
}

/* ---------- Tooltip ---------- */
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-[80] max-w-[280px] animate-fade-up rounded-lg border border-line bg-surface-3 px-3 py-2 text-[12px] leading-relaxed text-fg-2 shadow-xl"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-surface-3" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** 术语提示按钮：键盘可聚焦。 */
export function InfoTip({ content, label = "说明" }: { content: ReactNode; label?: string }) {
  return (
    <Tip content={content}>
      <button
        type="button"
        aria-label={label}
        className="inline-grid h-4 w-4 place-items-center rounded-full text-faint transition-colors hover:text-fg-2"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </Tip>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

/* ---------- Severity meter ---------- */
export function SeverityMeter({ level, className }: { level: 1 | 2 | 3; className?: string }) {
  const tone = level === 3 ? "bg-risk" : level === 2 ? "bg-warn" : "bg-faint";
  const label = level === 3 ? "高关注" : level === 2 ? "中关注" : "低关注";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-label={`关注等级：${label}`}>
      <span className="flex gap-[3px]">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("h-3 w-[5px] rounded-[2px]", i <= level ? tone : "bg-line")} />
        ))}
      </span>
      <span className={cn("text-[11px]", level === 3 ? "text-risk" : level === 2 ? "text-warn" : "text-faint")}>{label}</span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10.5px] text-muted">
      {children}
    </kbd>
  );
}
