"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUpRight, Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import type { MoneyPath } from "@/types/identity";
import { Badge, FictionBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIdentity } from "@/lib/identity/store";
import { v2api } from "@/lib/client/v2";
import { cn } from "@/lib/cn";

const STATUS: Record<MoneyPath["status"], { label: string; tone: "teal" | "neutral" | "warn" }> = {
  priority: { label: "建议先研究", tone: "teal" },
  available: { label: "可以了解", tone: "neutral" },
  conditional: { label: "需要先满足前提", tone: "warn" },
};

export function MoneyPaths() {
  const store = useIdentity();
  const sp = useSearchParams();
  const demo = sp.get("demo");
  useEffect(() => {
    if (demo === "A" || demo === "B") store.useDemo(demo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);
  const p = store.active;
  const key = p ? store.cacheKey(p) : "";
  const result = p ? store.paths[key] : undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!p) return;
    setLoading(true);
    setError(null);
    try {
      store.setPaths(key, await v2api.paths(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };
  const ready = !!p && (p.kind === "demo" || p.confirmed);
  useEffect(() => {
    if (ready && !result && !loading) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  if (!store.hydrated) return <div className="skeleton h-64" />;
  if (!p || !ready) {
    return (
      <section className="mx-auto max-w-[620px] py-10 text-center">
        <h1 className="display text-[40px] text-fg">先确认你的投资人格</h1>
        <p className="mt-4 text-[14.5px] text-muted">研究路径建立在我们对你的理解之上。确认之前，我们不会为你组织任何研究方向。</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="primary" asChild>
            <Link href={p ? "/identity" : "/genesis"}>{p ? "去确认投资人格" : "开始了解我"}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/paths?demo=A">看演示：用户 A</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-10">
      <header>
        <p className="smallcaps text-faint">MONEY PATHS · 03</p>
        <h1 className="display mt-4 text-[38px] text-fg sm:text-[54px]">
          三条值得进一步探索的财富研究路径<span className="galaxy-dot">.</span>
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {p.kind === "demo" && (
            <>
              <FictionBadge />
              <Badge tone="neutral">{p.label}</Badge>
            </>
          )}
          {result && <Badge tone="neutral">{result.source === "llm" ? "AI 撰写 · 顺序与前提由规则决定" : "规则生成"}</Badge>}
        </div>
        <p className="mt-5 max-w-[760px] text-[14.5px] leading-[1.8] text-fg-2">
          这些是基于我们对你的理解组织的<strong className="font-medium text-fg">研究方向</strong>，不是买卖建议，也不是为你定制的配置方案。每条路径都会说明它为什么与你有关、可能的风险和代价。
        </p>
        {result && <p className="mt-3 max-w-[760px] text-[13.5px] text-muted" data-testid="order-reason">{result.orderReason}</p>}
      </header>

      {loading && !result && (
        <p className="flex items-center gap-2 text-[13px] text-muted" aria-busy>
          <Loader2 className="h-4 w-4 animate-spin" /> 正在结合你的情况整理研究路径…
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-fg-2">
          {error}{" "}
          <button className="underline" onClick={load}>
            重试
          </button>
        </p>
      )}

      {result && (
        <ol className="space-y-6" data-testid="money-paths">
          {result.paths.map((path, i) => (
            <PathCard key={path.id} path={path} index={i} />
          ))}
        </ol>
      )}
      {result?.notes.map((n) => (
        <p key={n} className="text-[12px] text-faint">
          {n}
        </p>
      ))}
    </div>
  );
}

function PathCard({ path, index }: { path: MoneyPath; index: number }) {
  const st = STATUS[path.status];
  return (
    <li className={cn("rounded-lg border p-5 sm:p-7", path.status === "priority" ? "border-fg/30" : "border-line-soft")} data-path={path.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-[11px] text-galaxy">0{index + 1}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <h2 className="mt-3 text-[22px] font-medium text-fg sm:text-[26px]">{path.title}</h2>
      <p className="mt-1 text-[13.5px] text-muted">{path.tagline}</p>
      {path.gate && (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[13px] text-fg-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" /> {path.gate}
        </p>
      )}
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <Block title="为什么与你有关">
          <p>{path.why}</p>
        </Block>
        <Block title="它可能帮你解决什么">
          <p>{path.helps}</p>
        </Block>
        <Block title="主要风险">
          <List items={path.risks} />
        </Block>
        <Block title="你需要付出的代价">
          <List items={path.costs} />
        </Block>
        <Block title="什么变化会影响它是否适合你">
          <List items={path.changes} />
        </Block>
        <Block title="如果感兴趣，可以继续研究">
          <List items={path.explore} />
        </Block>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
        <Button variant={path.status === "priority" ? "primary" : "secondary"} asChild>
          <Link href={`/explore?path=${path.id}`}>
            探索相关的研究组合 <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {path.id !== "A" && (
          <Link href="/research/510300.SH?mode=simple" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            用 InvestLens 看懂一只宽基 ETF <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </li>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="text-[13.5px] leading-relaxed text-fg-2">
      <p className="mb-1.5 text-[11.5px] text-faint">{title}</p>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((x) => (
        <li key={x}>· {x}</li>
      ))}
    </ul>
  );
}
