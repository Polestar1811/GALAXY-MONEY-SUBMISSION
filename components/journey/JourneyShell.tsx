"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";

const STEPS = [
  { href: "/genesis", label: "了解你", en: "GENESIS" },
  { href: "/identity", label: "投资人格", en: "IDENTITY" },
  { href: "/paths", label: "财富路径", en: "MONEY PATHS" },
  { href: "/explore", label: "组合探索", en: "EXPLORER" },
];

/** Galaxy Money 普通用户主流程的外壳：先理解人，再进入研究。专业工作台 InvestLens 作为按需进入的深度工具。 */
export function JourneyShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const pathname = usePathname();
  const idx = STEPS.findIndex((s) => pathname.startsWith(s.href));
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[var(--header-h)] max-w-[1280px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="返回 Galaxy Money 首页">
            <Logo />
          </Link>
          <nav aria-label="研究步骤" className="ml-6 hidden items-center gap-1 md:flex">
            {STEPS.map((s, i) => (
              <Link
                key={s.href}
                href={s.href}
                aria-current={i === idx ? "step" : undefined}
                className={cn("flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors", i === idx ? "text-fg" : "text-faint hover:text-fg-2")}
              >
                <span className={cn("num text-[10px]", i === idx ? "text-galaxy" : "text-faint")}>0{i + 1}</span>
                {s.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/research/510300.SH?mode=simple" className="hidden items-center gap-1 text-[12px] text-muted transition-colors hover:text-fg sm:inline-flex">
              InvestLens 专业工作台 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/settings/profile"
              aria-label="画像与隐私"
              className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition-colors hover:text-fg"
            >
              <ShieldCheck className="h-4 w-4" />
            </Link>
          </div>
        </div>
        {idx >= 0 && (
          <div className="flex items-center gap-2 border-t border-line-soft px-4 py-2 text-[11.5px] text-muted md:hidden">
            <span className="num text-galaxy">0{idx + 1}</span>
            <span className="text-fg-2">{STEPS[idx].label}</span>
            <span className="text-faint">· 共 4 步</span>
          </div>
        )}
      </header>
      <main id="main" className={cn("mx-auto px-4 pt-8 pb-24 sm:px-6 sm:pt-12", wide ? "max-w-[1280px]" : "max-w-[960px]")}>
        {children}
      </main>
      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-6 text-[11.5px] text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>研究辅助工具，不构成投资建议。决定始终由你做出。</span>
          <span className="num tracking-[0.08em]">AI CAN DO THE WORK. ONLY YOU CAN LIVE THE LIFE.</span>
        </div>
      </footer>
    </div>
  );
}
