import type { DimensionId, FactKey, TraitKey } from "@/types/identity";

/**
 * 访谈可记录的信息目录 —— 模型提取的事实必须落在这里的取值范围内，否则丢弃。
 * 敏感字段（年龄、家庭、收入、资产、负债）一律使用区间与「不便透露」，不收集具体数额。
 */
export interface FactSpec {
  key: FactKey;
  label: string;
  dimension: DimensionId;
  sensitive: boolean;
  /** 文本型字段（只保存用户原话的简短摘录）。 */
  text?: boolean;
  values: { code: string; label: string }[];
}

const PREFER_NOT = { code: "prefer_not", label: "不便透露" };

export const FACT_SPECS: FactSpec[] = [
  {
    key: "ageBand",
    label: "年龄阶段",
    dimension: "lifeStage",
    sensitive: true,
    values: [
      { code: "under25", label: "25 岁以下" },
      { code: "25to34", label: "25–34 岁" },
      { code: "35to44", label: "35–44 岁" },
      { code: "45to54", label: "45–54 岁" },
      { code: "55to64", label: "55–64 岁" },
      { code: "65plus", label: "65 岁及以上" },
      PREFER_NOT,
    ],
  },
  {
    key: "dependents",
    label: "依赖你收入的家人",
    dimension: "lifeStage",
    sensitive: true,
    values: [
      { code: "none", label: "没有" },
      { code: "partner", label: "伴侣" },
      { code: "children", label: "子女" },
      { code: "parents", label: "父母" },
      { code: "multiple", label: "多位家人" },
      PREFER_NOT,
    ],
  },
  {
    key: "nearTermExpense",
    label: "未来三年的重要支出",
    dimension: "lifeStage",
    sensitive: false,
    values: [
      { code: "none", label: "暂无重要支出" },
      { code: "within1y", label: "一年内有重要支出" },
      { code: "1to3y", label: "一到三年内有重要支出" },
    ],
  },
  {
    key: "nearTermExpenseShare",
    label: "这笔钱中需要用于近期支出的部分",
    dimension: "capacity",
    sensitive: false,
    values: [
      { code: "none", label: "基本不需要" },
      { code: "small", label: "一小部分" },
      { code: "partial", label: "接近一半" },
      { code: "most", label: "大部分" },
    ],
  },
  { key: "lifeGoal", label: "希望财富带来的改变", dimension: "motivation", sensitive: false, text: true, values: [] },
  {
    key: "investAmount",
    label: "准备用于探索投资的资金",
    dimension: "capacity",
    sensitive: true,
    values: [
      { code: "lt10k", label: "1 万元以下" },
      { code: "10kto50k", label: "1–5 万元" },
      { code: "50kto200k", label: "5–20 万元" },
      { code: "200kto1m", label: "20–100 万元" },
      { code: "gt1m", label: "100 万元以上" },
      PREFER_NOT,
    ],
  },
  {
    key: "incomeSource",
    label: "主要收入来源",
    dimension: "capacity",
    sensitive: true,
    values: [
      { code: "salary", label: "工资" },
      { code: "business", label: "经营收入" },
      { code: "freelance", label: "自由职业 / 项目收入" },
      { code: "pension", label: "退休金" },
      { code: "none", label: "暂无收入" },
      { code: "other", label: "其他" },
      PREFER_NOT,
    ],
  },
  {
    key: "incomeStability",
    label: "收入稳定程度",
    dimension: "capacity",
    sensitive: true,
    values: [
      { code: "stable", label: "稳定" },
      { code: "mostly_stable", label: "大致稳定" },
      { code: "variable", label: "波动较大" },
      { code: "none", label: "目前没有收入" },
      PREFER_NOT,
    ],
  },
  {
    key: "reserveMonths",
    label: "无收入时储备可支撑的时间",
    dimension: "capacity",
    sensitive: true,
    values: [
      { code: "lt3", label: "不到 3 个月" },
      { code: "3to6", label: "3–6 个月" },
      { code: "6to12", label: "6–12 个月" },
      { code: "gt12", label: "12 个月以上" },
      PREFER_NOT,
    ],
  },
  {
    key: "debt",
    label: "负债与固定支出压力",
    dimension: "capacity",
    sensitive: true,
    values: [
      { code: "none", label: "没有负债" },
      { code: "manageable", label: "有负债，压力可控" },
      { code: "heavy", label: "负债压力较大" },
      PREFER_NOT,
    ],
  },
  {
    key: "motivation",
    label: "开始关注投资的原因",
    dimension: "motivation",
    sensitive: false,
    values: [
      { code: "growth", label: "让财富增长" },
      { code: "security", label: "获得安全感" },
      { code: "family", label: "照顾家庭" },
      { code: "retirement", label: "为退休做准备" },
      { code: "inflation", label: "担心存款贬值" },
      { code: "curiosity", label: "好奇、想学习" },
      { code: "peer", label: "身边人都在投资" },
      { code: "other", label: "其他" },
    ],
  },
  {
    key: "horizon",
    label: "预计动用这笔钱的时间",
    dimension: "time",
    sensitive: false,
    values: [
      { code: "lt1y", label: "1 年以内" },
      { code: "1to3y", label: "1–3 年" },
      { code: "3to5y", label: "3–5 年" },
      { code: "5to10y", label: "5–10 年" },
      { code: "gt10y", label: "10 年以上" },
    ],
  },
  {
    key: "expectedOutcome",
    label: "希望投资带来的结果",
    dimension: "motivation",
    sensitive: false,
    values: [
      { code: "preserve", label: "先保住本金" },
      { code: "beat_deposit", label: "比存款多一些" },
      { code: "steady_growth", label: "长期稳健增长" },
      { code: "high_growth", label: "追求较高增长" },
      { code: "double_fast", label: "希望短期内大幅增长（如一年翻倍）" },
    ],
  },
  {
    key: "timeCommitment",
    label: "愿意投入的学习与管理时间",
    dimension: "time",
    sensitive: false,
    values: [
      { code: "minimal", label: "几乎没有时间" },
      { code: "monthly", label: "每月看一次" },
      { code: "weekly", label: "每周花一些时间" },
      { code: "daily", label: "愿意每天关注" },
    ],
  },
  {
    key: "experience",
    label: "投资经验",
    dimension: "knowledge",
    sensitive: false,
    values: [
      { code: "none", label: "还没有投资过" },
      { code: "deposit_only", label: "只有存款、理财或货币基金" },
      { code: "funds", label: "买过基金或 ETF" },
      { code: "stocks", label: "交易过股票" },
      { code: "advanced", label: "较系统的投资经验或专业背景" },
    ],
  },
  {
    key: "lossImpact",
    label: "不影响生活的最大损失",
    dimension: "capacity",
    sensitive: false,
    values: [
      { code: "lt5", label: "5% 以内" },
      { code: "5to10", label: "5%–10%" },
      { code: "10to20", label: "10%–20%" },
      { code: "20to35", label: "20%–35%" },
      { code: "gt35", label: "35% 以上" },
      PREFER_NOT,
    ],
  },
  {
    key: "drawdownReaction",
    label: "短期下跌 20% 时的反应",
    dimension: "willingness",
    sensitive: false,
    values: [
      { code: "sell_all", label: "全部卖出，避免继续亏损" },
      { code: "sell_some", label: "卖出一部分" },
      { code: "hold", label: "按原计划持有" },
      { code: "buy_some", label: "考虑小幅加仓" },
      { code: "buy_more", label: "考虑大幅加仓" },
    ],
  },
  {
    key: "fomoReaction",
    label: "看到别人大涨而自己没参与时的感受",
    dimension: "behavior",
    sensitive: false,
    values: [
      { code: "calm", label: "比较平静" },
      { code: "slight", label: "有些在意" },
      { code: "strong", label: "很想马上跟进" },
    ],
  },
];

export const FACT_SPEC: Record<FactKey, FactSpec> = Object.fromEntries(FACT_SPECS.map((s) => [s.key, s])) as Record<FactKey, FactSpec>;
export const FACT_KEYS = FACT_SPECS.map((s) => s.key) as FactKey[];

export const TRAIT_LABELS: Record<TraitKey, string> = {
  lossAversion: "对损失比较敏感",
  chasingImpulse: "容易被短期上涨吸引",
  patience: "愿意长期等待",
  controlNeed: "希望自己掌控每个决定",
  overconfidence: "对收益的预期可能偏乐观",
};
export const TRAIT_KEYS = Object.keys(TRAIT_LABELS) as TraitKey[];

export function valueLabel(key: FactKey, value: string): string | null {
  const spec = FACT_SPEC[key];
  if (!spec) return null;
  if (spec.text) return value;
  return spec.values.find((v) => v.code === value)?.label ?? null;
}

export function isValidValue(key: FactKey, value: string): boolean {
  const spec = FACT_SPEC[key];
  if (!spec) return false;
  if (spec.text) return value.trim().length > 0 && value.length <= 80;
  return spec.values.some((v) => v.code === value);
}
