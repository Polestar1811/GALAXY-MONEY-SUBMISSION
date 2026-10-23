import type { BriefResult, ResearchRequest, ResearchResult } from "@/types/research";

/**
 * 研究服务契约。
 * 第一迭代：DemoResearchService —— 确定性规则（演示逻辑），不调用大模型。
 * 第二迭代：LLMResearchService —— 问题理解、子任务规划、工具调用（扶摇 / iFinD MCP），
 * 输出同一 ResearchResult 结构；事实层只能来自 MarketDataProvider，模型不得生成事实数值。
 */
export interface ResearchService {
  readonly engine: ResearchResult["engine"];
  research(req: ResearchRequest): Promise<ResearchResult>;
  brief(req: Omit<ResearchRequest, "question">): Promise<BriefResult>;
}
