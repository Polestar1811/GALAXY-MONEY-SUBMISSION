import { logEvent } from "@/lib/server/log";

/**
 * 服务端 LLM Provider 抽象。当前实现兼容 OpenAI Chat Completions 协议
 * （POST {LLM_BASE_URL}/chat/completions），可对接任意兼容服务商；不硬编码服务商、模型或密钥。
 *
 * 第三迭代：默认使用流式响应（SSE），用于向用户展示真实的生成进度（已接收字符数），
 * 推理模型的 reasoning_content 只计数，从不保存或展示。服务商返回非流式 JSON 时自动按普通响应解析。
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProgress {
  /** 推理阶段（reasoning_content）已接收的字符数 —— 只计数，不保留内容。 */
  reasoningChars: number;
  /** 正文（content）已接收的字符数。 */
  contentChars: number;
  elapsedMs: number;
}

export interface LLMRequest {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  /** 请求 JSON 输出（response_format=json_object）；服务商不支持时自动降级一次。 */
  json?: boolean;
  signal?: AbortSignal;
  /** 覆盖默认模型（例如规划阶段使用更快的模型）。 */
  model?: string;
  /** 流式进度回调（约每秒一次）。 */
  onProgress?: (p: LLMProgress) => void;
  /** 合并进请求体的服务商扩展参数（如思考模式开关）；覆盖配置中的 extraBody。 */
  extraBody?: Record<string, unknown> | null;
}

export interface LLMUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  /** 推理 token（服务商在 completion_tokens_details.reasoning_tokens 中返回时）。 */
  reasoningTokens: number | null;
}

export interface LLMResponse {
  content: string;
  model: string;
  latencyMs: number;
  /** 首个流式数据块到达的时间（毫秒）；非流式为 null。 */
  firstChunkMs: number | null;
  usage: LLMUsage;
}

export type LLMErrorCode = "NOT_CONFIGURED" | "UNAUTHORIZED" | "RATE_LIMITED" | "TIMEOUT" | "UPSTREAM_ERROR" | "MALFORMED" | "CANCELLED" | "BAD_REQUEST";

export class LLMError extends Error {
  constructor(
    public code: LLMErrorCode,
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export interface LLMConfig {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  /** 规划阶段可选的独立模型；未设置时与 model 相同。 */
  plannerModel?: string | null;
  timeoutMs: number;
  maxTokens: number;
  jsonMode: boolean;
  /** 是否使用流式响应（默认开启；LLM_STREAM=off 关闭）。 */
  stream?: boolean;
  /**
   * 合并进请求体的服务商扩展参数（JSON）。保持供应商无关：例如 DeepSeek 的
   * {"thinking":{"type":"disabled"}} 或 {"reasoning_effort":"low"}，由环境变量配置，不写死在代码里。
   */
  extraBody?: Record<string, unknown> | null;
  plannerExtraBody?: Record<string, unknown> | null;
  fetchImpl?: typeof fetch;
}

export const LLM_MAX_TOKENS_CAP = 8_000;
export const LLM_TIMEOUT_CAP_MS = 120_000;

export function llmConfigFromEnv(): LLMConfig {
  const v = (k: string) => process.env[k]?.trim() || null;
  return {
    apiKey: v("LLM_API_KEY"),
    baseUrl: v("LLM_BASE_URL")?.replace(/\/+$/, "") ?? null,
    model: v("LLM_MODEL"),
    plannerModel: v("LLM_PLANNER_MODEL"),
    // 单次调用预算的硬上限：环境变量只能在此范围内调整（每次研究最多 4 次调用）
    timeoutMs: Math.min(Number(process.env.LLM_TIMEOUT_MS) > 0 ? Number(process.env.LLM_TIMEOUT_MS) : 60_000, LLM_TIMEOUT_CAP_MS),
    maxTokens: Math.min(Number(process.env.LLM_MAX_TOKENS) > 0 ? Number(process.env.LLM_MAX_TOKENS) : 2000, LLM_MAX_TOKENS_CAP),
    jsonMode: process.env.LLM_JSON_MODE?.trim().toLowerCase() !== "off",
    stream: process.env.LLM_STREAM?.trim().toLowerCase() !== "off",
    extraBody: parseJsonObject("LLM_EXTRA_BODY"),
    plannerExtraBody: parseJsonObject("LLM_PLANNER_EXTRA_BODY"),
  };
}

function parseJsonObject(name: string): Record<string, unknown> | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    logEvent("llm.config.invalid_json", { name });
    return null;
  }
}

