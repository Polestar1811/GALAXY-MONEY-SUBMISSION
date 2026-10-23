"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  Compass,
  Eye,
  ListTodo,
  Newspaper,
  ShieldAlert,
  Sparkles,
  Target,
  UserRoundPlus,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { LensId } from "@/types/profile";
import { useProfile } from "@/lib/profile/store";
import { PERSONA_META } from "@/lib/profile/personas";
import { useBrief, useHistory, useResearch, useSnapshot } from "@/lib/client/hooks";
import { formatNumber, formatSigned } from "@/lib/format";
import { DEMO_SYMBOL, SYMBOL_DIRECTORY } from "@/lib/demo-data/symbols";
import { Badge, FictionBadge, SourceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { SeverityMeter, Skeleton } from "@/components/ui/primitives";
import { Sparkline } from "@/components/ui/sparkline";
import { PanelSkeleton, RetryButton, StateView } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { GoalCard } from "./GoalCard";
import { MarketBrief } from "./MarketBrief";

export function DashboardView() {
  const { hydrated, lens, activeProfile, userProfile, setLens } = useProfile();

  if (!hydrated) return <PanelSkeleton rows={6} className="mx-auto max-w-[1360px]" />;
  if (!activeProfile) return <EmptyDashboard lens={lens} hasDraft={!!userProfile && userProfile.status !== "confirmed"} onPick={setLens} />;
  return <ActiveDashboard />;
}

function EmptyDashboard({ lens, hasDraft, onPick }: { lens: LensId | null; hasDraft: boolean; onPick: (l: LensId) => void }) {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:py-16">
      <div className="text-center">
        <span className="kicker">For You</span>
        <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-balance sm:text-[34px]">
          先选择一个研究视角
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
          {lens === "self" && hasDraft
            ? "你的画像还有未确认的修改。确认之前，InvestLens 不会把它当作事实来使用。"
            : "InvestLens 的简报和研究顺序取决于你的目标与约束。你可以建立自己的画像，或先载入一个虚构画像体验差异。"}
        </p>
      </div>
      <div className="mt-10 grid gap-3 md:grid-cols-3">
        <Link
          href={lens === "self" && hasDraft ? "/settings/profile" : "/genesis"}
          className="panel panel-hover group flex flex-col p-5 focus-visible:outline-2"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-brand/30 bg-brand-soft text-brand">
            <UserRoundPlus className="h-5 w-5" />
          </span>
          <span className="mt-4 text-[15px] font-semibold">{lens === "self" && hasDraft ? "确认我的画像" : "建立我的画像"}</span>
          <span className="mt-1 text-[12.5px] leading-relaxed text-muted">约 3 分钟 · 8 个问题 · 可跳过 · 默认不保存</span>
          <span className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-brand">
            开始 <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
        {(["A", "B"] as const).map((id) => (
          <button key={id} type="button" onClick={() => onPick(id)} className="panel panel-hover group flex flex-col p-5 text-left">
            <span className="flex items-center gap-2">
              <span className="num grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-2 text-[15px] font-semibold text-fg">{id}</span>
              <FictionBadge />
            </span>
            <span className="mt-4 text-[15px] font-semibold">{PERSONA_META[id].title}</span>
            <span className="mt-1 text-[12.5px] leading-relaxed text-muted">{PERSONA_META[id].tagline}</span>
            <span className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-fg-2">
              载入虚构画像 {id} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? "夜深了" : h < 11 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";
}

function ActiveDashboard() {
  const { lens, activeProfile } = useProfile();
  const profile = activeProfile!;
  const brief = useBrief(DEMO_SYMBOL, profile);
  const research = useResearch(DEMO_SYMBOL, profile);
  const snap = useSnapshot(DEMO_SYMBOL);
  const hist = useHistory(DEMO_SYMBOL, "3M");
  const meta = lens === "A" || lens === "B" ? PERSONA_META[lens] : null;
  const live = brief.data?.dataSource ? !brief.data.dataSource.isDemo : null;
  const [done, setDone] = useState<Set<string>>(new Set());

  const tasks = useMemo(() => {
    const r = research.data;
    if (!r) return [];
    const top = r.modules.slice(0, 3).map((m) => ({
      id: m.id,
      title: m.title,
      hint: m.reasons[0] ? `因为：${m.reasons[0].trigger}` : "默认研究顺序",
      href: `/research/${DEMO_SYMBOL}#${m.id}`,
    }));
    const scenario =
      r.signals.liquidityPressure === "high"
        ? { id: "scenario", title: "在情景模拟器中测试「回撤时取款」", hint: "已按你的近期资金需要预设取款金额", href: `/research/${DEMO_SYMBOL}#scenario` }
        : { id: "scenario", title: "模拟长期定投的假设区间", hint: "已按你的期限预设持有年限与每月追加", href: `/research/${DEMO_SYMBOL}#scenario` };
    return [...top, scenario];
  }, [research.data]);

  const insight = useMemo(() => {
    const s = research.data?.signals ?? brief.data?.signals;
    if (!s) return null;
    if (s.willingnessExceedsCapacity)
      return "你的主观风险偏好高于客观承受能力。今天的简报以「能够承受」为准排序 —— 回撤与用钱时点排在前面。";
    if (s.liquidityPressure === "high") return "你近期可能需要用钱，简报优先关注回撤与流动性，而非估值和长期回报。";
    if (s.horizon === "long") return "你的期限较长且有独立储备，简报优先关注估值区间、持有成本与纪律，短期波动后置。";
    return "简报按你的目标与约束排序，展开每条可查看原因。";
  }, [research.data, brief.data]);

  const sparkVals = hist.data?.points.map((p) => p.close) ?? [];

  return (
    <div className="mx-auto max-w-[1360px] space-y-4 px-4 py-5 sm:px-6 lg:py-6">
      {/* 头部 */}
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-muted">{greeting()}</span>
            <Badge tone="brand">{profile.label}</Badge>
            {profile.kind === "demo" && <FictionBadge />}
            <SourceBadge isDemo={live === null ? null : !live} />
          </div>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">
            你的研究简报 <span className="brand-text">For You</span>
          </h1>
          {meta && <p className="mt-1 text-[13px] text-muted">{meta.tagline}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="md">
            <Link href="/settings/profile">
              <Eye className="h-4 w-4" /> 查看画像
            </Link>
          </Button>
          <Button asChild variant="primary" size="md">
            <Link href={`/research/${DEMO_SYMBOL}`}>
              进入研究工作台 <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Lens 提示 */}
      <AnimatePresence mode="wait">
        {insight && (
          <motion.div
            key={insight}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-3 rounded-lg border border-brand/25 bg-[linear-gradient(90deg,rgb(243_242_239/0.10),rgb(124_196_179/0.05))] px-4 py-3"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand/30 bg-bg-deep/50 text-brand">
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-fg">
                Lens 提示 <span className="text-faint">· 确定性规则生成，未调用大模型</span>
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-fg-2">{insight}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel className="lg:col-span-8">
          <PanelHeader
            icon={<Newspaper />}
            kicker="Personal Market Brief"
            title="个人市场简报"
            actions={brief.data && <span className="num hidden text-[11px] text-faint sm:inline">FP {brief.data.factFingerprint}</span>}
          />
          {brief.status === "error" ? (
            <StateView kind="error" title="简报加载失败" description={brief.error.message} action={<RetryButton onRetry={brief.reload} />} compact />
          ) : brief.data ? (
            <MarketBrief items={brief.data.items} />
          ) : (
            <PanelSkeleton rows={4} />
          )}
          <p className="border-t border-line-soft px-5 py-3 text-[11px] text-faint">
            简报内容基于沪深300ETF {live ? "同花顺扶摇真实行情" : "合成演示数据"}。所有画像看到的是同一组事实，仅顺序与解释不同。
          </p>
        </Panel>

        <Panel className="lg:col-span-4">
          <PanelHeader icon={<Target />} kicker="目标与约束" title="当前投资目标" />
          {research.data ? <GoalCard profile={profile} signals={research.data.signals} rules={research.data.appliedRules} /> : <PanelSkeleton rows={3} />}
        </Panel>

        <Panel className="lg:col-span-4">
          <PanelHeader
            icon={<ShieldAlert />}
            kicker="风险观察"
            title="与你相关的风险"
            actions={
              <Link href={`/research/${DEMO_SYMBOL}`} className="text-[12px] text-brand hover:underline">
                全部
              </Link>
            }
          />
          <ul className="space-y-2 px-5 pb-5">
            {research.data
              ? research.data.risks.slice(0, 3).map((r) => (
                  <motion.li
                    layout
                    key={r.id}
                    className={cn("rounded-xl border px-3.5 py-3", r.emphasized ? "border-risk/25 bg-risk/[0.05]" : "border-line-soft bg-surface-2/40")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold">{r.title}</span>
                      <SeverityMeter level={r.severity} />
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted">{r.lensNote}</p>
                  </motion.li>
                ))
              : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[74px]" />)}
          </ul>
        </Panel>

        <Panel className="lg:col-span-4">
          <PanelHeader icon={<Compass />} kicker="资产观察" title="关注列表" />
          <div className="space-y-2 px-5 pb-5">
            <Link
              href={`/research/${DEMO_SYMBOL}`}
              className="group block rounded-xl border border-line-soft bg-surface-2/50 px-3.5 py-3 transition-colors hover:border-brand/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold">沪深300ETF</span>
                    <SourceBadge isDemo={snap.data ? snap.data.isDemo : null} demoLabel="演示" liveLabel="真实" />
                  </div>
                  <div className="num mt-0.5 text-[11.5px] text-faint">{DEMO_SYMBOL}</div>
                </div>
                <div className="text-right">
                  <div className="num text-[16px] font-medium">{snap.data ? formatNumber(snap.data.last, 3) : "—"}</div>
                  <div className={cn("num text-[11.5px]", (snap.data?.changePct ?? 0) >= 0 ? "text-up" : "text-down")}>
                    {snap.data ? formatSigned(snap.data.changePct, 2, "%") : "—"}
                  </div>
                </div>
              </div>
              <div className="mt-2 h-10">
                {sparkVals.length ? <Sparkline values={sparkVals} height={40} /> : <Skeleton className="h-10" />}
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-faint">
                <span>{snap.data && !snap.data.isDemo ? "近 3 月前复权日线" : "近 3 月合成序列"}</span>
                <span className="inline-flex items-center gap-0.5 text-brand opacity-0 transition-opacity group-hover:opacity-100">
                  研究 <ArrowUpRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
            {SYMBOL_DIRECTORY.filter((s) => !s.supported)
              .slice(0, 3)
              .map((s) => (
                <Link
                  key={s.symbol}
                  href={`/research/${s.symbol}`}
                  className="flex items-center justify-between rounded-xl border border-dashed border-line-soft px-3.5 py-2.5 transition-colors hover:border-line"
                >
                  <div>
                    <div className="text-[13px] text-fg-2">{s.name}</div>
                    <div className="num text-[11px] text-faint">{s.symbol}</div>
                  </div>
                  <span className="text-[11px] text-faint">{live && s.symbol.match(/^(51|15)/) ? "可研究 · 点击查看真实行情" : "数据未接入 · 不显示价格"}</span>
                </Link>
              ))}
          </div>
        </Panel>

        <Panel className="lg:col-span-4">
          <PanelHeader
            icon={<ListTodo />}
            kicker="研究入口"
            title="为你排好的研究任务"
            actions={tasks.length > 0 && <span className="num text-[11.5px] text-faint">{done.size}/{tasks.length}</span>}
          />
          <ul className="space-y-2 px-5 pb-5">
            {tasks.length === 0
              ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[58px]" />)
              : tasks.map((t, i) => {
                  const isDone = done.has(t.id);
                  return (
                    <motion.li layout key={t.id} className="flex items-stretch gap-2">
                      <button
                        type="button"
                        aria-pressed={isDone}
                        aria-label={isDone ? `取消标记：${t.title}` : `标记已完成：${t.title}`}
                        onClick={() =>
                          setDone((d) => {
                            const n = new Set(d);
                            if (n.has(t.id)) n.delete(t.id);
                            else n.add(t.id);
                            return n;
                          })
                        }
                        className={cn(
                          "grid w-8 shrink-0 place-items-center rounded-lg border transition-colors",
                          isDone ? "border-teal/40 bg-teal-soft text-teal" : "border-line-soft text-faint hover:border-line",
                        )}
                      >
                        {isDone ? <Check className="h-4 w-4" /> : <span className="num text-[11px]">{i + 1}</span>}
                      </button>
                      <Link
                        href={t.href}
                        className={cn(
                          "group min-w-0 flex-1 rounded-xl border border-line-soft bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-brand/40",
                          isDone && "opacity-55",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-[13px] font-medium", isDone && "line-through")}>{t.title}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                        </div>
                        <div className="mt-0.5 truncate text-[11.5px] text-muted">{t.hint}</div>
                      </Link>
                    </motion.li>
                  );
                })}
          </ul>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-soft px-4 py-3 text-[12px] text-muted">
        <Sparkles className="h-3.5 w-3.5 text-brand" />
        想看个性化的差异？在顶部切换画像 A / B —— 简报顺序、风险等级、研究任务与目标卡会同时变化，事实指纹保持不变。
      </div>
    </div>
  );
}
