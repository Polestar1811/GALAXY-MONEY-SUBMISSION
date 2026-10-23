/**
 * 情景模拟器（假设计算，不是预测或预期收益）。
 *
 * 终值   FV = P·(1+i)^N + m·((1+i)^N − 1)/i，  i = (1+r)^(1/12) − 1, N = 12·n（i = 0 时退化为 P + m·N）
 * 回撤   V_trough = (P + 已投入) · (1 − d)    —— 假设在投入完成后立即遇到回撤 d
 * 锁定损失 L = W · d / (1 − d)               —— 回撤低点取出 W 时，相对于未回撤时多卖出的份额价值
 */
export interface ScenarioInput {
  principal: number;
  /** 假设年化回报（%），可为负。 */
  annualReturn: number;
  years: number;
  /** 假设回撤幅度（%）。 */
  drawdown: number;
  /** 需要在回撤期间取出的金额。 */
  withdrawal: number;
  /** 每月追加投入。 */
  monthly: number;
}

export interface ScenarioResult {
  finalValue: number;
  totalContribution: number;
  troughValue: number;
  lockedLoss: number;
  unitsSoldPct: number;
  shortfall: number;
  path: { year: number; value: number; contributed: number }[];
}

export function simulateScenario(x: ScenarioInput): ScenarioResult {
  // 年化回报换算为等效月利率，保证无定投时 FV = P·(1+r)^n
  const i = (1 + x.annualReturn / 100) ** (1 / 12) - 1;
  const fv = (months: number) => {
    const g = (1 + i) ** months;
    const contrib = i === 0 ? x.monthly * months : (x.monthly * (g - 1)) / i;
    return x.principal * g + contrib;
  };
  const N = Math.round(x.years * 12);
  const totalContribution = x.principal + x.monthly * N;
  const d = Math.min(Math.max(x.drawdown / 100, 0), 0.95);
  const troughValue = x.principal * (1 - d);
  const payable = Math.min(x.withdrawal, troughValue);
  const lockedLoss = d >= 1 ? payable : (payable * d) / (1 - d);
  const unitsSoldPct = troughValue > 0 ? (payable / troughValue) * 100 : 0;
  const shortfall = Math.max(0, x.withdrawal - troughValue);

  // 短期限按月取点，长期限按年取点，保证曲线有足够分辨率
  const stepMonths = x.years <= 3 ? 1 : 12;
  const path = Array.from({ length: Math.floor(N / stepMonths) + 1 }, (_, k) => {
    const m = Math.min(k * stepMonths, N);
    return { year: Math.round((m / 12) * 100) / 100, value: Math.round(fv(m)), contributed: x.principal + x.monthly * m };
  });

  return { finalValue: fv(N), totalContribution, troughValue, lockedLoss, unitsSoldPct, shortfall, path };
}