export function isLLMConfigured(cfg: LLMConfig = llmConfigFromEnv()): boolean {
  return !!(cfg.apiKey && cfg.baseUrl && cfg.model);
}

export interface LLMProvider {
  readonly model: string;
  /** 规划阶段使用的模型（可能与 model 不同）。 */
  readonly plannerModel?: string;
  /** 规划阶段的扩展参数（可能与回答阶段不同）。 */
  readonly plannerExtraBody?: Record<string, unknown> | null;
  complete(req: LLMRequest): Promise<LLMResponse>;
}

type ChatBody = {
  model?: string;
  choices?: { message?: { content?: unknown }; delta?: { content?: unknown; reasoning_content?: unknown }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } | null;
};

const usageOf = (u: ChatBody["usage"]): LLMUsage => ({
  promptTokens: u?.prompt_tokens ?? null,
  completionTokens: u?.completion_tokens ?? null,
  reasoningTokens: u?.completion_tokens_details?.reasoning_tokens ?? null,
});

export class OpenAICompatibleProvider implements LLMProvider {
  readonly model: string;
  readonly plannerModel: string;
  readonly plannerExtraBody: Record<string, unknown> | null;

  constructor(private cfg: LLMConfig = llmConfigFromEnv()) {
    this.model = cfg.model ?? "";
    this.plannerModel = cfg.plannerModel || this.model;
    this.plannerExtraBody = cfg.plannerExtraBody ?? cfg.extraBody ?? null;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const { apiKey, baseUrl, model } = this.cfg;
    if (!apiKey || !baseUrl || !model) {
      throw new LLMError("NOT_CONFIGURED", "未配置 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL，未调用任何模型。");
    }
    const useJson = req.json !== false && this.cfg.jsonMode;
    try {
      return await this.send(req, useJson);
    } catch (e) {
      // 少数兼容服务商不支持 response_format：只降级重试一次
      if (useJson && e instanceof LLMError && e.code === "BAD_REQUEST" && /response_format|json/i.test(e.message)) {
        logEvent("llm.json_mode_fallback", { model: req.model ?? model });
        return this.send(req, false);
      }
      throw e;
    }
  }

