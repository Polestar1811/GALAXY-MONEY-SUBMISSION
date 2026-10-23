/**
 * InvestLens by Galaxy 设计 Token（TypeScript 镜像，来源：Galaxy 官网设计系统）。
 * CSS 变量定义在 app/globals.css 的 @theme 中；图表等需要 JS 取色的地方从这里读取，保持单一来源。
 */
export const color = {
  bg: "#050505",
  bgDeep: "#030303",
  surface: "#0b0b0b",
  surface2: "#111111",
  surface3: "#191919",
  line: "#2a2a2b",
  lineSoft: "#1d1d1e",
  fg: "#f3f2ef",
  fg2: "#cfcecb",
  muted: "#a7a7a3",
  faint: "#747472",
  /** 主强调：Galaxy 象牙白 */
  brand: "#f3f2ef",
  brandStrong: "#ffffff",
  /** 功能色：已核验 / 真实数据 / 与你有关 */
  teal: "#7cc4b3",
  /** Galaxy 品牌红：只用于品牌句点 */
  galaxy: "#b4141e",
  ivory: "#efeee9",
  ink: "#171816",
  /** A 股惯例：红涨绿跌 */
  up: "#F0525C",
  down: "#22B573",
  warn: "#F2B544",
  risk: "#FF8A4C",
  danger: "#F0616D",
  info: "#6CB6FF",
} as const;

export const chart = {
  grid: "#1a1a1b",
  axis: "#747472",
  price: color.fg,
  priceFillTop: "rgba(243,242,239,0.14)",
  priceFillBottom: "rgba(243,242,239,0)",
  ma: color.teal,
  volume: "#262627",
  scenario: color.teal,
  scenarioAlt: color.risk,
} as const;
export const motion = {
  fast: 150,
  base: 200,
  slow: 250,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
} as const;

export const radius = { sm: 2, md: 3, lg: 4, xl: 6 } as const;

export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1440 } as const;
