import { describe, expect, it } from "vitest";
import { extractJson, isLLMConfigured, LLMError, OpenAICompatibleProvider, type LLMConfig } from "@/lib/llm/provider";

const base: LLMConfig = { apiKey: "sk-test-0000000000", baseUrl: "https://llm.example.test/v1", model: "test-model", timeoutMs: 2000, maxTokens: 500, jsonMode: true };

function mock(handler: (body: Record<string, unknown>, headers: Headers) => Response | Promise<Response>) {
  const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), body, headers });
    return handler(body, headers);
  }) as typeof fetch;
  return { impl, calls };
}
const ok = (content: string) => new Response(JSON.stringify({ model: "test-model-2026", choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });

describe("OpenAI 兼容 LLM Provider（Mock）", () => {
  it("按配置调用 /chat/completions，携带 Bearer 与模型名，并请求 JSON 输出", async () => {
    const { impl, calls } = mock(() => ok('{"a":1}'));
    const r = await new OpenAICompatibleProvider({ ...base, fetchImpl: impl }).complete({ messages: [{ role: "user", content: "hi" }], json: true });
    expect(r.content).toBe('{"a":1}');
    expect(r.model).toBe("test-model-2026");
    expect(calls[0].url).toBe("https://llm.example.test/v1/chat/completions");
    expect(calls[0].headers.get("authorization")).toBe("Bearer sk-test-0000000000");
    expect(calls[0].body.model).toBe("test-model");
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
  });

  it("服务商不支持 response_format 时只降级重试一次", async () => {
    const { impl, calls } = mock((body) =>
      body.response_format ? new Response('{"error":{"message":"response_format is not supported"}}', { status: 400 }) : ok("{}"),
    );
    await new OpenAICompatibleProvider({ ...base, fetchImpl: impl }).complete({ messages: [], json: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].body.response_format).toBeUndefined();
  });

  it("错误映射：401/403 → UNAUTHORIZED，429 → RATE_LIMITED，500 → UPSTREAM_ERROR，空内容 / 非 JSON → MALFORMED", async () => {
    const run = (res: () => Response) => new OpenAICompatibleProvider({ ...base, fetchImpl: mock(res).impl }).complete({ messages: [] });
    await expect(run(() => new Response("no", { status: 401 }))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(run(() => new Response("no", { status: 403 }))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(run(() => new Response("slow down", { status: 429 }))).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(run(() => new Response("boom", { status: 500 }))).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
    await expect(run(() => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] })))).rejects.toMatchObject({ code: "MALFORMED" });
    await expect(run(() => new Response("<html>"))).rejects.toMatchObject({ code: "MALFORMED" });
  });

  it("超时与取消", async () => {
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abort"))))) as unknown as typeof fetch;
    await expect(new OpenAICompatibleProvider({ ...base, timeoutMs: 20, fetchImpl: hang }).complete({ messages: [] })).rejects.toMatchObject({ code: "TIMEOUT" });
    const ctrl = new AbortController();
    const p = new OpenAICompatibleProvider({ ...base, fetchImpl: hang }).complete({ messages: [], signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: "CANCELLED" });
  });

  // 真实验收发现：DeepSeek 先返回响应头、再长时间生成正文。延迟与超时都必须覆盖正文读取。
  const slowBody = (delayMs: number, content = "{}") =>
    new Response(
      new ReadableStream({
        start(c) {
          setTimeout(() => {
            c.enqueue(new TextEncoder().encode(JSON.stringify({ choices: [{ message: { content } }] })));
            c.close();
          }, delayMs);
        },
      }),
      { status: 200 },
    );

  it("延迟统计包含响应体生成时间", async () => {
    const r = await new OpenAICompatibleProvider({ ...base, fetchImpl: mock(() => slowBody(80)).impl }).complete({ messages: [] });
    expect(r.latencyMs).toBeGreaterThanOrEqual(70);
  });

  it("超时同样覆盖响应头之后的正文读取", async () => {
    const impl = ((_: unknown, init?: RequestInit) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(c) {
              init?.signal?.addEventListener("abort", () => c.error(new Error("aborted")));
            },
          }),
          { status: 200 },
        ),
      )) as unknown as typeof fetch;
    await expect(new OpenAICompatibleProvider({ ...base, timeoutMs: 30, fetchImpl: impl }).complete({ messages: [] })).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("推理模型额度耗尽导致正文为空时给出明确提示", async () => {
    const res = () => new Response(JSON.stringify({ choices: [{ message: { content: "", reasoning_content: "..." }, finish_reason: "length" }] }));
    await expect(new OpenAICompatibleProvider({ ...base, fetchImpl: mock(res).impl }).complete({ messages: [] })).rejects.toThrow(/LLM_MAX_TOKENS/);
  });

  it("流式响应：累积正文、只计数推理内容、上报真实进度与 usage", async () => {
    const sse = (chunks: unknown[]) =>
      new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
    const { impl, calls } = mock(() =>
      sse([
        { model: "m-stream", choices: [{ delta: { reasoning_content: "思考的内容不应出现在结果里" } }] },
        { choices: [{ delta: { content: '{"ok":' } }] },
        { choices: [{ delta: { content: "true}" }, finish_reason: "stop" }] },
        { choices: [], usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 30 } } },
      ]),
    );
    const progress: number[] = [];
    const r = await new OpenAICompatibleProvider({ ...base, stream: true, fetchImpl: impl }).complete({ messages: [], onProgress: (p) => progress.push(p.reasoningChars) });
    expect(calls[0].body.stream).toBe(true);
    expect(r.content).toBe('{"ok":true}');
    expect(JSON.stringify(r)).not.toContain("思考的内容");
    expect(r.model).toBe("m-stream");
    expect(r.usage).toEqual({ promptTokens: 100, completionTokens: 50, reasoningTokens: 30 });
    expect(r.firstChunkMs).not.toBeNull();
  });

  it("可按调用覆盖模型（规划阶段使用独立模型）", async () => {
    const { impl, calls } = mock(() => ok("{}"));
    const p = new OpenAICompatibleProvider({ ...base, plannerModel: "fast-model", fetchImpl: impl });
    expect(p.plannerModel).toBe("fast-model");
    await p.complete({ messages: [], model: p.plannerModel });
    expect(calls[0].body.model).toBe("fast-model");
  });

  it("未配置时不发起请求", async () => {
    const { impl, calls } = mock(() => ok("{}"));
    await expect(new OpenAICompatibleProvider({ ...base, apiKey: null, fetchImpl: impl }).complete({ messages: [] })).rejects.toBeInstanceOf(LLMError);
    expect(calls).toHaveLength(0);
    expect(isLLMConfigured({ ...base, model: null })).toBe(false);
  });

  it("extractJson 容忍代码块包裹，拒绝无 JSON 的文本", () => {
    expect(extractJson('```json\n{"x": [1]}\n```')).toEqual({ x: [1] });
    expect(extractJson('说明文字 {"y":2} 结尾')).toEqual({ y: 2 });
    expect(() => extractJson("没有 JSON")).toThrow(LLMError);
  });
});
