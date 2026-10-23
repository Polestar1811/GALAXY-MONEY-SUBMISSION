"use client";

import type { MarketFact } from "@/types/market";
import type { AssetSnapshot } from "@/types/market";
import { Badge, SourceBadge } from "@/components/ui/badge";

/**
 * InvestLens 简明模式：用普通人能理解的话解释关键事实。
 * 只使用事实层中已有的数值（与专业模式同一份数据），未知就说未知；不预测、不建议。
 */
const yuan = (x: number) => `${Math.round(x).toLocaleString("zh-CN")} 元`;

function num(f: MarketFact | undefined): number | null {
  return f && typeof f.value === "number" && Number.isFinite(f.value) ? f.value : null;
}

export function simpleExplanations(facts: Map<string, MarketFact>, snap: AssetSnapshot | null) {
  const ret1y = num(facts.get("f-ret-1y"));
  const mdd3 = num(facts.get("f-mdd-3y"));
  const mdd1 = num(facts.get("f-mdd-1y"));
  const vol = num(facts.get("f-vol-1y"));
  const pe = num(facts.get("f-pe-pct"));
  const rows: { title: string; body: string; term: string; factIds: string[] }[] = [];

  rows.push({
    title: "它是什么",
    body: snap?.trackingIndex
      ? `${snap.name} 跟踪「${snap.trackingIndex}」指数：买入一份，相当于同时持有指数里的一篮子公司，而不是押注某一家。`
      : `${snap?.name ?? "这只 ETF"} 是在交易所买卖的指数基金，相当于同时持有一篮子资产。`,
    term: "ETF / 跟踪指数",
    factIds: ["f-index"],
  });
  rows.push({
    title: "过去一年",
    body:
      ret1y === null
        ? "过去一年的涨跌暂时无法计算（数据不足）。"
        : `过去一年价格${ret1y >= 0 ? "上涨" : "下跌"}了 ${Math.abs(ret1y).toFixed(1)}%：如果一年前投入 1 万元，现在大约是 ${yuan(10000 * (1 + ret1y / 100))}（未计费用）。这是过去的结果，不代表未来。`,
    term: "近 1 年区间涨跌",
    factIds: ["f-ret-1y"],
  });
  const mdd = mdd3 ?? mdd1;
  rows.push({
    title: "最难熬的时候",
    body:
      mdd === null
        ? "历史上最大的下跌幅度暂时无法计算。"
        : `过去${mdd3 !== null ? "三" : "一"}年里，从高点到低点最多跌过 ${Math.abs(mdd).toFixed(1)}%：如果恰好在高点投入 1 万元，账面最多曾变成约 ${yuan(10000 * (1 + mdd / 100))}。如果你到时需要用钱，可能只能在低点卖出。`,
    term: mdd3 !== null ? "最大回撤（3 年）" : "最大回撤（1 年）",
    factIds: [mdd3 !== null ? "f-mdd-3y" : "f-mdd-1y"],
  });
  rows.push({
    title: "平时波动大不大",
    body:
      vol === null
        ? "波动程度暂时无法计算。"
        : `一年里价格的起伏程度约为 ${vol.toFixed(1)}%，属于${vol < 10 ? "较小" : vol < 20 ? "中等" : "较大"}的波动——意味着${vol < 10 ? "大多数时候变化不大" : "一个月里看到几个百分点的涨跌很常见"}。`,
    term: "年化波动率",
    factIds: ["f-vol-1y"],
  });
  rows.push({
    title: "现在贵不贵",
    body:
      pe === null
        ? "估值位置暂时未知：数据源没有提供，或还没有接入。"
        : `它跟踪的指数，市盈率处在近 5 年的 ${pe.toFixed(0)}% 位置（越高说明相对过去越贵）。这只说明相对位置，不说明短期会涨还是会跌。`,
    term: "跟踪指数 PE 分位（5 年）",
    factIds: ["f-pe-pct"],
  });
  return rows;
}

export function SimpleSummary({ facts, snap }: { facts: Map<string, MarketFact>; snap: AssetSnapshot | null }) {
  const rows = simpleExplanations(facts, snap);
  return (
    <section aria-labelledby="h-simple" className="rounded-lg border border-line-soft bg-surface p-5 sm:p-6" data-testid="simple-summary">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="h-simple" className="text-[16px] font-medium text-fg">
          用大白话看懂它
        </h2>
        <SourceBadge isDemo={snap ? snap.isDemo : null} demoLabel="演示数据" liveLabel="真实数据 · 同花顺扶摇" />
      </div>
      <ul className="mt-4 grid gap-px overflow-hidden rounded-md border border-line-soft bg-line-soft md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.title} className="bg-bg p-4">
            <p className="text-[14px] font-medium text-fg">{r.title}</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">{r.body}</p>
            <Badge tone="neutral" className="mt-3">
              专业模式里叫：{r.term}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
