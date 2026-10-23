"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { SymbolMatch } from "@/types/market";
import { api } from "@/lib/client/api";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/** 资产检索：可用案例直接进入研究页；未支持的标的诚实说明，不伪造分析。 */
export function TopSearch({ className, autoFocus = false, onNavigate }: { className?: string; autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SymbolMatch[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .search(q)
        .then((r) => alive && (setItems(r), setActive(0)))
        .catch(() => alive && setItems([]))
        .finally(() => alive && setLoading(false));
    }, 100);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (symbol: string) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    onNavigate?.();
    router.push(`/research/${encodeURIComponent(symbol)}`);
  };

  const submit = () => {
    const pick = items[active];
    if (pick) go(pick.symbol);
    else if (q.trim()) go(q.trim().toUpperCase());
  };

  return (
    <div className={cn("relative", className)}>
      <label className="sr-only" htmlFor={`${listId}-input`}>
        搜索资产代码或名称
      </label>
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-md border bg-bg-deep/60 px-3 transition-colors",
          open ? "border-brand/50 shadow-[0_0_0_3px_rgb(243_242_239/0.12)]" : "border-line-soft hover:border-line",
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden />
        <input
          id={`${listId}-input`}
          ref={inputRef}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `${listId}-opt-${active}` : undefined}
          placeholder="搜索代码或名称，如 510300 / 沪深300"
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-faint focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="hidden sm:inline-flex">
          <Kbd>/</Kbd>
        </span>
      </div>

      {open && (
        <div
          id={`${listId}-list`}
          role="listbox"
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 animate-fade-up overflow-hidden rounded-xl border border-line bg-surface-2 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
            <span className="kicker">{q ? "匹配结果" : "可检索标的"}</span>
            <span className="text-[11px] text-faint">{items.some((i) => i.note === "扶摇真实行情") ? "ETF 使用扶摇真实行情" : "演示模式仅 510300.SH 可研究"}</span>
          </div>
          {loading && items.length === 0 ? (
            <div className="space-y-2 p-3">
              <div className="skeleton h-8" />
              <div className="skeleton h-8" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-4 text-[13px] text-muted">
              未找到「{q}」。按 <Kbd>Enter</Kbd> 查看该标的的数据接入状态。
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {items.map((it, i) => (
                <li
                  key={it.symbol}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(it.symbol);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13px] transition-colors",
                    i === active ? "bg-white/[0.04]" : "",
                  )}
                >
                  <span className="num w-[84px] shrink-0 text-[12px] text-fg-2">{it.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{it.name}</span>
                  {it.supported ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-teal">
                      {it.note === "扶摇真实行情" ? "真实行情" : "演示案例"} <ArrowRight className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="text-[11px] text-faint">未接入</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
