"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CandlestickChart, Compass, LayoutGrid, Menu, Palette, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { SourceBadge } from "@/components/ui/badge";
import { useStatus } from "@/lib/client/agent";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { LensCard, LensSegmented } from "./LensSwitcher";
import { TopSearch } from "./TopSearch";

const NAV = [
  { href: "/paths", label: "财富路径", icon: Compass, match: (p: string) => p.startsWith("/paths") },
  { href: "/research/510300.SH", label: "研究工作台", icon: CandlestickChart, match: (p: string) => p.startsWith("/research") },
  { href: "/settings/profile", label: "画像与隐私", icon: ShieldCheck, match: (p: string) => p.startsWith("/settings") },
  { href: "/genesis", label: "了解我", icon: Sparkles, match: (p: string) => p.startsWith("/genesis") },
  { href: "/app", label: "研究简报", icon: LayoutGrid, match: (p: string) => p === "/app" },
  { href: "/design", label: "设计系统", icon: Palette, match: (p: string) => p.startsWith("/design") },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="主导航" className="space-y-0.5">
      {NAV.map((n) => {
        const active = n.match(pathname);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-10 items-center gap-3 rounded-md px-3 text-[13.5px] font-medium transition-colors",
              active ? "bg-white/[0.05] text-fg" : "text-muted hover:bg-white/[0.03] hover:text-fg-2",
            )}
          >
            {active && <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r bg-fg" />}
            <Icon className={cn("h-[17px] w-[17px]", active ? "text-brand" : "text-faint group-hover:text-muted")} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  const status = useStatus();
  const isDemo = status ? status.dataMode === "demo" : null;

  return (
    <div className="min-h-dvh">
      {/* 桌面侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] flex-col border-r border-line-soft bg-[#070707]/95 backdrop-blur lg:flex">
        <div className="flex h-[var(--header-h)] items-center px-5">
          <Link href="/" aria-label="返回 Galaxy Money 首页">
            <Logo product="INVESTLENS" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pt-3">
          <NavList />
        </div>
        <div className="space-y-3 p-3">
          <LensCard />
          <p className="px-1 text-[10.5px] leading-relaxed text-faint">
            研究辅助工具，不构成投资建议。{isDemo === false ? "行情来自同花顺扶摇。" : "当前为合成演示数据。"}
          </p>
        </div>
      </aside>

      {/* 顶部栏 */}
      <header className="sticky top-0 z-30 border-b border-line-soft bg-bg/80 backdrop-blur-xl lg:pl-[236px]">
        <div className="flex h-[var(--header-h)] items-center gap-3 px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="打开导航菜单" onClick={() => setMenu(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/" className="lg:hidden" aria-label="Galaxy Money 首页">
            <LogoMark size={28} />
          </Link>
          <TopSearch className="min-w-0 flex-1 md:max-w-[420px]" />
          <div className="ml-auto hidden items-center gap-3 md:flex">
            {/* 研究页头部已有主视角切换，避免重复 */}
            {!pathname.startsWith("/research") && <LensSegmented size="sm" />}
            <SourceBadge isDemo={isDemo} className="hidden xl:inline-flex" />
          </div>
          <Link
            href="/settings/profile"
            aria-label="画像与隐私"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-muted transition-colors hover:border-brand/50 hover:text-fg"
          >
            <UserRound className="h-4 w-4" />
          </Link>
        </div>
        {/* 移动端：视角切换行 */}
        <div className="flex items-center justify-between gap-2 border-t border-line-soft px-4 py-2 md:hidden">
          <LensSegmented size="sm" />
          <SourceBadge isDemo={isDemo} demoLabel="演示数据" liveLabel="真实行情" />
        </div>
      </header>

      <Sheet open={menu} onOpenChange={setMenu} title="Galaxy Money 导航">
        <div className="space-y-4 p-3">
          <NavList onNavigate={() => setMenu(false)} />
          <LensCard />
        </div>
      </Sheet>

      <main id="main" className="pb-24 lg:pb-10 lg:pl-[236px]" key={pathname.split("/")[1]}>
        {children}
      </main>

      {/* 移动端底部导航 */}
      <MobileTabBar />
    </div>
  );
}

function MobileTabBar() {
  const pathname = usePathname();
  const items = NAV.slice(0, 4);
  return (
    <nav
      aria-label="底部导航"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line-soft bg-[#070707]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      {items.map((n) => {
        const active = n.match(pathname);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[10.5px]", active ? "text-fg" : "text-faint")}
          >
            <Icon className={cn("h-[18px] w-[18px]", active && "text-brand")} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