  private async send(req: LLMRequest, json: boolean): Promise<LLMResponse> {
    const { apiKey, baseUrl, timeoutMs } = this.cfg;
    const model = req.model || this.cfg.model!;
    const stream = this.cfg.stream !== false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onAbort = () => ctrl.abort();
    req.signal?.addEventListener("abort", onAbort, { once: true });
    const started = Date.now();

    let status = 0;
    let errorText = "";
    let result: { content: string; model: string; usage: LLMUsage; finishReason: string | null; firstChunkMs: number | null } | null = null;
    try {
      const res = await (this.cfg.fetchImpl ?? fetch)(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? this.cfg.maxTokens,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
          ...((req.extraBody !== undefined ? req.extraBody : this.cfg.extraBody) ?? {}),
        }),
        signal: ctrl.signal,
      });
      status = res.status;
      // 超时与取消覆盖完整响应（含流式正文）
      if (!res.ok) errorText = await res.text().catch(() => "");
      else if ((res.headers.get("content-type") ?? "").includes("text/event-stream") && res.body) result = await this.readStream(res.body, model, started, req.onProgress);
      else result = this.parseJson(await res.text(), model);
    } catch (e) {
      if (e instanceof LLMError) throw e;
      const cancelled = req.signal?.aborted;
      logEvent("llm.request.failed", { model, reason: cancelled ? "cancelled" : "timeout_or_network", ms: Date.now() - started });
      if (cancelled) throw new LLMError("CANCELLED", "请求已取消");
      throw new LLMError("TIMEOUT", `模型请求超时或网络不可达（>${timeoutMs}ms）`, true);
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener("abort", onAbort);
    }

    // 延迟在读完完整响应之后计算
    const latencyMs = Date.now() - started;
    logEvent("llm.request", { model, http: status, ms: latencyMs, stream: !!result?.firstChunkMs });

    if (status < 200 || status >= 300) {
      // 只截取错误摘要，不回显请求内容
      const brief = errorText.slice(0, 200).replace(/\s+/g, " ");
      if (status === 401 || status === 403) throw new LLMError("UNAUTHORIZED", `模型服务鉴权失败（HTTP ${status}）`);
      if (status === 429) throw new LLMError("RATE_LIMITED", "模型服务限流（HTTP 429），请稍后再试", true);
      if (status === 400 || status === 422) throw new LLMError("BAD_REQUEST", `模型服务拒绝请求（HTTP ${status}）：${brief}`);
      if (status === 408 || status === 504) throw new LLMError("TIMEOUT", `模型服务超时（HTTP ${status}）`, true);
      throw new LLMError("UPSTREAM_ERROR", `模型服务异常（HTTP ${status}）`, true);
    }
    const r = result!;
    if (!r.content.trim()) {
      if (r.finishReason === "length") {
        throw new LLMError("MALFORMED", "模型输出被截断（max_tokens 不足，推理模型可能在推理阶段耗尽额度），请调大 LLM_MAX_TOKENS");
      }
      throw new LLMError("MALFORMED", "模型响应中没有文本内容");
    }
    return { content: r.content, model: r.model, latencyMs, firstChunkMs: r.firstChunkMs, usage: r.usage };
  }

  private parseJson(text: string, model: string) {
    let b: ChatBody;
    try {
      b = JSON.parse(text) as ChatBody;
    } catch {
      throw new LLMError("MALFORMED", "模型服务返回的不是合法 JSON");
    }
    // 推理模型会把思考过程放在 reasoning_content 中：这里只读取最终 content，从不读取或展示推理内容
    const content = b.choices?.[0]?.message?.content;
    return {
      content: typeof content === "string" ? content : "",
      model: typeof b.model === "string" && b.model ? b.model : model,
      usage: usageOf(b.usage),
      finishReason: b.choices?.[0]?.finish_reason ?? null,
      firstChunkMs: null,
    };
  }

  /** 解析 SSE 流：累积 content，对 reasoning_content 只计数。 */
  private async readStream(body: ReadableStream<Uint8Array>, model: string, started: number, onProgress?: (p: LLMProgress) => void) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let content = "";
    let reasoningChars = 0;
    let usage: LLMUsage = { promptTokens: null, completionTokens: null, reasoningTokens: null };
    let finishReason: string | null = null;
    let actualModel = model;
    let firstChunkMs: number | null = null;
    let lastProgress = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstChunkMs === null) firstChunkMs = Date.now() - started;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let chunk: ChatBody;
        try {
          chunk = JSON.parse(data) as ChatBody;
        } catch {
          continue; // 忽略无法解析的单个数据块（如保活注释）
        }
        if (chunk.model) actualModel = chunk.model;
        if (chunk.usage) usage = usageOf(chunk.usage);
        const c = chunk.choices?.[0];
        if (c?.finish_reason) finishReason = c.finish_reason;
        if (typeof c?.delta?.content === "string") content += c.delta.content;
        if (typeof c?.delta?.reasoning_content === "string") reasoningChars += c.delta.reasoning_content.length;
      }
      const now = Date.now();
      if (onProgress && now - lastProgress > 900) {
        lastProgress = now;
        onProgress({ reasoningChars, contentChars: content.length, elapsedMs: now - started });
      }
    }
    return { content, model: actualModel, usage, finishReason, firstChunkMs };
  }
}

/** 从模型文本中提取 JSON（容忍 ```json 代码块包裹）。 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LLMError("MALFORMED", "模型输出中没有 JSON 对象");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new LLMError("MALFORMED", "模型输出的 JSON 无法解析");
  }
}

export function getLLMProvider(): LLMProvider | null {
  const cfg = llmConfigFromEnv();
  return isLLMConfigured(cfg) ? new OpenAICompatibleProvider(cfg) : null;
}
