"use client";

import { useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryPeriod, PricePoint } from "@/types/market";
import type { SimulateMode } from "@/types/research";
import { HISTORY_PERIODS } from "@/lib/providers/types";
import { useHistory } from "@/lib/client/hooks";
import { chart, color } from "@/lib/design-tokens/tokens";
import { formatNumber, formatSigned } from "@/lib/format";
import { Segmented } from "@/components/ui/segmented";
import { SourceBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/primitives";
import { RetryButton, StateView } from "@/components/ui/states";
import { cn } from "@/lib/cn";

function ChartTooltip({ active, payload, isDemo = true }: { active?: boolean; payload?: { payload: PricePoint }[]; isDemo?: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface-3/95 px-3 py-2 text-[12px] shadow-xl backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-6">
        <span className="num text-faint">{isDemo ? `合成交易日 ${p.label}` : `交易日 20${p.label}`}</span>
        {isDemo ? <span className="text-[10px] text-warn">演示</span> : <span className="text-[10px] text-teal">前复权</span>}
      </div>
      <div className="grid grid-cols-[auto_auto] gap-x-5 gap-y-0.5">
        <span className="text-muted">收盘</span>
        <span className="num text-right text-fg">{formatNumber(p.close, 3)}</span>
        <span className="text-muted">MA20</span>
        <span className="num text-right text-teal">{p.ma20 === null ? "—" : formatNumber(p.ma20, 3)}</span>
        <span className="text-muted">成交量</span>
        <span className="num text-right text-fg-2">{formatNumber(p.volume / 1e4, 0)} 万份</span>
      </div>
    </div>
  );
}

export function PriceChart({ symbol, simulate = "none", height = 300 }: { symbol: string; simulate?: SimulateMode; height?: number }) {
  const [period, setPeriod] = useState<HistoryPeriod>("1Y");
  const [showMA, setShowMA] = useState(true);
  const h = useHistory(symbol, period, simulate);
  const points = h.data?.points ?? [];
  const first = points[0]?.close;
  const last = points[points.length - 1]?.close;
  const chg = first && last ? (last / first - 1) * 100 : null;
  const maxVol = points.reduce((m, p) => Math.max(m, p.volume), 0);
  // 价格轴取整到 0.05，保证刻度均匀
  const yDomain = useMemo<[number, number]>(() => {
    if (!points.length) return [0, 1];
    const lo = Math.min(...points.map((p) => Math.min(p.close, p.ma20 ?? p.close)));
    const hi = Math.max(...points.map((p) => Math.max(p.close, p.ma20 ?? p.close)));
    const step = hi - lo > 0.6 ? 0.1 : 0.05;
    return [Math.floor((lo - step * 0.3) / step) * step, Math.ceil((hi + step * 0.3) / step) * step];
  }, [points]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-3">
          <Segmented<HistoryPeriod>
            ariaLabel="图表周期"
            size="sm"
            value={period}
            onChange={setPeriod}
            options={HISTORY_PERIODS.map((p) => ({ value: p.id, label: p.label }))}
          />
          <button
            type="button"
            aria-pressed={showMA}
            onClick={() => setShowMA((v) => !v)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors",
              showMA ? "border-teal/40 bg-teal-soft text-teal" : "border-line-soft text-muted hover:text-fg-2",
            )}
          >
            <span className="h-[2px] w-3 rounded bg-current" /> MA20
          </button>
        </div>
        <div className="flex items-center gap-3 text-[12px]">
          <span className="text-faint">区间</span>
          <span className={cn("num font-medium", chg === null ? "text-faint" : chg >= 0 ? "text-up" : "text-down")}>
            {formatSigned(chg, 2, "%")}
          </span>
          <SourceBadge isDemo={h.data ? h.data.isDemo : null} demoLabel="合成序列" liveLabel="扶摇日线" />
        </div>
      </div>

      <div className="relative px-2 pt-2 pb-1" style={{ height }}>
        {h.status === "error" ? (
          <StateView
            kind={h.error.code === "UNAUTHORIZED" ? "unauthorized" : "error"}
            title={h.error.code === "UNAUTHORIZED" ? "暂无行情权限" : "行情加载失败"}
            description={h.error.message}
            code={h.error.code}
            action={<RetryButton onRetry={h.reload} />}
            compact
          />
        ) : !h.data ? (
          <div className="flex h-full flex-col justify-end gap-2 px-3 pb-6" aria-busy="true" aria-label="图表加载中">
            <Skeleton className="h-[70%] w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : points.length === 0 ? (
          <StateView kind="empty" title="该周期暂无数据" description="数据源未返回任何价格点。我们不会用插值或随机数填充。" compact />
        ) : (
          <div className={cn("h-full transition-opacity duration-200", h.status === "loading" && "opacity-50")}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.priceFillTop} />
                    <stop offset="100%" stopColor={chart.priceFillBottom} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chart.grid} strokeDasharray="0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: chart.axis, fontSize: 10.5 }}
                  tickLine={false}
                  axisLine={{ stroke: chart.grid }}
                  minTickGap={48}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="p"
                  orientation="right"
                  domain={yDomain}
                  tickCount={6}
                  allowDataOverflow={false}
                  tick={{ fill: chart.axis, fontSize: 10.5 }}
                  tickFormatter={(v: number) => v.toFixed(2)}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <YAxis yAxisId="v" hide domain={[0, maxVol * 4.2]} />
                <Tooltip content={<ChartTooltip isDemo={h.data?.isDemo ?? true} />} cursor={{ stroke: "#3A4552", strokeDasharray: "3 3" }} isAnimationActive={false} />
                <Bar yAxisId="v" dataKey="volume" fill={chart.volume} radius={[1, 1, 0, 0]} isAnimationActive={false} />
                <Area
                  yAxisId="p"
                  type="monotone"
                  dataKey="close"
                  stroke={color.brand}
                  strokeWidth={1.6}
                  fill="url(#price-fill)"
                  isAnimationActive={false}
                  activeDot={{ r: 3.5, fill: color.brand, stroke: color.bg, strokeWidth: 2 }}
                />
                {showMA && (
                  <Line yAxisId="p" type="monotone" dataKey="ma20" stroke={chart.ma} strokeWidth={1.2} dot={false} strokeOpacity={0.85} isAnimationActive={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <p className="px-5 pb-3 text-[11px] text-faint">{h.data?.axisNote ?? "加载中"}</p>
    </div>
  );
}
