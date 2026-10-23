import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <LogoMark size={48} className="mx-auto" />
        <p className="num mt-6 text-[13px] text-brand">404</p>
        <h1 className="mt-2 text-[24px] font-semibold">这个页面不存在</h1>
        <p className="mt-2 text-[14px] text-muted">也许你在找的是研究工作台或你的画像。</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="primary">
            <Link href="/app">返回主页</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">InvestLens 首页</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
