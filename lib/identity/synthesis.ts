import "server-only";
import { z } from "zod";
import type { IdentityNarrative, IdentityProfile } from "@/types/identity";
import { extractJson, LLMError, type LLMProvider } from "@/lib/llm/provider";
import { guardList, guardText, numbersIn, type GuardReport } from "@/lib/v2/text-guard";
import { narrativeInput, rulesNarrative } from "./narrative";

const capped = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).default([]).transform((a) => a.slice(0, max));

export const narrativeSchema = z.object({
  understanding: capped(z.string(), 4),
  topQuestions: capped(z.object({ title: z.string(), why: z.string() }), 3),
  tendencies: capped(z.object({ text: z.string(), basis: z.string() }), 3),
  uncertainties: capped(z.object({ item: z.string(), impact: z.string() }), 5),
});

export const IDENTITY_SYSTEM = `[task:identity]
你是 Galaxy Money 的财富研究伙伴。根据访谈整理出的结构化信息，用第二人称写一份让用户感到「被理解」的投资人格报告。
要求：
- understanding：2–4 段自然、具体的中文，总结他的财务处境、目标、最优先的约束，以及值得注意的潜在矛盾。必须基于输入，不要编造输入中没有的事实或数字。
- 必须把三件事分开讲：客观承受能力（capacity_objective）、主观风险意愿（tolerance_subjective）、目标对风险的要求（required_by_goal）。不要把意愿当成能力。
- topQuestions：他当前最重要的三个问题（title 简短，why 一句话说明与他的关系）。存在硬性约束（severity=hard）时必须排在前面。
- tendencies：可能的决策倾向，只能来自输入中的推断，并写明 basis；这是初步推断，不是人格诊断；不要使用 MBTI 等标签。
- uncertainties：我们还不确定的事，以及它可能如何影响后续研究。
- 语气克制、真诚，不奉承，不说「我完全了解你」。不提供任何投资建议、产品推荐、收益承诺或涨跌预测。
只输出 JSON：{"understanding":["..."],"topQuestions":[{"title":"...","why":"..."}],"tendencies":[{"text":"...","basis":"..."}],"uncertainties":[{"item":"...","impact":"..."}]}`;

export async function synthesizeIdentity(llm: LLMProvider | null, profile: IdentityProfile, signal?: AbortSignal): Promise<IdentityNarrative> {
  const input = narrativeInput(profile);
  if (!llm) return { ...rulesNarrative(profile), notes: ["未配置大模型，以下为规则生成的摘要。"] };
  const raw = JSON.stringify(input);
  const whitelist = numbersIn(raw);
  try {
    const res = await llm.complete({
      messages: [
        { role: "system", content: IDENTITY_SYSTEM },
        { role: "user", content: raw },
      ],
      json: true,
      signal,
      temperature: 0.5,
      maxTokens: 2000,
    });
    const parsed = narrativeSchema.parse(extractJson(res.content));
    const report: GuardReport = { removed: [] };
    const understanding = guardList(parsed.understanding, whitelist, report, 4, 600);
    const out: IdentityNarrative = {
      understanding,
      topQuestions: parsed.topQuestions
        .map((q) => ({ title: guardText(q.title.slice(0, 40), whitelist, report), why: guardText(q.why.slice(0, 160), whitelist, report) }))
        .filter((q) => q.title)
        .slice(0, 3),
      tendencies: parsed.tendencies.map((t) => ({ text: guardText(t.text.slice(0, 80), whitelist, report), basis: guardText(t.basis.slice(0, 160), whitelist, report) })).filter((t) => t.text),
      uncertainties: parsed.uncertainties.map((u) => ({ item: guardText(u.item.slice(0, 60), whitelist, report), impact: guardText(u.impact.slice(0, 160), whitelist, report) })).filter((u) => u.item),
      source: "llm",
      notes: report.removed.length ? [`护栏移除了 ${report.removed.length} 处不合规或无法核验的表述。`] : [],
    };
    // 模型输出被护栏清空时，回退到规则摘要，而不是展示空白
    if (out.understanding.length === 0) return { ...rulesNarrative(profile), notes: ["模型输出未通过校验，以下为规则生成的摘要。"] };
    if (out.topQuestions.length < 3) out.topQuestions = [...out.topQuestions, ...rulesNarrative(profile).topQuestions].slice(0, 3);
    return out;
  } catch (e) {
    if (e instanceof LLMError && e.code === "CANCELLED") throw e;
    const why = e instanceof LLMError ? e.code : "MALFORMED";
    return { ...rulesNarrative(profile), notes: [`大模型暂时不可用（${why}），以下为规则生成的摘要。`] };
  }
}
