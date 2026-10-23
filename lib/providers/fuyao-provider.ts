import "server-only";
import type { Evidence } from "@/types/evidence";
import type {
  AssetSnapshot,
  DataSource,
  FinancialsSnapshot,
  HistoryPeriod,
  MarketFact,
  NewsItem,
  PriceHistory,
  PricePoint,
  SymbolMatch,
} from "@/types/market";
import { SYMBOL_DIRECTORY } from "@/lib/demo-data/symbols";
import { annualizedVol, maxDrawdown, periodReturn, round, type RawBar } from "@/lib/demo-data/series";
import { isStale, isUnfinishedTodayBar, shanghaiDate, shanghaiDateTime } from "@/lib/time";
import {
  FUYAO_DOCS,
  fuyaoConfigFromEnv,
  fuyaoGet,
  historyDataSchema,
  indicatorsDataSchema,
  newsDataSchema,
  profileDataSchema,
  snapshotDataSchema,
  type FuyaoConfig,
  type HistoryData,
  type IndicatorsData,
  type NewsData,
  type ProfileData,
  type SnapshotData,
} from "./fuyao/client";
import { matchSymbols, normalizeSymbol } from "./demo-provider";
import { HISTORY_PERIODS, ProviderError, type MarketDataProvider } from "./types";

/**
 * 同花顺扶摇金融数据 Provider（服务端）。
 *
 * 必需能力（失败即报错，不降级）：
 *   GET /api/fund/market/snapshot     场内基金行情快照
 *   GET /api/fund/market/historical   ETF 前复权日线（interval 仅 1d，窗口 ≤ 5 自然年）
 * 可选能力（失败时记录在 degraded，对应事实保持「未知」）：
 *   GET /api/fund/profile/detail                  基金名称 / 规模 / 管理人
 *   GET /api/fund/performance/indicators-historical  跟踪指数 PE-TTM 五年分位
 *   GET /api/fund/news/article-list               基金资讯（外部不可信输入）
 *
 * 未接入、因此保持「未知」的字段：指数 PE 原值、股息率、费率（rate_info 结构未在文档中定义）、
 * 跟踪误差、行业权重、场内折溢价率。
 */

const THSCODE = /^\d{6}\.(SH|SZ|BJ)$/;
const CACHE_TTL_MS = 5 * 60_000;
const HISTORY_TTL_MS = 10 * 60_000;
const HISTORY_CALENDAR_DAYS = 3 * 366 + 45; // 覆盖 3 年（750 个交易日）+ MA20 预热

type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();

/**
 * 缓存进行中的请求（Promise），而不是请求结果：页面加载时 A/B 研究、快照、日线会并发请求同一资源，
 * 若各自发起上游请求，响应时间戳等字段会不同，导致 A/B 看到「不一致」的事实（真实验收中发现）。
 * 失败的请求不缓存。
 */
