import type { SymbolMatch } from "@/types/market";

export const DEMO_SYMBOL = "510300.SH";

/**
 * 可检索标的目录。
 * - 演示模式：只有 510300.SH 有（合成）数据，其余标的诚实显示「未接入」。
 * - 扶摇模式：ETF 可通过真实接口研究；个股不在 /api/fund 能力范围内，接口会返回 3004。
 * trackingIndex 为静态参考信息（待数据源核验），未知时为 null。
 */
export const SYMBOL_DIRECTORY: (SymbolMatch & { kind: "ETF" | "STOCK"; trackingIndex: string | null })[] = [
  { symbol: DEMO_SYMBOL, name: "沪深300ETF", kind: "ETF", trackingIndex: "沪深300", aliases: ["510300", "沪深300", "300etf", "hs300", "沪深 300", "510300.sh"], supported: true, note: "第一迭代合成演示案例" },
  { symbol: "510500.SH", name: "中证500ETF", kind: "ETF", trackingIndex: "中证500", aliases: ["510500", "中证500", "500etf"], supported: false, note: "第二迭代接入真实数据后开放" },
  { symbol: "159915.SZ", name: "创业板ETF", kind: "ETF", trackingIndex: "创业板指", aliases: ["159915", "创业板"], supported: false, note: "第二迭代接入真实数据后开放" },
  { symbol: "511010.SH", name: "国债ETF", kind: "ETF", trackingIndex: null, aliases: ["511010", "国债"], supported: false, note: "第二迭代接入真实数据后开放" },
  { symbol: "600519.SH", name: "贵州茅台", kind: "STOCK", trackingIndex: null, aliases: ["600519", "茅台"], supported: false, note: "个股研究暂未开放" },
];
