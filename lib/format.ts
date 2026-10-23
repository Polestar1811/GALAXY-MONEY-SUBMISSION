import type { MarketFact } from "@/types/market";

export function formatNumber(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatSigned(n: number | null | undefined, digits = 2, suffix = ""): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const s = formatNumber(Math.abs(n), digits);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${s}${suffix}`;
}

export function factPrecision(f: MarketFact): number {
  if (f.precision !== undefined) return f.precision;
  return 2;
}

/** 事实值格式化：未知值显示「未知」，绝不显示为 0。 */
export function formatFact(f: MarketFact, withUnit = true): string {
  if (f.value === null) return "未知";
  if (typeof f.value === "string") return f.value;
  const v = formatNumber(f.value, factPrecision(f));
  if (!withUnit || !f.unit) return v;
  return f.unit.startsWith("%") ? `${v}${f.unit}` : `${v} ${f.unit}`;
}

export function formatCurrency(n: number, digits = 0): string {
  return `¥${formatNumber(n, digits)}`;
}

/** 以「万」为单位的简写，用于情景模拟器。 */
export function formatWan(n: number): string {
  if (Math.abs(n) >= 10000) return `${formatNumber(n / 10000, 2)} 万`;
  return formatNumber(n, 0);
}
