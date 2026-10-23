import type { SimulateMode } from "@/types/research";
import { getMarketDataProvider } from "@/lib/providers";
import { DemoResearchService } from "./demo-research-service";
import type { ResearchService } from "./types";

/**
 * 研究服务工厂。第二迭代在此根据 RESEARCH_SERVICE=llm 返回 LLMResearchService：
 * 规划子任务 → 调用 MarketDataProvider / iFinD MCP → 结构化输出 ResearchResult。
 */
export function getResearchService(simulate: SimulateMode = "none"): ResearchService {
  const provider = getMarketDataProvider(simulate);
  const kind = process.env.RESEARCH_SERVICE ?? "demo-rules";
  switch (kind) {
    // case "llm": return new LLMResearchService(provider, llmClient);  // 第二迭代
    case "demo-rules":
    default:
      return new DemoResearchService(provider);
  }
}
