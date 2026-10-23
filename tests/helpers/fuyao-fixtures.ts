/**
 * 扶摇接口的测试替身（Mock）。结构取自官方文档示例；数值为测试用确定性数据。
 * 注意：Mock 调用不计入真实接口验证。
 */
export const NOW = Date.UTC(2026, 9, 22, 7, 0, 0); // 2026-10-22 15:00 Asia/Shanghai

export function envelope(data: unknown, code = 0, message = "success") {
  return { code, message, request_id: `req-${Math.random().toString(16).slice(2, 10)}`, data };
}

export function snapshotData(overrides: Record<string, unknown> = {}, ts: number | null = NOW) {
  return {
    timestamp: ts,
    item: [
      {
        thscode: "510300.SH",
        ticker: "510300",
        last_price: 4.753,
        open_price: 4.775,
        high_price: 4.825,
        low_price: 4.724,
        prev_price: 4.838,
        price_change_ratio_pct: -1.756924,
        price_change: -0.085,
        price_amplitude_ratio_pct: 2.08764,
        volume: 1657822800,
        turnover: 7909234100,
        turnover_ratio_pct: 9.012068,
        ...overrides,
      },
    ],
  };
}

/** 生成 n 个确定性交易日（跳过周末）。 */
export function historyData(n = 760, endMs = NOW) {
  const items: { date_ms: number; open_price: number; high_price: number; low_price: number; close_price: number | null; volume: number; turnover: number }[] = [];
  let d = endMs;
  const dates: number[] = [];
  while (dates.length < n) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) dates.unshift(d);
    d -= 86_400_000;
  }
  dates.forEach((date_ms, i) => {
    const close = Math.round((4 + 0.6 * Math.sin(i / 60) + i * 0.0005) * 1000) / 1000;
    items.push({ date_ms, open_price: close, high_price: close + 0.02, low_price: close - 0.02, close_price: close, volume: 3e8 + i * 1000, turnover: 1.5e9 + i * 1e5 });
  });
  return { timestamp: endMs, thscode: "510300.SH", interval: "1d", adjust: null, item: items };
}

export const profileData = () => ({
  timestamp: NOW,
  item: [{ thscode: "510300.SH", fund_name: "沪深300ETF", estab_date: 1336000000000, mgmt_name: "测试基金管理有限公司", manager_name: "测试经理", fund_scale: 98765432100, unit_nav: 4.75, manager_info: [], trade_rule: [], rate_info: [] }],
});

export const indicatorsData = () => ({
  timestamp: NOW,
  item: [
    { date_ms: NOW - 86_400_000 * 2, rsi_pct: 50, donchian_channel: 0.4, track_index_pe_ttm_five_year_percentile: 58.2 },
    { date_ms: NOW - 86_400_000, rsi_pct: 51, donchian_channel: 0.41, track_index_pe_ttm_five_year_percentile: 61.3 },
  ],
});

export const newsData = (titles: string[] = ["沪深300ETF 份额变化", "宽基指数成交回暖"]) => ({
  timestamp: NOW,
  limit: 8,
  offset: null,
  has_more: false,
  item: titles.map((title, i) => ({
    id: `a-${i}`,
    content_type: "news",
    title,
    summary: `${title}的摘要`,
    source: "公开资讯",
    url: `https://news.example.com/a-${i}`,
    image_url: null,
    author: "编辑部",
    publish_time_ms: NOW - i * 3_600_000,
    top: false,
  })),
});

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** 按路径路由的 fetch mock，并记录调用。 */
export function routeFetch(routes: Record<string, Handler>) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const h = routes[url.pathname];
    if (!h) return json(envelope(null, 3001, "not found"));
    return h(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

export function happyRoutes(overrides: Partial<Record<string, Handler>> = {}): Record<string, Handler> {
  return {
    "/api/fund/market/snapshot": () => json(envelope(snapshotData())),
    "/api/fund/market/historical": () => json(envelope(historyData())),
    "/api/fund/profile/detail": () => json(envelope(profileData())),
    "/api/fund/performance/indicators-historical": () => json(envelope(indicatorsData())),
    "/api/fund/news/article-list": () => json(envelope(newsData())),
    ...overrides,
  } as Record<string, Handler>;
}
