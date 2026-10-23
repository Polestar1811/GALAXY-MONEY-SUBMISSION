import "server-only";
import { z } from "zod";
import type { IdentityProfile, MoneyPath, PathId, PathsResult } from "@/types/identity";
import { extractJson, LLMError, type LLMProvider } from "@/lib/llm/provider";
import { narrativeInput } from "@/lib/identity/narrative";
import { guardList, guardText, numbersIn, type GuardReport } from "@/lib/v2/text-guard";
import { PATH_BASE, planPaths, rulesPaths } from "./rules";

const list = (max: number) => z.array(z.string()).default([]).transform((a) => a.slice(0, max));

export const pathsSchema = z.object({
  paths: z
    .array(
      z.object({
        id: z.enum(["A", "B", "C"]),
        why: z.string().default(""),
        helps: z.string().default(""),
        risks: list(4),
        costs: list(3),
        changes: list(3),
        explore: list(3),
      }),
    )
    .default([]),
});

export const PATHS_SYSTEM = `[task:paths]
你是 Galaxy Money 的财富研究伙伴。系统已经根据用户的真实约束确定了三条「研究路径」的顺序与前提条件（plan），你不能改变它们。
你的任务：为每条路径写面向普通人的解释，说明它与这位用户的关系。
每条路径输出：
- why：为什么这条路径与他有关（必须引用他的具体情况，例如近期支出、储备、期限、目标；不要泛泛而谈）。
- helps：它可能帮助解决什么问题。
- risks：主要风险（2–4 条）。
- costs：他需要付出的代价（1–3 条）。
- changes：什么条件变化会影响它的适用性（1–3 条）。
- explore：如果感兴趣，可以继续研究的问题（2–3 个）。
硬性规则：
- 如果某条路径 status=conditional，必须在 why 中说明需要先满足的前提（gate），不能鼓励他直接采用。
- 用户主观偏好高风险时，不能因此忽略他的客观约束（近期用钱、储备不足、负债）。
- 不要推荐具体证券、基金代码或产品名称；不要给出收益数字、目标价、买卖建议或涨跌预测；不要编造输入中没有的数据。
- 用普通人能听懂的话，避免堆砌专业术语（如需提到回撤、波动，顺带解释一句）。
只输出 JSON：{"paths":[{"id":"A","why":"...","helps":"...","risks":["..."],"costs":["..."],"changes":["..."],"explore":["..."]}]}`;

export async function synthesizePaths(llm: LLMProvider | null, profile: IdentityProfile, signal?: AbortSignal): Promise<PathsResult> {
  const plan = planPaths(profile);
  const fallback = rulesPaths(profile);
  if (!llm) return { paths: fallback, orderReason: plan.orderReason, source: "rules", notes: ["未配置大模型，以下为规则生成的研究路径说明。"] };
  const input = {
    user: narrativeInput(profile),
    plan: plan.order.map((id) => ({ id, title: PATH_BASE[id].title, focus: PATH_BASE[id].focus, status: plan.status[id], gate: plan.gate[id] })),
    order_reason: plan.orderReason,
  };
  const raw = JSON.stringify(input);
  const whitelist = numbersIn(raw);
  try {
    const res = await llm.complete({
      messages: [
        { role: "system", content: PATHS_SYSTEM },
        { role: "user", content: raw },
      ],
      json: true,
      signal,
      temperature: 0.5,
      maxTokens: 2400,
    });
    const parsed = pathsSchema.parse(extractJson(res.content));
    const report: GuardReport = { removed: [] };
    const byId = new Map(parsed.paths.map((p) => [p.id, p]));
    // 排序、状态、前提一律来自规则层；模型只提供文字，缺失的路径用规则文字补齐
    const paths: MoneyPath[] = plan.order.map((id: PathId) => {
      const fb = fallback.find((p) => p.id === id)!;
      const p = byId.get(id);
      if (!p) return fb;
      const why = guardText(p.why.slice(0, 400), whitelist, report);
      const helps = guardText(p.helps.slice(0, 300), whitelist, report);
      const pick = (xs: string[], fbx: string[], max: number) => {
        const g = guardList(xs, whitelist, report, max);
        return g.length ? g : fbx;
      };
      return {
        ...fb,
        why: why || fb.why,
        helps: helps || fb.helps,
        risks: pick(p.risks, fb.risks, 4),
        costs: pick(p.costs, fb.costs, 3),
        changes: pick(p.changes, fb.changes, 3),
        explore: pick(p.explore, fb.explore, 3),
      };
    });
    return { paths, orderReason: plan.orderReason, source: "llm", notes: report.removed.length ? [`护栏移除了 ${report.removed.length} 处不合规或无法核验的表述。`] : [] };
  } catch (e) {
    if (e instanceof LLMError && e.code === "CANCELLED") throw e;
    const why = e instanceof LLMError ? e.code : "MALFORMED";
    return { paths: fallback, orderReason: plan.orderReason, source: "rules", notes: [`大模型暂时不可用（${why}），以下为规则生成的研究路径说明。`] };
  }
}
