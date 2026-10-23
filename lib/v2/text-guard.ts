import { enforceCompliance, extractNumbers, numberIsKnown } from "@/lib/agent/guards";

/**
 * V2 文本护栏（人格叙述、研究路径理由共用）：
 * 1. 合规：删除买卖指令、收益承诺、确定性预测、目标价（沿用研究 Agent 的护栏，保留正常的拒绝说明）；
 * 2. 数字：句子中的数值必须出现在提供给模型的输入里，否则删除整句（模型不能编造金融数据）；
 * 3. 证券代码：删除 6 位证券代码样式的内容（具体资产只能来自真实数据层，不由模型给出）。
 */
export function numbersIn(text: string): number[] {
  return Array.from(text.matchAll(/\d+(?:\.\d+)?/g)).map((m) => Number(m[0]));
}

export interface GuardReport {
  removed: string[];
}

export function guardText(text: string, whitelist: number[], report: GuardReport): string {
  const parts = text.split(/(?<=[。！？!?；;\n])/);
  const kept = parts.filter((p) => {
    if (/(?<!\d)\d{6}(?:\.(?:SH|SZ|BJ))?(?!\d)/i.test(p)) {
      report.removed.push(`code: ${p.trim().slice(0, 40)}`);
      return false;
    }
    // 带金额单位的数字（如「6 万」「8000 元」）即使是小整数也必须出现在输入中
    const amounts = Array.from(p.matchAll(/(\d+(?:\.\d+)?)\s*(?:万|千|元|块)/g)).map((m) => m[1]);
    const bad = [...extractNumbers(p), ...amounts].filter((n) => !numberIsKnown(n, whitelist));
    if (bad.length) {
      report.removed.push(`number: ${p.trim().slice(0, 40)}`);
      return false;
    }
    return true;
  });
  const c = enforceCompliance(kept.join(""));
  report.removed.push(...c.removed);
  return c.text.trim();
}

export function guardList(items: string[], whitelist: number[], report: GuardReport, max: number, maxLen = 160): string[] {
  return items
    .map((s) => guardText(String(s).slice(0, maxLen), whitelist, report))
    .filter(Boolean)
    .slice(0, max);
}
