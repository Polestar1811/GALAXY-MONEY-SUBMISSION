import { NextResponse } from "next/server";
import { z } from "zod";
import { applyAnswer } from "@/lib/interview/engine";
import { understandTurn } from "@/lib/interview/llm";
import { getLLMProvider, LLMError } from "@/lib/llm/provider";
import { badRequest } from "@/lib/api/respond";
import { logEvent } from "@/lib/server/log";
import { checkV2Rate, tooMany } from "@/lib/server/rate-limit";
import { parseInterviewState } from "@/lib/v2/schemas";
import { abortOn, readJson } from "@/lib/v2/route-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const answerSchema = z.object({ text: z.string().max(1000), choice: z.string().max(40).nullable() });

/**
 * Genesis 深度访谈的一轮：理解回答 → 校验并记录 → 由程序决定下一题。
 * 访谈状态由客户端保存，服务端不存储任何回答；日志只记录事件与结果类型，不含回答内容。
 * 模型不可用时不编造理解：只记录用户点选的选项，并按题库继续（界面会明确提示）。
 */
export async function POST(req: Request) {
  const limited = await checkV2Rate(req, "interview");
  if (limited) return tooMany(limited);
  const read = await readJson(req, 64_000);
  if (!read.ok) return read.res;
  const body = read.body as { state?: unknown; answer?: unknown };
  const parsed = parseInterviewState(body?.state);
  const answer = answerSchema.safeParse(body?.answer);
  if (!parsed.success || !answer.success) return badRequest("访谈数据未通过校验");
  const state = parsed.data;
  if (state.status !== "active" || !state.current) return badRequest("访谈已结束");
  if (!answer.data.text.trim() && !answer.data.choice) return badRequest("请输入回答，或选择一个选项，也可以跳过");

  const llm = getLLMProvider();
  const ctrl = abortOn(req);
  let understanding = null;
  let llmError: string | null = null;
  if (llm) {
    try {
      understanding = await understandTurn(llm, state, answer.data, ctrl.signal);
    } catch (e) {
      llmError = e instanceof LLMError ? e.code : "INTERNAL";
      if (llmError === "CANCELLED") return NextResponse.json({ error: { code: "CANCELLED", message: "已取消", retryable: true } }, { status: 499 });
    }
  } else llmError = "NOT_CONFIGURED";

  const next = applyAnswer(state, answer.data, understanding);
  logEvent("v2.interview.turn", { ai: understanding ? "llm" : "fallback", llmError, turns: next.turns.length, followUps: next.followUpsUsed, status: next.status });
  return NextResponse.json({ state: next, ai: understanding ? "llm" : "fallback", llmError }, { headers: { "Cache-Control": "no-store" } });
}