function cached<T>(key: string, fn: () => Promise<T>, ttlMs = CACHE_TTL_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

export function clearFuyaoCache() {
  cache.clear();
}

const apiSource = (id: string, name: string, url: string, note?: string): DataSource => ({ id, name, kind: "api", url, note });

export const FUYAO_SOURCES = {
  snapshot: apiSource("fuyao:fund.market.snapshot", "同花顺扶摇 · 场内基金行情快照", FUYAO_DOCS.snapshot),
  historical: apiSource("fuyao:fund.market.historical", "同花顺扶摇 · ETF 前复权日线", FUYAO_DOCS.historical, "前复权口径；interval=1d"),
  profile: apiSource("fuyao:fund.profile.detail", "同花顺扶摇 · 基金基本资料", FUYAO_DOCS.profile),
  indicators: apiSource("fuyao:fund.performance.indicators-historical", "同花顺扶摇 · 基金历史业绩指标", FUYAO_DOCS.indicators),
  news: apiSource("fuyao:fund.news.article-list", "同花顺扶摇 · 基金资讯列表", FUYAO_DOCS.news),
  computed: { id: "investlens:computed-from-fuyao", name: "由扶摇前复权日线计算", kind: "computed", url: FUYAO_DOCS.historical, note: "InvestLens 按公开公式计算" } as DataSource,
  notConnected: { id: "investlens:not-connected", name: "未接入数据源", kind: "reference", url: null, note: "当前版本未接入该字段，保持未知" } as DataSource,
  reference: { id: "static-reference", name: "跟踪指数（静态参考，待核验）", kind: "reference", url: null } as DataSource,
};

export interface FuyaoRawBundle {
  snapshot: { data: SnapshotData; requestId: string | null };
  history: { data: HistoryData; requestId: string | null; start: number; end: number };
  profile: { data: ProfileData; requestId: string | null } | null;
  indicators: { data: IndicatorsData; requestId: string | null } | null;
  news: { data: NewsData; requestId: string | null } | null;
  degraded: { capability: string; code: string; message: string }[];
}

function asOfLabel(ms: number | null, prefix = "截至"): string {
  if (ms === null) return "上游未提供有效时间";
  return `${prefix} ${shanghaiDateTime(ms)}${isStale(ms) ? "（可能已过期）" : ""}`;
}

/** 去除控制字符并截断外部文本，避免注入超长或异常内容。 */
export function sanitizeExternal(text: string | null, max = 280): string | null {
  if (text === null) return null;
  const clean = text.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

type Bar = RawBar & { dateMs: number; turnover: number | null };

/**
 * 交易时段内，日线最后一根是当天未完成的 K 线（其「收盘价」是盘中价）：
 * bars 只含已完成的 K 线，供统计、图表与回测使用；unfinished 单独返回，只用于判断快照时点。
 */
function toBars(h: HistoryData, now = Date.now()): { bars: Bar[]; skipped: number; unfinished: Bar | null } {
  const sorted = [...h.item].sort((a, b) => a.date_ms - b.date_ms);
  const valid = sorted.filter((x) => x.close_price !== null);
  const last = valid[valid.length - 1];
  const done = last && isUnfinishedTodayBar(last.date_ms, now) ? valid.slice(0, -1) : valid;
  const n = done.length;
  const toBar = (x: (typeof valid)[number], offset: number): Bar => ({ offset, dateMs: x.date_ms, close: x.close_price as number, volume: x.volume ?? 0, turnover: x.turnover });
  return {
    bars: done.map((x, i) => toBar(x, n - 1 - i)),
    skipped: sorted.length - valid.length,
    unfinished: done.length < valid.length ? toBar(last, -1) : null,
  };
}

/** 日线截至时间：剔除了当天未完成的 K 线时，取最后一根已完成 K 线的日期，而不是接口响应时间。 */
function barsAsOf(h: HistoryData, t: ReturnType<typeof toBars>): number | null {
  if (t.unfinished) return t.bars.length ? t.bars[t.bars.length - 1].dateMs : null;
  return h.timestamp ?? (t.bars.length ? t.bars[t.bars.length - 1].dateMs : null);
}

const withUnfinished = (t: ReturnType<typeof toBars>) => (t.unfinished ? [...t.bars, t.unfinished] : t.bars);

/**
 * 快照时点。实测：快照的 data.timestamp 是接口响应时间（随请求变化，收盘后仍逐秒增长），
 * 不是成交时间。因此用日线确定行情所属交易日：快照价等于最新日线收盘价时，视为该交易日收盘；
 * 否则如实标注「获取于 …（非成交时间）」。
 *
 * label 用于事实层（收盘后不含获取时刻）：获取时刻不是事实的一部分，且多实例部署中 A / B
 * 两次请求可能由不同实例在不同时刻获取，若写入事实会让相同的收盘事实被判为「不一致」（公网验收发现）。
 * displayLabel 用于页面顶部的行情快照，保留获取时刻。
 */
export function snapshotTiming(lastPrice: number | null, fetchedMs: number | null, bars: { dateMs: number; close: number }[]) {
  const lastBar = bars.length ? bars[bars.length - 1] : null;
  const fetched = fetchedMs === null ? "" : ` · 快照获取于 ${shanghaiDateTime(fetchedMs)}`;
  // 交易时段内日线的最后一根是当天未完成的 K 线：价格相同也不是收盘价，按盘中快照处理
  if (lastBar && lastPrice !== null && Math.abs(lastBar.close - lastPrice) < 1e-9 && !isUnfinishedTodayBar(lastBar.dateMs, fetchedMs ?? Date.now())) {
    const label = `最新交易日 ${shanghaiDate(lastBar.dateMs)} 收盘`;
    return { asOfMs: lastBar.dateMs, label, displayLabel: `${label}${fetched}`, stale: isStale(lastBar.dateMs) };
  }
  if (fetchedMs === null) return { asOfMs: null, label: "上游未提供时间", displayLabel: "上游未提供时间", stale: false };
  // 盘中快照：只能精确到获取日期，时点为获取时间而非成交时间；两次获取的价格本身可能不同，如实保留获取时刻
  const day = Date.parse(`${shanghaiDate(fetchedMs)}T00:00:00+08:00`);
  const label = `快照获取于 ${shanghaiDateTime(fetchedMs)}（接口时间为响应时间，非成交时间）`;
  return { asOfMs: day, label, displayLabel: label, stale: false };
}

/** 把原始响应映射成事实层、证据与资讯 —— 纯函数，便于测试。 */
export function buildFinancials(symbol: string, raw: FuyaoRawBundle): FinancialsSnapshot {
  const snap = raw.snapshot.data.item[0];
  const snapTs = raw.snapshot.data.timestamp;
  const tb = toBars(raw.history.data, snapTs ?? Date.now());
  const { bars, skipped } = tb;
  const histTs = barsAsOf(raw.history.data, tb);
  const timing = snapshotTiming(snap.last_price, snapTs, withUnfinished(tb));
  // 基金资料的 data.timestamp 为接口响应 / 组装时间（实测每次请求略有不同），只保留到日期
  const profTs = raw.profile?.data.timestamp ?? null;
  const profileDay = profTs === null ? null : new Date(Date.parse(`${shanghaiDate(profTs)}T00:00:00+08:00`)).toISOString();
  const profileLabel = profTs === null ? "不可用" : `资料获取于 ${shanghaiDate(profTs)}（接口未提供披露日期）`;
  const dir = SYMBOL_DIRECTORY.find((d) => d.symbol === symbol);
  const prof = raw.profile?.data.item[0] ?? null;
  const ind = raw.indicators?.data.item.filter((x) => x.track_index_pe_ttm_five_year_percentile !== null).sort((a, b) => b.date_ms - a.date_ms)[0] ?? null;

  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  const staleStatus = (ms: number | null, ok: MarketFact["status"]) => (isStale(ms) ? "stale" : ok);

  const fact = (f: Omit<MarketFact, "symbol" | "isDemo">): MarketFact => ({ symbol, isDemo: false, ...f });
  const unknown = (id: string, metric: string, label: string, unit: string, category: MarketFact["category"], why: string): MarketFact =>
    fact({ id, metric, label, value: null, unit, category, asOf: null, asOfLabel: "未接入", source: FUYAO_SOURCES.notConnected, status: "unknown", definition: why });

  const window = (days: number) => (bars.length >= days ? bars.slice(bars.length - days) : null);
  const y1 = window(250);
  // 3 个自然年约 727 个交易日；不足 700 个交易日时不计算 3 年回撤
  const y3 = bars.length >= 700 ? bars.slice(-750) : null;
  const m1 = window(21);
  const histAsOf = asOfLabel(histTs, "日线截至");
  const computed = (
    id: string,
    metric: string,
    label: string,
    v: number | null,
    def: string,
    category: MarketFact["category"],
    need: number,
  ): MarketFact =>
    v === null
      ? fact({ id, metric, label, value: null, unit: "%", category, asOf: iso(histTs), asOfLabel: histAsOf, source: FUYAO_SOURCES.computed, status: "unknown", definition: `${def} 历史数据不足 ${need} 个交易日，无法计算。` })
      : fact({ id, metric, label, value: round(v * 100), unit: "%", category, asOf: iso(histTs), asOfLabel: histAsOf, source: FUYAO_SOURCES.computed, status: staleStatus(histTs, "computed"), definition: def });

  const last20 = bars.slice(-20).map((b) => b.turnover).filter((x): x is number => x !== null);
  const avgTurnover = last20.length === 20 ? last20.reduce((a, b) => a + b, 0) / 20 : null;

  const facts: MarketFact[] = [
    dir?.trackingIndex
      ? fact({ id: "f-index", metric: "tracking_index", label: "跟踪指数", value: dir.trackingIndex, unit: "", category: "composition", asOf: null, asOfLabel: "静态参考", source: FUYAO_SOURCES.reference, status: "unverified", definition: "ETF 所跟踪的标的指数（静态参考，未经接口核验）。" })
      : unknown("f-index", "tracking_index", "跟踪指数", "", "composition", "当前未接入指数映射数据。"),
    snap.last_price === null
      ? unknown("f-last", "last_price", "最新价", "元", "price", "快照未返回最新价。")
      : fact({ id: "f-last", metric: "last_price", label: "最新价", value: snap.last_price, unit: "元", precision: 3, category: "price", asOf: iso(timing.asOfMs), asOfLabel: timing.label, source: FUYAO_SOURCES.snapshot, status: timing.stale ? "stale" : "ok", definition: "扶摇快照 last_price，原始货币计价。" }),
    snap.price_change_ratio_pct === null
      ? unknown("f-chg-1d", "change_pct_1d", "最新交易日涨跌幅", "%", "price", "快照未返回涨跌幅。")
      : fact({ id: "f-chg-1d", metric: "change_pct_1d", label: "最新交易日涨跌幅", value: round(snap.price_change_ratio_pct), unit: "%", category: "price", asOf: iso(timing.asOfMs), asOfLabel: timing.label, source: FUYAO_SOURCES.snapshot, status: timing.stale ? "stale" : "ok", definition: "扶摇快照 price_change_ratio_pct（百分数原值）。" }),
    computed("f-ret-1y", "return_1y", "近 1 年区间涨跌", y1 ? periodReturn(y1) : null, "近 250 个交易日前复权收盘价首尾变化。", "price", 250),
    computed("f-vol-1y", "volatility_1y", "年化波动率（1 年）", y1 ? annualizedVol(y1) : null, "近 250 个交易日日对数收益标准差 × √250（前复权）。", "risk", 250),
    computed("f-vol-1m", "volatility_1m", "年化波动率（20 日）", m1 ? annualizedVol(m1) : null, "近 21 个交易日日对数收益标准差 × √250（前复权）。", "risk", 21),
    computed("f-mdd-1y", "max_drawdown_1y", "最大回撤（1 年）", y1 ? maxDrawdown(y1) : null, "近 250 个交易日内从任一高点到其后低点的最大跌幅（前复权收盘价）。", "risk", 250),
    computed("f-mdd-3y", "max_drawdown_3y", "最大回撤（3 年）", y3 ? maxDrawdown(y3) : null, "近 3 年（约 750 个交易日）内的最大跌幅（前复权收盘价）。", "risk", 700),
    unknown("f-pe", "index_pe_ttm", "指数市盈率 PE-TTM", "倍", "valuation", "当前未接入跟踪指数 PE 原值。"),
    ind
      ? fact({ id: "f-pe-pct", metric: "index_pe_percentile_5y", label: "跟踪指数 PE 分位（5 年）", value: round(ind.track_index_pe_ttm_five_year_percentile as number, 1), unit: "%", precision: 1, category: "valuation", asOf: iso(ind.date_ms), asOfLabel: asOfLabel(ind.date_ms, "指标日"), source: FUYAO_SOURCES.indicators, status: staleStatus(ind.date_ms, "ok"), definition: "扶摇 track_index_pe_ttm_five_year_percentile：跟踪指数 PE-TTM 在近 5 年中的分位。" })
      : unknown("f-pe-pct", "index_pe_percentile_5y", "跟踪指数 PE 分位（5 年）", "%", "valuation", raw.indicators ? "接口未返回有效分位值。" : "估值指标接口不可用（见降级记录）。"),
    unknown("f-dy", "dividend_yield", "指数股息率", "%", "valuation", "当前未接入股息率数据。"),
    unknown("f-fee", "total_fee", "管理费 + 托管费", "% / 年", "cost", "基金资料 rate_info 的结构未在文档中定义，未解析，避免误读费率。"),
    unknown("f-te", "tracking_error", "年化跟踪误差", "%", "cost", "当前未接入跟踪误差数据。"),
    avgTurnover === null
      ? unknown("f-turnover", "avg_turnover_20d", "日均成交额（20 日）", "亿元", "liquidity", "日线成交额不足 20 个交易日。")
      : fact({ id: "f-turnover", metric: "avg_turnover_20d", label: "日均成交额（20 日）", value: round(avgTurnover / 1e8, 1), unit: "亿元", precision: 1, category: "liquidity", asOf: iso(histTs), asOfLabel: histAsOf, source: FUYAO_SOURCES.computed, status: staleStatus(histTs, "computed"), definition: "近 20 个交易日 turnover 均值 ÷ 1e8（文档未标注单位，按元换算为亿元）。" }),
    prof?.fund_scale == null
      ? unknown("f-aum", "aum", "基金规模", "亿元", "liquidity", raw.profile ? "基金资料未返回规模。" : "基金资料接口不可用（见降级记录）。")
      : fact({ id: "f-aum", metric: "aum", label: "基金规模", value: round(prof.fund_scale / 1e8, 1), unit: "亿元", precision: 1, category: "liquidity", asOf: profileDay, asOfLabel: profileLabel, source: FUYAO_SOURCES.profile, status: "ok", definition: "扶摇基金资料 fund_scale ÷ 1e8（文档未标注单位，按元换算为亿元）。接口未提供规模披露日期。" }),
    unknown("f-top-sector", "top_sector_weight", "第一大行业权重", "%", "composition", "当前未接入行业配置数据。"),
    unknown("f-premium", "premium_discount", "场内折溢价率", "%", "liquidity", "当前未接入折溢价数据。未知值不会被显示为 0。"),
  ];

  const snapReq = raw.snapshot.requestId;
  const histReq = raw.history.requestId;
  const ev = (e: Omit<Evidence, "symbol">): Evidence => ({ symbol, ...e });
  const evidence: Evidence[] = [
    ev({ id: "e-snapshot", kind: "market", title: "行情快照", factIds: ["f-last", "f-chg-1d"], source: FUYAO_SOURCES.snapshot, documentRef: "GET /api/fund/market/snapshot", field: "last_price, price_change_ratio_pct", value: snap.last_price, asOf: iso(timing.asOfMs), asOfLabel: timing.label, unit: "元 / %", status: timing.stale ? "conflict" : "verified", requestId: snapReq, url: FUYAO_DOCS.snapshot, limitations: timing.stale ? "行情所属交易日较早，可能不是最新行情。" : "快照接口的时间戳为响应时间；行情所属交易日由前复权日线确定。快照不代表盘中逐笔变化。" }),
    ev({ id: "e-price-series", kind: "market", title: `前复权日线（${bars.length} 个交易日）`, factIds: ["f-ret-1y"], source: FUYAO_SOURCES.historical, documentRef: "GET /api/fund/market/historical?interval=1d", field: "close_price, volume, turnover", value: bars.length, asOf: iso(histTs), asOfLabel: histAsOf, unit: "元", status: "verified", requestId: histReq, url: FUYAO_DOCS.historical, limitations: `前复权口径，历史价格会随除权调整。窗口 ${shanghaiDate(raw.history.start)} — ${shanghaiDate(raw.history.end)}${skipped ? `；${skipped} 根 K 线收盘价为空已跳过` : ""}。` }),
    ev({ id: "e-drawdown", kind: "computed", title: "回撤与波动（由日线计算）", factIds: ["f-mdd-1y", "f-mdd-3y", "f-vol-1y", "f-vol-1m"], source: FUYAO_SOURCES.computed, documentRef: "e-price-series", field: "close_price", value: null, asOf: iso(histTs), asOfLabel: histAsOf, unit: "%", status: "computed", requestId: histReq, url: null, limitations: "计算基于真实前复权日线；历史回撤与波动不代表未来最大损失。" }),
    ev({ id: "e-valuation", kind: ind ? "market" : "missing", title: "估值分位", factIds: ["f-pe-pct", "f-pe", "f-dy"], source: FUYAO_SOURCES.indicators, documentRef: "GET /api/fund/performance/indicators-historical", field: "track_index_pe_ttm_five_year_percentile", value: ind?.track_index_pe_ttm_five_year_percentile ?? null, asOf: ind ? iso(ind.date_ms) : null, asOfLabel: ind ? asOfLabel(ind.date_ms, "指标日") : "不可用", unit: "%", status: ind ? "verified" : "missing", requestId: raw.indicators?.requestId ?? null, url: FUYAO_DOCS.indicators, limitations: "仅有跟踪指数 PE-TTM 五年分位；PE 原值与股息率未接入。分位不说明短期方向。" }),
    ev({ id: "e-cost", kind: "missing", title: "费率与跟踪误差", factIds: ["f-fee", "f-te"], source: FUYAO_SOURCES.notConnected, documentRef: null, field: null, value: null, asOf: null, asOfLabel: "未接入", unit: "%", status: "missing", url: null, limitations: "未接入可解析的费率与跟踪误差数据，不能对持有成本做数值判断。" }),
    ev({ id: "e-liquidity", kind: prof ? "market" : "missing", title: "成交与规模", factIds: ["f-turnover", "f-aum", "f-premium"], source: FUYAO_SOURCES.profile, documentRef: "GET /api/fund/profile/detail · e-price-series", field: "fund_scale, turnover", value: prof?.fund_scale ?? null, asOf: profileDay, asOfLabel: profileLabel, unit: "亿元", status: "missing", requestId: raw.profile?.requestId ?? null, url: FUYAO_DOCS.profile, limitations: "折溢价率未接入；规模与成交额单位文档未标注，按元换算。" }),
    ev({ id: "e-composition", kind: "reference", title: "跟踪指数与行业构成", factIds: ["f-index", "f-top-sector"], source: FUYAO_SOURCES.reference, documentRef: null, field: null, value: dir?.trackingIndex ?? null, asOf: null, asOfLabel: "静态参考", unit: null, status: "unverified", url: null, limitations: "跟踪指数为静态参考；行业权重未接入。" }),
  ];
  if (prof) {
    evidence.push(ev({ id: "e-profile", kind: "market", title: `基金资料${prof.fund_name ? ` · ${sanitizeExternal(prof.fund_name, 40)}` : ""}`, factIds: ["f-aum"], source: FUYAO_SOURCES.profile, documentRef: "GET /api/fund/profile/detail", field: "fund_name, fund_scale, mgmt_name", value: sanitizeExternal(prof.mgmt_name, 40), asOf: profileDay, asOfLabel: profileLabel, unit: null, status: "verified", requestId: raw.profile!.requestId, url: FUYAO_DOCS.profile, limitations: "基金基本资料，不含业绩判断。" }));
  }

  const news: NewsItem[] = (raw.news?.data.item ?? []).slice(0, 6).map((n, i) => {
    const evidenceId = `e-news-${i + 1}`;
    const url = n.url && /^https?:\/\//i.test(n.url) ? n.url : null;
    evidence.push(ev({ id: evidenceId, kind: "news", title: sanitizeExternal(n.title, 80) ?? "（无标题）", factIds: [], source: { ...FUYAO_SOURCES.news, name: `${FUYAO_SOURCES.news.name}${n.source ? ` · ${sanitizeExternal(n.source, 30)}` : ""}` }, documentRef: `article:${n.id}`, field: "title, summary", value: null, asOf: iso(n.publish_time_ms), asOfLabel: n.publish_time_ms ? `发布于 ${shanghaiDateTime(n.publish_time_ms)}` : "发布时间未知", unit: null, status: "unverified", requestId: raw.news!.requestId, url, limitations: "外部资讯，观点未经核验，只能作为线索，不能作为事实依据。" }));
    return { id: n.id, title: sanitizeExternal(n.title, 120) ?? "", summary: sanitizeExternal(n.summary), source: sanitizeExternal(n.source, 40), url, publishedAt: iso(n.publish_time_ms), evidenceId };
  });

  return {
    symbol,
    facts,
    sectors: [],
    isDemo: false,
    source: FUYAO_SOURCES.snapshot,
    evidence,
    degraded: raw.degraded,
    news,
  };
}

export class FuyaoMarketDataProvider implements MarketDataProvider {
  readonly info = { id: "fuyao", label: "同花顺扶摇金融数据", isDemo: false } as const;

  constructor(
    private cfg: FuyaoConfig = fuyaoConfigFromEnv(),
    private signal?: AbortSignal,
  ) {}

  private check(symbol: string): string {
    const s = normalizeSymbol(symbol);
    if (!this.cfg.apiKey) throw new ProviderError("NOT_CONFIGURED", "未配置 FUYAO_API_KEY，未发起任何真实请求。请在 .env.local 中配置后重启服务。");
    if (!THSCODE.test(s)) throw new ProviderError("UNSUPPORTED_SYMBOL", `${s} 不是完整的 thscode（需保留交易所后缀，如 510300.SH）。`);
    const dir = SYMBOL_DIRECTORY.find((d) => d.symbol === s);
    if (dir && dir.kind !== "ETF") throw new ProviderError("UNSUPPORTED_SYMBOL", `${s} 为个股，当前只接入了场内 ETF 的行情能力。`);
    return s;
  }

  async search(query: string): Promise<SymbolMatch[]> {
    return matchSymbols(query).map((m) => {
      const d = SYMBOL_DIRECTORY.find((x) => x.symbol === m.symbol);
      const etf = d?.kind === "ETF";
      return { symbol: m.symbol, name: m.name, aliases: m.aliases, supported: etf, note: etf ? "扶摇真实行情" : "个股暂未开放" };
    });
  }

  private rawSnapshot(s: string) {
    return cached(`snap:${s}`, () => fuyaoGet(this.cfg, "/api/fund/market/snapshot", { thscode: s }, snapshotDataSchema, this.signal));
  }

  private rawHistory(s: string) {
    // 日线在交易日内变化很小，缓存 10 分钟；页面加载时即预热，提问时通常命中缓存
    return cached(`hist:${s}`, async () => {
      const end = Date.now();
      const start = end - HISTORY_CALENDAR_DAYS * 86_400_000;
      const r = await fuyaoGet(this.cfg, "/api/fund/market/historical", { thscode: s, interval: "1d", start, end }, historyDataSchema, this.signal, {
        timeouts: [this.cfg.historyTimeoutMs ?? Math.max(this.cfg.timeoutMs, 30_000)],
      });
      return { ...r, start, end };
    }, HISTORY_TTL_MS);
  }

  private async optional<T>(capability: string, fn: () => Promise<T>, degraded: FuyaoRawBundle["degraded"]): Promise<T | null> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ProviderError) {
        if (e.code === "CANCELLED") throw e;
        degraded.push({ capability, code: e.code, message: e.message });
        return null;
      }
      throw e;
    }
  }

  async getSnapshot(symbol: string): Promise<AssetSnapshot> {
    const s = this.check(symbol);
    const r = await this.rawSnapshot(s);
    const it = r.data.item.find((x) => x.thscode === s) ?? r.data.item[0];
    if (!it) throw new ProviderError("EMPTY", "扶摇：快照为空");
    const tb = toBars((await this.rawHistory(s)).data, r.data.timestamp ?? Date.now());
    const timing = snapshotTiming(it.last_price, r.data.timestamp, withUnfinished(tb));
    const dir = SYMBOL_DIRECTORY.find((d) => d.symbol === s);
    return {
      symbol: s,
      name: dir?.name ?? it.ticker ?? s,
      shortName: dir?.name ?? it.ticker ?? s,
      assetType: "ETF",
      exchange: s.endsWith(".SH") ? "上海证券交易所" : s.endsWith(".SZ") ? "深圳证券交易所" : "北京证券交易所",
      trackingIndex: dir?.trackingIndex ?? null,
      currency: "CNY",
      last: it.last_price,
      prevClose: it.prev_price,
      change: it.price_change,
      changePct: it.price_change_ratio_pct === null ? null : round(it.price_change_ratio_pct),
      isDemo: false,
      asOf: timing.asOfMs === null ? null : new Date(timing.asOfMs).toISOString(),
      asOfLabel: timing.displayLabel,
      source: FUYAO_SOURCES.snapshot,
    };
  }

  async getHistory(symbol: string, period: HistoryPeriod): Promise<PriceHistory> {
    const s = this.check(symbol);
    const def = HISTORY_PERIODS.find((p) => p.id === period) ?? HISTORY_PERIODS[3];
    const r = await this.rawHistory(s);
    const tb = toBars(r.data);
    const { bars, skipped } = tb;
    const take = bars.slice(Math.max(0, bars.length - def.days - 19));
    const startIdx = Math.max(0, take.length - def.days);
    const points: PricePoint[] = take.slice(startIdx).map((b, i) => {
      const idx = startIdx + i;
      const win = take.slice(Math.max(0, idx - 19), idx + 1);
      const ma = win.length === 20 ? win.reduce((a, x) => a + x.close, 0) / 20 : null;
      return {
        offset: b.offset,
        dateMs: b.dateMs,
        label: shanghaiDate(b.dateMs).slice(2),
        close: b.close,
        volume: b.volume,
        ma20: ma === null ? null : Math.round(ma * 1000) / 1000,
      };
    });
    const asOf = barsAsOf(r.data, tb);
    return {
      symbol: s,
      period: def.id,
      points,
      isDemo: false,
      source: FUYAO_SOURCES.historical,
      axisNote: `扶摇 ETF 前复权日线 · ${asOfLabel(asOf, "截至")}${skipped ? ` · ${skipped} 根空值 K 线已跳过` : ""}${bars.length < def.days ? ` · 仅有 ${bars.length} 个交易日` : ""}`,
    };
  }

  async getDailyCloses(symbol: string) {
    const s = this.check(symbol);
    const r = await this.rawHistory(s);
    const { bars } = toBars(r.data);
    return { symbol: s, points: bars.map((b) => ({ t: b.dateMs, close: b.close })), requestId: r.requestId };
  }

  /** 拉取全部原始数据（必需能力失败即抛错；可选能力记录降级）。 */
  async fetchRaw(symbol: string): Promise<FuyaoRawBundle> {
    const s = this.check(symbol);
    const degraded: FuyaoRawBundle["degraded"] = [];
    const [snapshot, history] = await Promise.all([this.rawSnapshot(s), this.rawHistory(s)]);
    if (!snapshot.data.item.length) throw new ProviderError("EMPTY", "扶摇：快照为空");
    const now = Date.now();
    const [profile, indicators, news] = await Promise.all([
      this.optional("基金基本资料", () => cached(`prof:${s}`, () => fuyaoGet(this.cfg, "/api/fund/profile/detail", { thscode: s }, profileDataSchema, this.signal)), degraded),
      this.optional("估值分位指标", () => cached(`ind:${s}`, () => fuyaoGet(this.cfg, "/api/fund/performance/indicators-historical", { thscode: s, start: now - 45 * 86_400_000, end: now }, indicatorsDataSchema, this.signal)), degraded),
      this.optional("基金资讯", () => cached(`news:${s}`, () => fuyaoGet(this.cfg, "/api/fund/news/article-list", { thscode: s, limit: 8 }, newsDataSchema, this.signal)), degraded),
    ]);
    return { snapshot, history, profile, indicators, news, degraded };
  }

  async getFinancials(symbol: string): Promise<FinancialsSnapshot> {
    const s = this.check(symbol);
    return buildFinancials(s, await this.fetchRaw(s));
  }
}
