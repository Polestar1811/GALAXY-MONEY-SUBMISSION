import { cva, type VariantProps } from "class-variance-authority";
import { FlaskConical } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-wide",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface-2 text-muted",
        brand: "border-brand/30 bg-brand-soft text-fg",
        teal: "border-teal/30 bg-teal-soft text-teal",
        warn: "border-warn/30 bg-warn/10 text-warn",
        risk: "border-risk/30 bg-risk/10 text-risk",
        danger: "border-danger/30 bg-danger/10 text-[#FF9AA2]",
        up: "border-up/30 bg-up/10 text-up",
        down: "border-down/30 bg-down/10 text-down",
        info: "border-info/30 bg-info/10 text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** 演示数据标记 —— 出现在所有合成数据旁。 */
export function DemoBadge({ className, label = "演示数据 · 非实时" }: { className?: string; label?: string | undefined }) {
  return (
    <span
      className={cn(
        "demo-stripe inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-warn/30 px-1.5 py-0.5 text-[11px] font-medium leading-none text-warn",
        className,
      )}
      title="本产品第一迭代中的行情、指标与结论均为固定种子的合成示例，不代表真实市场"
    >
      <FlaskConical className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

/** 真实行情标记 —— 与演示标记在颜色与图标上明显区分。 */
export function LiveBadge({ className, label = "真实行情 · 扶摇" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-teal/35 bg-teal-soft px-1.5 py-0.5 text-[11px] font-medium leading-none text-teal",
        className,
      )}
      title="数据来自同花顺扶摇金融数据 API（服务端调用），按接口返回的有效时间展示"
    >
      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-teal" aria-hidden />
      {label}
    </span>
  );
}

/** 根据数据来源自动选择演示 / 真实标记。 */
export function SourceBadge({ isDemo, className, demoLabel, liveLabel }: { isDemo: boolean | null | undefined; className?: string; demoLabel?: string; liveLabel?: string }) {
  if (isDemo === null || isDemo === undefined) return null;
  return isDemo ? <DemoBadge className={className} label={demoLabel} /> : <LiveBadge className={className} label={liveLabel} />;
}

export function FictionBadge({ className }: { className?: string }) {
  return (
    <Badge tone="info" className={className} title="虚构画像，不对应任何真实个人">
      虚构
    </Badge>
  );
}
