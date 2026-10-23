"use client";

import { Calculator, RotateCcw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProfileSignals } from "@/types/profile";
import { simulateScenario, type ScenarioInput } from "@/lib/scenario";
import { chart, color } from "@/lib/design-tokens/tokens";
import { formatNumber, formatWan } from "@/lib/format";
import { Slider } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/** 情景默认值由研究视角决定（只是起点，用户可自由调整）。回撤默认取合成序列历史回撤附近。 */
export function scenarioDefaults(s: ProfileSignals, mdd1y: number, mdd3y: number): ScenarioInput {
  if (s.liquidityPressure === "high" || s.horizon === "short") {
    return { principal: 200000, annualReturn: 3, years: 1, drawdown: Math.round(Math.abs(mdd1y)), withdrawal: 150000, monthly: 0 };
  }
  if (s.horizon === "long") {
    return { principal: 200000, annualReturn: 5, years: 15, drawdown: Math.round(Math.abs(mdd3y)), withdrawal: 0, monthly: 3000 };
  }
  return { principal: 200000, annualReturn: 4, years: 5, drawdown: Math.round(Math.abs(mdd3y)), withdrawal: 0, monthly: 1000 };
}

interface Field {
  key: keyof ScenarioInput;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  tone?: "brand" | "teal" | "risk";
}

const FIELDS: Field[] = [
  { key: "principal", label: "初始投入", min: 10000, max: 1000000, step: 10000, fmt: (v) => `¥${formatWan(v)}` },
  { key: "monthly", label: "每月追加", min: 0, max: 20000, step: 500, fmt: (v) => `¥${formatNumber(v, 0)}`, tone: "teal" },
  { key: "annualReturn", label: "假设年化回报", min: -10, max: 12, step: 0.5, fmt: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%` },
  { key: "years", label: "持有年限", min: 1, max: 30, step: 1, fmt: (v) => `${v} 年` },
  { key: "drawdown", label: "假设回撤幅度", min: 0, max: 60, step: 1, fmt: (v) => `−${v}%`, tone: "risk" },
  { key: "withdrawal", label: "回撤时需取出", min: 0, max: 1000000, step: 10000, fmt: (v) => `¥${formatWan(v)}`, tone: "risk" },
];

export function ScenarioSimulator({ defaults, lensLabel }: { defaults: ScenarioInput; lensLabel: string }) {
  const [x, setX] = useState<ScenarioInput>(defaults);
  const r = useMemo(() => simulateScenario(x), [x]);
  const set = (k: keyof ScenarioInput, v: number) =>
    setX((p) => {
      const n = { ...p, [k]: v };
      if (k === "principal" && n.withdrawal > v) n.withdrawal = v;
      return n;
    });

  return (
    <div className="grid gap-5 px-5 pb-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted">
            默认参数来自 <span className="text-fg-2">{lensLabel}</span> 的研究视角，可自由调整。
          </p>
          <Button variant="ghost" size="sm" onClick={() => setX(defaults)} aria-label="恢复默认参数">
            <RotateCcw className="h-3.5 w-3.5" /> 重置
          </Button>
        </div>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <div className="mb-2 flex items-center justify-between text-[12.5px]">
              <label className="text-muted">{f.label}</label>
              <span className="num font-medium text-fg">{f.fmt(x[f.key])}</span>
            </div>
            <Slider
              ariaLabel={f.label}
              value={x[f.key]}
              min={f.min}
              max={f.key === "withdrawal" ? x.principal : f.max}
              step={f.step}
              tone={f.tone}
              onValueChange={(v) => set(f.key, v)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Out label={`${x.years} 年后假设市值`} value={`¥${formatWan(Math.round(r.finalValue))}`} sub={`累计投入 ¥${formatWan(r.totalContribution)}`} />
          <Out label="回撤低点账面市值" value={`¥${formatWan(Math.round(r.troughValue))}`} sub={`初始投入 × (1 − ${x.drawdown}%)`} tone="risk" />
          <Out
            label="低点取出的锁定损失"
            value={x.withdrawal > 0 ? `¥${formatWan(Math.round(r.lockedLoss))}` : "—"}
            sub={x.withdrawal > 0 ? `需卖出 ${formatNumber(r.unitsSoldPct, 1)}% 份额` : "未设置取款"}
            tone={x.withdrawal > 0 ? "risk" : undefined}
            testId="locked-loss"
          />
          <Out
            label="取款缺口"
            value={r.shortfall > 0 ? `¥${formatWan(Math.round(r.shortfall))}` : "无"}
            sub={r.shortfall > 0 ? "回撤后市值不足以支付" : "可以支付（但会锁定损失）"}
            tone={r.shortfall > 0 ? "danger" : undefined}
          />
        </div>

        {r.shortfall > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-fg-2">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
            在该假设下，回撤后的市值不足以覆盖计划取款。
          </p>
        )}

        <div className="h-[150px] rounded-xl border border-line-soft bg-bg-deep/40 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={r.path} margin={{ top: 6, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="sc-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(80,215,192,0.28)" />
                  <stop offset="100%" stopColor="rgba(80,215,192,0)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: chart.axis, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => (x.years <= 3 ? `${Math.round(v * 12)}月` : `${v}年`)} minTickGap={24} />
              <YAxis tick={{ fill: chart.axis, fontSize: 10 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
              <Tooltip
                cursor={{ stroke: "#3A4552" }}
                contentStyle={{ background: color.surface3, border: `1px solid ${color.line}`, borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v: number) => (x.years <= 3 ? `第 ${Math.round(v * 12)} 个月（假设）` : `第 ${v} 年（假设）`)}
                formatter={(v: number, n: string) => [`¥${formatWan(v)}`, n === "value" ? "假设市值" : "累计投入"]}
              />
              <Area type="monotone" dataKey="contributed" stroke={color.faint} strokeDasharray="4 4" fill="transparent" isAnimationActive={false} />
              <Area type="monotone" dataKey="value" stroke={color.teal} strokeWidth={1.6} fill="url(#sc-fill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <details className="group rounded-xl border border-line-soft bg-surface-2/40 px-3.5 py-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] text-muted">
            <Calculator className="h-3.5 w-3.5 text-brand" /> 计算公式与假设边界
            <Badge tone="warn" className="ml-auto">假设，不是预测</Badge>
          </summary>
          <div className="num mt-2.5 space-y-1 text-[11.5px] leading-relaxed text-fg-2">
            <p>FV = P·(1+i)^N + m·((1+i)^N − 1)/i，i = (1+r)^(1/12) − 1</p>
            <p>低点市值 = P·(1 − d)</p>
            <p>锁定损失 = W·d / (1 − d)</p>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            回报率与回撤均为你设定的假设值，模型假设回报恒定、回撤发生在投入初期，不含费用、税费与再投资。结果不代表预期收益。
          </p>
        </details>
      </div>
    </div>
  );
}

function Out({ label, value, sub, tone, testId }: { label: string; value: string; sub: string; tone?: "risk" | "danger"; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-xl border px-3 py-2.5",
        tone === "danger" ? "border-danger/30 bg-danger/[0.06]" : tone === "risk" ? "border-risk/20 bg-risk/[0.05]" : "border-line-soft bg-surface-2/50",
      )}
    >
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cn("num mt-1 text-[17px] font-medium", tone === "danger" ? "text-danger" : tone === "risk" ? "text-risk" : "text-fg")}>{value}</div>
      <div className="mt-1 truncate text-[10.5px] text-faint">{sub}</div>
    </div>
  );
}
