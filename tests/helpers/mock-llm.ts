import type { LLMProvider, LLMRequest, LLMResponse } from "@/lib/llm/provider";

/**
 * 脚本化的 LLM 测试替身。按系统提示词区分「规划」与「回答」阶段。
 * Mock 调用不计入真实 LLM 验证。
 */
export type Stage = "plan" | "respond";

export function stageOf(req: LLMRequest): Stage {
  return req.messages[0]?.content.includes("研究计划") && !req.messages[0]?.content.includes("研究结论") ? "plan" : "respond";
}

export function researchInput(req: LLMRequest): Record<string, any> {
  const u = req.messages.find((m) => m.role === "user")!.content;
  const m = u.match(/<research_input>\n([\s\S]*)\n<\/research_input>/);
  return JSON.parse(m ? m[1] : u);
}

export const defaultPlan = {
  intent: "从长期持有角度识别沪深300ETF 的主要风险与证据",
  outOfScope: false,
  outOfScopeReason: null,
  focusTags: ["drawdown", "valuation"],
  steps: [
    { tool: "market_snapshot", purpose: "确认最新行情" },
    { tool: "price_history", purpose: "计算回撤与波动" },
    { tool: "fund_profile_valuation", purpose: "核实估值分位" },
  ],
};

/** 基于输入事实构造一份「诚实」的回答：数值取自事实层，证据引用有效。 */
export function honestAnswer(input: Record<string, any>) {
  const facts: any[] = input.facts;
  const mdd = facts.find((f) => f.factId === "f-mdd-3y");
  const vol = facts.find((f) => f.factId === "f-vol-1y");
  return {
    summary: `围绕你的问题，近 3 年最大回撤为 ${mdd.value}，年化波动率为 ${vol.value}。研究顺序按你的画像排列，是否投资由你决定。`,
    findings: [
      { kind: "fact", statement: `近 3 年最大回撤为 ${mdd.value}。`, evidenceIds: mdd.evidenceIds },
      { kind: "fact", statement: `1 年年化波动率为 ${vol.value}。`, evidenceIds: vol.evidenceIds },
      { kind: "inference", statement: "回撤主要来自持续性下行阶段。", evidenceIds: ["e-drawdown"] },
    ],
    risks: input.rule_risks.slice(0, 3).map((r: any) => ({ riskId: r.riskId, explanation: `${r.title}与你的画像相关。`, evidenceIds: ["e-drawdown"] })),
    uncertainties: ["历史数据不代表未来。"],
    informationGaps: ["费率数据未接入。"],
    followUps: ["回撤修复通常需要多久？", "估值分位的口径是什么？"],
  };
}

export class ScriptedLLM implements LLMProvider {
  readonly model = "mock-llm";
  calls: LLMRequest[] = [];
  constructor(private script: (req: LLMRequest, stage: Stage, n: number) => string | Error) {}
  async complete(req: LLMRequest): Promise<LLMResponse> {
    this.calls.push(req);
    const out = this.script(req, stageOf(req), this.calls.length);
    if (out instanceof Error) throw out;
    req.onProgress?.({ reasoningChars: 0, contentChars: out.length, elapsedMs: 1 });
    return { content: out, model: this.model, latencyMs: 1, firstChunkMs: null, usage: { promptTokens: 10, completionTokens: 20, reasoningTokens: null } };
  }
}

export const happyLLM = () =>
  new ScriptedLLM((req, stage) => (stage === "plan" ? JSON.stringify(defaultPlan) : JSON.stringify(honestAnswer(researchInput(req)))));
