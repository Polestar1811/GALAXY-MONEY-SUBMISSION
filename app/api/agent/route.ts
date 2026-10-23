import { z } from "zod";
import { parseProfile } from "@/lib/profile/schema";
import { getMarketDataProvider } from "@/lib/providers";
import { getLLMProvider } from "@/lib/llm/provider";
import { AgentError, runResearchAgent } from "@/lib/agent/research-agent";
import type { AgentEvent } from "@/lib/agent/schema";
import { badRequest } from "@/lib/api/respond";
import { logEvent } from "@/lib/server/log";
import { acquireAgentRun, checkAgentRate, isDenied, tooMany } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
// Vercel（Fluid compute，默认开启）：Hobby 上限 300 秒、Pro 默认 300 秒（文档 2026-08-24）。
// 研究流程每次最多 4 次模型调用；流式进度事件约每秒一次，兼作长连接心跳。
export const maxDuration = 300;

/** 问题 300 字、追问摘要 1200 字，加上画像与 JSON 结构，正常请求远小于此上限。 */
const MAX_BODY_CHARS = 8_000;

const bodySchema = z.object({
  symbol: z.string().min(1).max(20),
  question: z.string().min(1).max(300),
  profile: z.unknown().nullable(),
  snapshotId: z.string().max(80).nullish(),
  followUp: z.object({ question: z.string().max(300), summary: z.string().max(1200) }).nullish(),
});

/**
 * AI 研究接口：以 NDJSON 流返回阶段进度、工具调用状态与最终结果。
 * 画像只用于本次请求，服务端不存储；发给模型的只有最小必要字段。
 * 客户端断开连接（取消）会中止进行中的模型与数据请求。
 */
export async function POST(req: Request) {
  // 先计次再解析：格式错误的请求同样计入，避免用无效请求探测或消耗资源
  const limited = await checkAgentRate(req);
  if (limited) return tooMany(limited);

  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_CHARS) return badRequest("请求内容过长");
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(raw));
  } catch {
    return badRequest("请求格式不正确");
  }
  const profile = body.profile ? parseProfile(body.profile) : null;
  if (body.profile && !profile) return badRequest("画像数据未通过校验");

  // 只有即将调用模型的请求才占用每日预算与并发位
  const slot = await acquireAgentRun(req);
  if (isDenied(slot)) return tooMany(slot);

  const ctrl = new AbortController();
  req.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          /* 客户端已断开 */
        }
      };
      try {
        const result = await runResearchAgent(
          { symbol: body.symbol.toUpperCase(), question: body.question, profile, snapshotId: body.snapshotId, followUp: body.followUp },
          { provider: getMarketDataProvider("none", ctrl.signal), llm: getLLMProvider(), emit: send, signal: ctrl.signal },
        );
        send({ type: "result", result });
      } catch (e) {
        const code = e instanceof AgentError ? e.code : "INTERNAL";
        const message = e instanceof AgentError ? e.message : "研究服务内部错误";
        logEvent("agent.failed", { code, stage: e instanceof AgentError ? (e.stage ?? null) : null });
        send({ type: "error", code, message, stage: e instanceof AgentError ? e.stage : undefined });
      } finally {
        await slot.release();
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      }
    },
    cancel() {
      ctrl.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
