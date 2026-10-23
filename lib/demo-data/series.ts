/**
 * 合成价格序列生成器 —— 固定种子、完全确定、每次运行结果相同。
 * 这不是沪深300ETF 的真实历史行情，仅用于展示图表与研究交互。
 */

export const DEMO_TRADING_DAYS = 750; // ≈ 3 年
const SEED = 510574;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RawBar {
  offset: number;
  close: number;
  volume: number;
}

let cache: RawBar[] | null = null;

/** 生成 750 个合成交易日，offset 从 749（最早）到 0（最新）。 */
export function getDemoSeries(): RawBar[] {
  if (!cache) cache = generateSeries(SEED);
  return cache;
}

export function generateSeries(seed: number): RawBar[] {
  const rand = mulberry32(seed);
  const gauss = () => {
    // Box–Muller，确定性
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const bars: RawBar[] = [];
  let price = 3.86;
  for (let i = 0; i < DEMO_TRADING_DAYS; i++) {
    const offset = DEMO_TRADING_DAYS - 1 - i;
    // 分段漂移：上涨 → 深度回撤 → 修复 → 震荡上行，用于呈现真实感的回撤结构
    let drift = 0.0002;
    if (i > 160 && i < 300) drift = -0.0016;
    else if (i >= 300 && i < 420) drift = 0.0011;
    else if (i >= 420 && i < 560) drift = -0.0004;
    else if (i >= 560 && i < 690) drift = 0.0012;
    else if (i >= 690) drift = -0.0003;
    const vol = i > 160 && i < 300 ? 0.0145 : i >= 690 ? 0.0125 : 0.0095;
    const ret = drift + vol * gauss();
    price = Math.max(2.2, price * (1 + ret));
    const base = 9.5e6 + 3.2e6 * Math.sin(i / 37);
    const volume = Math.round(base * (1 + Math.abs(ret) * 38 + rand() * 0.35));
    bars.push({ offset, close: Math.round(price * 1000) / 1000, volume });
  }
  return bars;
}

export function sliceDays(days: number): RawBar[] {
  const s = getDemoSeries();
  return s.slice(Math.max(0, s.length - days));
}

export function maxDrawdown(bars: RawBar[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const b of bars) {
    peak = Math.max(peak, b.close);
    mdd = Math.min(mdd, b.close / peak - 1);
  }
  return mdd;
}

export function annualizedVol(bars: RawBar[]): number {
  if (bars.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) rets.push(Math.log(bars[i].close / bars[i - 1].close));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(250);
}

export function periodReturn(bars: RawBar[]): number {
  return bars[bars.length - 1].close / bars[0].close - 1;
}

export function round(n: number, d = 2): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
