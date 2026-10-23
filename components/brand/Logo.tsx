import { cn } from "@/lib/cn";

/**
 * Galaxy 正式标志：取自 Galaxy 官网 /assets/brand/mark-white.svg（方框 · 圆 · 十字 · 十条丝线），原样矢量路径。
 * 静态文件副本见 public/brand/galaxy-mark.svg；网站图标为官网 favicon（app/icon.svg）。
 */
export function LogoMark({ size = 28, className, tile = false }: { size?: number; className?: string; tile?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Galaxy"
      className={cn("shrink-0 text-fg", tile && "rounded-[4px] border border-line bg-surface p-[3px]", className)}
    >
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="8" width="48" height="48" />
        <circle cx="32" cy="32" r="24" />
        <path d="M8 32h48M32 8v48" />
        <path d="M32 32C17 30 13 21 21 11M32 32C19 24 21 13 31 8M32 32C27 19 31 11 40 10M32 32C36 19 45 16 52 22M32 32C43 23 52 25 56 33M32 32C47 34 51 43 43 53M32 32C45 41 42 51 32 56M32 32C36 45 30 54 22 54M32 32C22 43 13 40 8 33M32 32C19 37 12 30 10 23" />
      </g>
    </svg>
  );
}

/**
 * Galaxy 字标（沿用官网排版：标志 + 宽字距粗体 GALAXY + 小号等宽标签）。
 * product：Galaxy Money（普通用户主流程）或 InvestLens（专业研究工作台）。
 */
export function Logo({
  className,
  size = 26,
  product = "MONEY",
  showTagline = false,
}: {
  className?: string;
  size?: number;
  product?: "MONEY" | "INVESTLENS";
  showTagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-[14px] font-bold tracking-[0.23em] text-fg">GALAXY</span>
          <span className="num text-[9px] tracking-[0.14em] text-faint">{product === "MONEY" ? "MONEY" : "INVESTLENS"}</span>
        </span>
        {showTagline && <span className="mt-1.5 text-[10.5px] tracking-[0.16em] text-faint">先理解你 · 再理解市场</span>}
      </span>
    </span>
  );
}
