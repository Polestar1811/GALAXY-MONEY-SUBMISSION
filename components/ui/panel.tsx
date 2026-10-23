import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // min-w-0：作为 grid/flex 子项时允许收缩，避免截断文本撑破移动端布局
  return <div className={cn("panel min-w-0", className)} {...props} />;
}

export function PanelHeader({
  icon,
  title,
  kicker,
  actions,
  className,
  id,
}: {
  icon?: ReactNode;
  title: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line-soft bg-surface-2 text-brand [&_svg]:h-[15px] [&_svg]:w-[15px]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {kicker && <div className="kicker mb-0.5">{kicker}</div>}
          <h2 id={id} className="truncate text-[15px] font-semibold tracking-[-0.01em] text-fg">
            {title}
          </h2>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line-soft", className)} />;
}
