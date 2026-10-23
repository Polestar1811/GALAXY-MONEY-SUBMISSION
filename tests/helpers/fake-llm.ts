import type { LLMProvider, LLMRequest, LLMResponse } from "@/lib/llm/provider";

/** 测试替身：按请求内容返回预设 JSON 的模型（Mock，不计入真实 LLM 验证）。 */
export function fakeLLM(respond: (req: LLMRequest, call: number) => unknown | Promise<unknown>): LLMProvider & { calls: LLMRequest[] } {
  const calls: LLMRequest[] = [];
  return {
    model: "fake-model",
    calls,
    async complete(req: LLMRequest): Promise<LLMResponse> {
      calls.push(req);
      const out = await respond(req, calls.length);
      if (out instanceof Error) throw out;
      return { content: typeof out === "string" ? out : JSON.stringify(out), model: "fake-model", latencyMs: 1, firstChunkMs: null, usage: { promptTokens: null, completionTokens: null, reasoningTokens: null } };
    },
  };
}

export const userPayload = (req: LLMRequest) => JSON.parse(req.messages.find((m) => m.role === "user")!.content);
