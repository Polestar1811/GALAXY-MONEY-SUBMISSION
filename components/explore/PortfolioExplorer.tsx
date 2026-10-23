"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PathId } from "@/types/identity";
import type { BacktestResult } from "@/lib/portfolio/backtest";
import { normalizeWeights, scenarioLoss } from "@/lib/portfolio/backtest";
import type { PortfolioResponse } from "@/lib/portfolio/service";
import { ASSET_BY_SYMBOL, BENCHMARK, TEMPLATES, UNIVERSE, type AssetClass } from "@/lib/portfolio/universe";
import { v2api } from "@/lib/client/v2";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const pct = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(d)}%`);
const signedPct = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const day = (t: number) => new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
const yuan = (x: number) => `${x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("zh-CN", { maximumFractionDigits: 0 })} 元`;
const CLASS_LABEL: Record<AssetClass, string> = { cash: "现金管理", bond: "债券", equity: "股票", gold: "黄金" };

export function PortfolioExplorer() {
  const sp = useSearchParams();
  const initial = (["A", "B", "C"].includes(sp.get("path") ?? "") ? sp.get("path") : "B") as PathId;
  const [tpl, setTpl] = useState<PathId>(initial);
  const [weights, setWeights] = useState<Record<string, number>>(() => fullWeights(TEMPLATES[initial].weights));
  const [rebalance, setRebalance] = useState<"monthly" | "none">("monthly");
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const norm = useMemo(() => normalizeWeights(weights), [weights]);
  const sum = Object.values(weights).reduce((s, v) => s + v, 0);

  useEffect(() => {
    if (!norm) return;
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setLoading(true);
      setError(null);
      try {
        const payload = Object.fromEntries(Object.entries(weights).filter(([, v]) => v > 0));
        setData(await v2api.portfolio(payload, rebalance, c.signal));
      } catch (e) {
        if (!c.signal.aborted) setError(e instanceof Error ? e.message : "计算失败");
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [weights, rebalance, norm]);

  const pick = (id: PathId) => {
    setTpl(id);
    setWeights(fullWeights(TEMPLATES[id].weights));
  };

  const port = data?.portfolio.ok ? data.portfolio : null;
  const bench = data?.benchmark && data.benchmark.ok ? data.benchmark : null;

  return (
    <div className="space-y-10">
      <header>
        <Link href="/paths" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> 回到财富路径
        </Link>
        <p className="smallcaps mt-6 text-faint">PORTFOLIO EXPLORER · 04</p>
        <h1 className="display mt-4 text-[36px] text-fg sm:text-[52px]">
          看看不同组合在历史上经历过什么<span className="galaxy-dot">.</span>
        </h1>
        <p className="mt-5 max-w-[780px] text-[14.5px] leading-[1.8] text-fg-2">
          这里是<strong className="font-medium text-fg">研究与情景比较</strong>，不是买卖建议或配置方案。历史结果全部由真实行情计算，只描述过去；你可以调整比例，看看收益、下跌幅度和波动如何变化。
        </p>
      </header>

      <section aria-labelledby="h-build" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <h2 id="h-build" className="smallcaps text-faint">
            研究组合
          </h2>
          <Segmented<PathId> ariaLabel="研究组合" value={tpl} onChange={pick} options={(["A", "B", "C"] as PathId[]).map((id) => ({ value: id, label: TEMPLATES[id].title.replace("研究组合", "") }))} />
          <p className="text-[13px] text-muted">{TEMPLATES[tpl].note}</p>
          <ul className="space-y-4" data-testid="weights">
            {UNIVERSE.map((a) => (
              <li key={a.symbol}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-fg">
                    {a.name} <span className="num text-[11px] text-faint">{a.symbol}</span>
                    <Badge tone="neutral" className="ml-2">
                      {CLASS_LABEL[a.assetClass]}
                    </Badge>
                  </span>
                  <span className="num text-fg-2">{norm?.[a.symbol] ? pct(norm[a.symbol], 0) : "0%"}</span>
                </div>
                <Slider className="mt-2" ariaLabel={`${a.name}比例`} value={weights[a.symbol] ?? 0} min={0} max={100} step={5} onValueChange={(v) => setWeights((w) => ({ ...w, [a.symbol]: v }))} />
                <p className="mt-1 text-[11.5px] text-faint">{a.role}</p>
              </li>
            ))}
          </ul>
          {sum !== 100 && norm && <p className="text-[12px] text-faint">滑块合计 {sum}，计算时按比例换算为 100%。</p>}
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
            再平衡
            <Segmented<"monthly" | "none"> ariaLabel="再平衡" size="sm" value={rebalance} onChange={setRebalance} options={[{ value: "monthly", label: "每月恢复比例" }, { value: "none", label: "不再平衡" }]} />
          </div>
        </div>
        <Results data={data} port={port} bench={bench} loading={loading} error={error} />
      </section>

      {port && <History port={port} bench={bench} />}
      {port && <Scenario weights={weights} maxDrawdown={port.metrics.maxDrawdown} />}

      {data && (
        <section aria-labelledby="h-assume" className="space-y-3 text-[12.5px] text-muted">
          <h2 id="h-assume" className="smallcaps text-faint">
            假设、口径与数据来源
          </h2>
          <ul className="space-y-1">
            {data.assumptions.map((a) => (
              <li key={a}>· {a}</li>
            ))}
          </ul>
          {data.sources.length > 0 && (
            <p className="text-faint">
              数据：同花顺扶摇 ETF 前复权日线 —{" "}
              {data.sources.map((s) => (
                <span key={s.symbol} className="mr-3 inline-block">
                  {s.name} <span className="num">{s.symbol}</span>
                  {s.requestId && <span className="num"> · request {s.requestId.slice(0, 8)}…</span>}
                </span>
              ))}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function fullWeights(w: Record<string, number>) {
  return Object.fromEntries(UNIVERSE.map((a) => [a.symbol, w[a.symbol] ?? 0]));
}

function Results({ data, port, bench, loading, error }: { data: PortfolioResponse | null; port: BacktestResult | null; bench: BacktestResult | null; loading: boolean; error: string | null }) {
  return (
    <aside aria-labelledby="h-results" className="space-y-4 rounded-lg border border-line-soft p-5" aria-busy={loading}>
      <div className="flex items-center justify-between">
        <h2 id="h-results" className="smallcaps text-faint">
          历史表现
        </h2>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
      </div>
      {error && <p role="alert" className="text-[13px] text-fg-2">{error}</p>}
      {data && !data.portfolio.ok && (
        <p className="flex gap-2 text-[13px] text-fg-2" data-testid="portfolio-blocked">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> {data.portfolio.reason}
        </p>
      )}
      {port && (
        <>
          <p className="num text-[11.5px] text-faint">
            {day(port.start)} — {day(port.end)} · {port.days} 个共同交易日
          </p>
          <table className="w-full text-[13px]" data-testid="portfolio-metrics">
            <thead>
              <tr className="text-left text-[11px] text-faint">
                <th className="py-1 font-normal" />
                <th className="py-1 text-right font-normal">这个组合</th>
                <th className="py-1 text-right font-normal">{BENCHMARK.name}</th>
              </tr>
            </thead>
            <tbody className="num">
              {(
                [
                  ["累计收益", (r: BacktestResult) => signedPct(r.metrics.cumulativeReturn)],
                  ["年化收益", (r: BacktestResult) => signedPct(r.metrics.annualizedReturn)],
                  ["最大跌幅（最大回撤）", (r: BacktestResult) => pct(r.metrics.maxDrawdown)],
                  ["年化波动", (r: BacktestResult) => pct(r.metrics.annualizedVolatility)],
                ] as const
              ).map(([label, f]) => (
                <tr key={label} className="border-t border-line-soft">
                  <td className="py-2 font-sans text-muted">{label}</td>
                  <td className="py-2 text-right text-fg">{f(port)}</td>
                  <td className="py-2 text-right text-fg-2">{bench ? f(bench) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[12px] leading-relaxed text-muted">
            最大跌幅发生在 {day(port.metrics.maxDrawdownPeak)} 到 {day(port.metrics.maxDrawdownTrough)}：如果在高点投入，账面最多曾下跌 {pct(-port.metrics.maxDrawdown)}。
            {bench && ` 同期只持有沪深300ETF 的最大跌幅为 ${pct(-bench.metrics.maxDrawdown)}。`}
          </p>
        </>
      )}
    </aside>
  );
}

function History({ port, bench }: { port: BacktestResult; bench: BacktestResult | null }) {
  const rows = useMemo(() => {
    const b = new Map(bench?.nav.map((p) => [p.t, p.v]) ?? []);
    const step = Math.max(1, Math.floor(port.nav.length / 160));
    return port.nav.filter((_, i) => i % step === 0 || i === port.nav.length - 1).map((p) => ({ d: day(p.t), p: (p.v - 1) * 100, b: b.has(p.t) ? (b.get(p.t)! - 1) * 100 : null }));
  }, [port, bench]);
  return (
    <section aria-labelledby="h-hist" className="space-y-4">
      <h2 id="h-hist" className="smallcaps text-faint">
        累计收益走势（%）与年度表现
      </h2>
      <div className="h-[280px] rounded-lg border border-line-soft p-2" data-testid="portfolio-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#1d1d1e" vertical={false} />
            <XAxis dataKey="d" tick={{ fill: "#747472", fontSize: 10 }} minTickGap={48} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#747472", fontSize: 10 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${Math.round(v)}%`} />
            <Tooltip contentStyle={{ background: "#111", border: "1px solid #2a2a2b", fontSize: 12 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="p" name="这个组合" stroke="#f3f2ef" dot={false} strokeWidth={1.6} isAnimationActive={false} />
            <Line type="monotone" dataKey="b" name="沪深300ETF" stroke="#747472" dot={false} strokeWidth={1.1} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="portfolio-periods">
        {port.periods.map((p) => (
          <span key={p.label} className="rounded-md border border-line-soft px-3 py-1.5 text-[12.5px]">
            <span className="text-muted">{p.label}</span> <span className={cn("num", p.ret >= 0 ? "text-up" : "text-down")}>{signedPct(p.ret)}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function Scenario({ weights, maxDrawdown }: { weights: Record<string, number>; maxDrawdown: number }) {
  const [amount, setAmount] = useState(100_000);
  const [equity, setEquity] = useState("-0.2");
  const [bond, setBond] = useState("0");
  const [gold, setGold] = useState("0");
  const [need, setNeed] = useState(0);
  const s = scenarioLoss({ amount, weights, shocks: { equity: Number(equity), bond: Number(bond), gold: Number(gold), cash: 0 }, classOf: (x) => ASSET_BY_SYMBOL[x]?.assetClass ?? "equity" });
  const stable = s.rows.filter((r) => ["cash", "bond"].includes(ASSET_BY_SYMBOL[r.symbol]?.assetClass ?? "")).reduce((t, r) => t + r.amount + r.change, 0);
  return (
    <section aria-labelledby="h-scn" className="space-y-5 rounded-lg border border-line-soft p-5 sm:p-6">
      <h2 id="h-scn" className="smallcaps text-faint">
        假设情景 · 由你指定，不是预测
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-[13px] text-muted">
          假设投入金额（元）
          <input
            type="number"
            min={0}
            step={1000}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Math.min(1e9, Number(e.target.value) || 0)))}
            className="num mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-fg"
          />
        </label>
        <label className="text-[13px] text-muted">
          一年内可能需要动用的金额（元）
          <input
            type="number"
            min={0}
            step={1000}
            value={need}
            onChange={(e) => setNeed(Math.max(0, Math.min(1e9, Number(e.target.value) || 0)))}
            className="num mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-fg"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-muted">
        <span className="flex items-center gap-2">
          股票假设
          <Segmented size="sm" ariaLabel="股票假设涨跌" value={equity} onChange={setEquity} options={["0", "-0.1", "-0.2", "-0.3"].map((v) => ({ value: v, label: v === "0" ? "不变" : `${Number(v) * 100}%` }))} />
        </span>
        <span className="flex items-center gap-2">
          债券假设
          <Segmented size="sm" ariaLabel="债券假设涨跌" value={bond} onChange={setBond} options={["0", "-0.05"].map((v) => ({ value: v, label: v === "0" ? "不变" : `${Number(v) * 100}%` }))} />
        </span>
        <span className="flex items-center gap-2">
          黄金假设
          <Segmented size="sm" ariaLabel="黄金假设涨跌" value={gold} onChange={setGold} options={["0", "-0.1", "-0.2"].map((v) => ({ value: v, label: v === "0" ? "不变" : `${Number(v) * 100}%` }))} />
        </span>
      </div>
      <table className="w-full text-[13px]" data-testid="scenario-table">
        <thead>
          <tr className="text-left text-[11px] text-faint">
            <th className="py-1 font-normal">资产</th>
            <th className="py-1 text-right font-normal">比例</th>
            <th className="py-1 text-right font-normal">金额</th>
            <th className="py-1 text-right font-normal">假设涨跌</th>
            <th className="py-1 text-right font-normal">金额变化</th>
          </tr>
        </thead>
        <tbody className="num">
          {s.rows.map((r) => (
            <tr key={r.symbol} className="border-t border-line-soft">
              <td className="py-1.5 font-sans text-fg-2">{ASSET_BY_SYMBOL[r.symbol]?.name ?? r.symbol}</td>
              <td className="py-1.5 text-right">{pct(r.weight, 0)}</td>
              <td className="py-1.5 text-right">{yuan(r.amount)}</td>
              <td className="py-1.5 text-right">{signedPct(r.shock, 0)}</td>
              <td className={cn("py-1.5 text-right", r.change < 0 ? "text-down" : "text-fg-2")}>{yuan(r.change)}</td>
            </tr>
          ))}
          <tr className="border-t border-line">
            <td className="py-2 font-sans text-fg">合计</td>
            <td />
            <td className="py-2 text-right text-fg">{yuan(amount)}</td>
            <td className="py-2 text-right">{signedPct(s.changePct)}</td>
            <td className={cn("py-2 text-right", s.change < 0 ? "text-down" : "text-fg")}>{yuan(s.change)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[12px] text-faint">公式：金额变化 = Σ（投入金额 × 资产比例 × 你设定的假设涨跌）。现金管理按不变计算；未计入费用与税费。</p>
      <p className="text-[13px] text-fg-2">
        按这个组合在历史区间内的最大跌幅（{pct(maxDrawdown)}）估算，如果在最高点投入 {yuan(amount)}，账面最多曾减少约 {yuan(Math.abs(amount * maxDrawdown))}。历史最大跌幅不代表未来的最坏情况。
      </p>
      {need > 0 && (
        <p className={cn("rounded-md border px-3 py-2 text-[13px]", need > stable ? "border-warn/30 bg-warn/[0.06] text-fg-2" : "border-line-soft text-muted")} data-testid="liquidity-check">
          {need > stable
            ? `在这个假设情景下，现金管理与债券部分约为 ${yuan(stable)}，少于你一年内可能要用的 ${yuan(need)}：到时可能需要在下跌后卖出股票或黄金。`
            : `在这个假设情景下，现金管理与债券部分约为 ${yuan(stable)}，可以覆盖你一年内可能要用的 ${yuan(need)}。`}
        </p>
      )}
    </section>
  );
}
