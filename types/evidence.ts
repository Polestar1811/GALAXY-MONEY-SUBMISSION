import type { DataSource } from "./market";

export type EvidenceStatus = "demo" | "computed" | "unverified" | "verified" | "missing" | "conflict";

/** 证据：把研究结论与具体事实字段、来源、时点、口径和限制绑定在一起。 */
export interface Evidence {
  id: string;
  title: string;
  /** 支撑的事实字段 id。 */
  factIds: string[];
  source: DataSource;
  /** 文档或数据集引用（非 URL 时使用）。 */
  documentRef: string | null;
  asOf: string | null;
  asOfLabel: string;
  unit: string | null;
  status: EvidenceStatus;
  /** 限制说明：这条证据不能证明什么。 */
  limitations: string;
  /** 第二迭代：证据所属标的、字段 / 接口、取值与原文链接。 */
  symbol?: string;
  field?: string | null;
  value?: string | number | null;
  url?: string | null;
  /** 上游请求追踪 ID（如扶摇 request_id），便于核查。 */
  requestId?: string | null;
  kind?: "market" | "computed" | "news" | "reference" | "missing";
}
