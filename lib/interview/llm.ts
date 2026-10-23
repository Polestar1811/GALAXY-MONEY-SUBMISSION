import "server-only";
import { z } from "zod";
import type { InterviewState } from "@/types/identity";
import { extractJson, LLMError, type LLMMessage, type LLMProvider } from "@/lib/llm/provider";
import { FACT_SPECS, TRAIT_KEYS, TRAIT_LABELS } from "./catalog";
import { coreCandidates, isResolved, type AnswerInput, type TurnUnderstanding } from "./engine";
import { INTERVIEW_LIMITS, KEY_FACTS } from "./questions";

/** 截断而不是拒绝超长列表（真实模型偶尔多给条目）。 */
const capped = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).default([]).transform((a) => a.slice(0, max));

export const understandingSchema = z.object({
  acknowledgment: z.string().default("").transform((s) => s.slice(0, 200)),
  extractedFacts: capped(z.object({ key: z.string(), value: z.string().default(""), quote: z.string().default("") }), 8),
  inferredTraits: capped(z.object({ key: z.string(), value: z.string().default("yes"), basis: z.string().default(""), confidence: z.enum(["low", "medium"]).catch("low") }), 4),
  missingInformation: capped(z.string(), 18),
  contradictions: capped(z.object({ description: z.string(), keys: z.array(z.string()).default([]) }), 3),
  next: z
    .object({
      type: z.enum(["core", "followup", "finish"]),
      questionId: z.string().nullish(),
      text: z.string().nullish(),
      targets: z.array(z.string()).nullish(),
    })
    .catch({ type: "core" }),
  questionReason: z.string().default("").transform((s) => s.slice(0, 200)),
  completionEligibility: z.boolean().catch(false),
});

const catalogText = FACT_SPECS.map((s) => (s.text ? `- ${s.key}（${s.label}）：文本，value 填用户原话的简短摘录` : `- ${s.key}（${s.label}）：${s.values.map((v) => `${v.code}=${v.label}`).join("；")}`)).join("\n");

export const INTERVIEW_SYSTEM = `[task:interview]
你是 Galaxy Money 的财富研究伙伴，正在和一位普通人做一次深度访谈，目的是理解他的人生处境、财务约束、投资动机与决策心理。
Galaxy 的原则：AI can do the work. Only you can live the life. 你不推荐任何产品，不给买卖建议，不预测涨跌，不承诺收益。

每一轮你会收到：当前问题、用户的回答（可能是自由文字，也可能附带点选的选项）、已经掌握的信息（只有字段与取值，没有原话）、仍未掌握的信息、剩余可用的问题与追问额度。
请完成：
1. 理解这条回答，提取用户**明确表达**的信息（extractedFacts）：key 必须来自下方目录，value 必须是目录中的编码；quote 必须逐字摘自用户本轮回答（几个字即可）。用户没有说的，不要提取。
2. 你根据回答形成的推断（inferredTraits）单独列出：可以是目录字段（用户没直接说，但你推断出来的），也可以是决策倾向（${TRAIT_KEYS.map((k) => `${k}=${TRAIT_LABELS[k]}`).join("；")}）。必须写明依据 basis，confidence 只能是 low 或 medium。不要使用 MBTI 等人格标签。
3. 列出仍然未知、且会影响判断的信息（missingInformation，字段 key）。
4. 发现回答之间的潜在矛盾时写在 contradictions（description 用平实的话，keys 为相关字段）。known_contradictions 中已经记录的矛盾不要重复报告，只报告新的。
5. 决定下一步 next：
   - followup：只有当这条回答带出了**真正影响风险判断**的新信息或矛盾时才追问（例如：准备投资的钱里有一部分近期要用；目标收益与可承受损失明显不匹配）。追问要具体、针对他刚说的内容，不要套用固定话术。targets 填这个追问想弄清的字段。
   - core：从「剩余核心问题」里选一个最值得问的 questionId，并可以用更自然、衔接上文的方式改写题面 text（不改变问题含义；已经知道的内容不要再问）。
   - finish：关键信息已足够时可以提议结束。
6. acknowledgment：一句简短、真实、不过度奉承的回应（不超过 40 字），可以复述你理解到的要点；不要说「我完全了解你」。
7. 敏感问题（年龄、家庭、收入、储备、负债）用户可以只给区间或拒答：只有用户明确表示不想说时才提取 prefer_not，不要追问细节。「没有储备」「没有别的钱」是事实（例如 reserveMonths=lt3），不是拒答。金额请按用户说的数字归入对应区间（例如 50 万属于 20–100 万）。
8. 用户已经回答过、或明确表示不清楚的追问，不要换个说法再问一次；信息仍不清楚时保持未知，继续下一个问题。
不要把缺失信息补成事实。不要在任何文字中给出投资建议或收益预期。

信息目录（key：编码=含义）：
${catalogText}

只输出 JSON：
{"acknowledgment":"...","extractedFacts":[{"key":"...","value":"...","quote":"..."}],"inferredTraits":[{"key":"...","value":"...","basis":"...","confidence":"low"}],"missingInformation":["..."],"contradictions":[{"description":"...","keys":["..."]}],"next":{"type":"core|followup|finish","questionId":"q..","text":"...","targets":["..."]},"questionReason":"为什么问下一题","completionEligibility":false}`;

/** 构造本轮输入：只包含当前问答与结构化的已知信息，不发送此前的完整访谈原文。 */
export function interviewUserPayload(state: InterviewState, answer: AnswerInput) {
  const q = state.current!;
  const remaining = coreCandidates({ ...state, current: null }).filter((c) => c.id !== q.id);
  return {
    current_question: { id: q.id, kind: q.kind, text: q.text, targets: q.targets },
    answer: { text: answer.text.slice(0, 1000), selected_option: answer.choice },
    known: Object.values(state.facts).map((f) => ({ key: f!.key, value: f!.value })),
    unknown: FACT_SPECS.map((s) => s.key).filter((k) => !isResolved(state, k)),
    user_skipped: state.skipped,
    key_information: KEY_FACTS,
    remaining_core_questions: remaining.map((c) => ({ id: c.id, text: c.text, targets: c.targets })),
    questions_left: INTERVIEW_LIMITS.maxQuestions - state.turns.length - 1,
    followups_left: INTERVIEW_LIMITS.maxFollowUps - state.followUpsUsed,
    previous_followups: state.turns.filter((t) => t.question.kind === "followup").map((t) => t.question.text),
    known_contradictions: state.contradictions.map((c) => c.description),
  };
}

export async function understandTurn(llm: LLMProvider, state: InterviewState, answer: AnswerInput, signal?: AbortSignal): Promise<TurnUnderstanding> {
  const messages: LLMMessage[] = [
    { role: "system", content: INTERVIEW_SYSTEM },
    { role: "user", content: JSON.stringify(interviewUserPayload(state, answer)) },
  ];
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await llm.complete({ messages, json: true, signal, temperature: 0.4, maxTokens: 1600 });
    try {
      last = extractJson(res.content);
      return understandingSchema.parse(last) as TurnUnderstanding;
    } catch (e) {
      if (attempt === 1) throw new LLMError("MALFORMED", `访谈模型输出无法解析：${(e as Error).message.slice(0, 120)}`);
      messages.push({ role: "assistant", content: res.content.slice(0, 1500) }, { role: "user", content: "上一次输出不是合法 JSON 或缺少字段，请严格按要求只输出 JSON。" });
    }
  }
  throw new LLMError("MALFORMED", "访谈模型输出无法解析");
}
