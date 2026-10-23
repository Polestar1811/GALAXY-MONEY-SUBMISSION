/**
 * Galaxy Money V2 真实验证：真实 DeepSeek 访谈 / 投资人格 / 研究路径 + 扶摇真实数据的组合回测。
 * - 两位脚本化的虚构用户用自然语言回答（回答内容为虚构示例）；问哪一题、是否追问完全由真实模型与程序规则决定。
 * - 密钥只从 .env.local 读取，不打印、不写入结果；结果写入 docs/live-verification/v2-live-<日期>.json。
 * - 没有凭证时跳过，绝不用 Mock 代替。
 */
import { describe, expect, it } from "vitest";
import type { FactKey, IdentityProfile, InterviewState } from "@/types/identity";
import { loadEnvLocal, saveRecord } from "./env";

loadEnvLocal();
const hasLLM = !!(process.env.LLM_API_KEY?.trim() && process.env.LLM_BASE_URL?.trim() && process.env.LLM_MODEL?.trim());
const hasFuyao = !!process.env.FUYAO_API_KEY?.trim();
const stamp = new Date().toISOString().slice(0, 10);
const record: Record<string, unknown> = { kind: "v2-real-run", at: new Date().toISOString(), model: process.env.LLM_MODEL ?? null };

/** 虚构用户的回答脚本：核心题按 id，追问按其想弄清的字段。 */
const USERS: Record<string, { label: string; core: Record<string, string>; byTarget: Partial<Record<FactKey, string>>; fallback: string }> = {
  wedding: {
    label: "虚构用户 1 · 一年内要结婚",
    core: {
      q04: "希望婚后家里能有一笔安心的钱，不用为钱吵架",
      q03: "明年结婚，婚礼加上首付的一部分，大概要用掉 6 万",
      q10: "6 万一年内肯定要用，剩下的可以放个三五年",
      q07: "存款基本都在这 10 万里，没有别的储备了",
      q14: "亏超过一万块就会影响生活了",
      q15: "可能会加一点仓吧，觉得便宜了",
      q11: "希望一年能翻倍",
      q05: "大概 10 万",
      q08: "没有贷款",
      q06: "上班拿工资，每个月 8000，还算稳定",
      q13: "买过一些基金，亏过一点",
      q02: "没有，父母还在工作",
      q01: "28 岁",
      q09: "身边朋友都在买，感觉不投就落后了",
      q12: "每周能看一下",
      q16: "会很着急，想马上跟上",
    },
    byTarget: {
      nearTermExpenseShare: "10 万里有 6 万是结婚必须用的",
      lossImpact: "剩下 4 万如果亏 20% 会很难受，会影响结婚后的生活安排",
      drawdownReaction: "可能会忍不住卖掉",
      reserveMonths: "没有单独的应急钱",
      horizon: "结婚的钱一年内要用，其余的可以放三年左右",
      expectedOutcome: "其实也知道翻倍很难，能比存款多就行",
    },
    fallback: "这个我不太确定",
  },
  retirement: {
    label: "虚构用户 2 · 为十年后养老做准备",
    core: {
      q04: "退休后不用为钱发愁，还能帮孩子一把",
      q03: "未来三年没有什么大额支出",
      q10: "十年以上都不用动",
      q07: "家里的应急钱能撑一年左右",
      q14: "亏 30% 也不至于影响生活",
      q15: "按计划拿着，不会动，甚至可能定投多买一点",
      q11: "长期稳健增长，跑赢通胀",
      q05: "准备拿 50 万左右",
      q08: "还有一点房贷，压力不大",
      q06: "工资收入，很稳定",
      q13: "股票和基金都做过十几年",
      q02: "孩子还在上大学",
      q01: "48 岁",
      q09: "为退休做准备",
      q12: "每个月看一次就够",
      q16: "比较平静，每个人节奏不同",
    },
    byTarget: {
      lossImpact: "短期亏 30% 我能接受，不影响生活",
      reserveMonths: "应急资金是单独放的，大概一年的开支",
      debt: "房贷每月三千，收入覆盖得了",
      horizon: "至少十年",
    },
    fallback: "没有特别的",
  },
};

async function runInterview(userId: keyof typeof USERS) {
  const { newInterview, applyAnswer } = await import("@/lib/interview/engine");
  const { understandTurn } = await import("@/lib/interview/llm");
  const { getLLMProvider } = await import("@/lib/llm/provider");
  const llm = getLLMProvider()!;
  const u = USERS[userId];
  let s: InterviewState = newInterview();
  const transcript: { q: string; kind: string; id: string; reason: string | null; a: string; ack: string | null; ms: number; ai: string; error?: string }[] = [];
  while (s.status === "active" && s.current && transcript.length < 25) {
    const q = s.current;
    const a = q.kind === "core" ? (u.core[q.id] ?? u.fallback) : (q.targets.map((t) => u.byTarget[t]).find(Boolean) ?? u.fallback);
    const t0 = Date.now();
    let und = null;
    let error: string | undefined;
    try {
      und = await understandTurn(llm, s, { text: a, choice: null });
    } catch (e) {
      error = (e as { code?: string }).code ?? (e as Error).message;
    }
    s = applyAnswer(s, { text: a, choice: null }, und);
    const turn = s.turns[s.turns.length - 1];
    transcript.push({ id: q.id, kind: q.kind, q: q.text, reason: q.reason, a, ack: turn.acknowledgment, ms: Date.now() - t0, ai: turn.ai, error });
  }
  return { state: s, transcript };
}

const toProfile = (s: InterviewState, label: string): IdentityProfile => ({ facts: s.facts, inferences: s.inferences, skipped: s.skipped, contradictions: s.contradictions, kind: "user", label, confirmed: true, confirmedAt: new Date().toISOString() });

describe.skipIf(!hasLLM)("V2 真实模型：访谈 → 投资人格 → 研究路径", () => {
  it(
    "两位处境不同的用户：真实模型动态追问，程序硬约束有效，路径优先级不同",
    async () => {
      const { synthesizeIdentity } = await import("@/lib/identity/synthesis");
      const { synthesizePaths } = await import("@/lib/paths/synthesis");
      const { getLLMProvider } = await import("@/lib/llm/provider");
      const { quoteInAnswer } = await import("@/lib/interview/engine");
      const llm = getLLMProvider()!;
      const out: Record<string, unknown> = {};
      for (const id of ["wedding", "retirement"] as const) {
        const { state, transcript } = await runInterview(id);
        const profile = toProfile(state, USERS[id].label);
        const narrative = await synthesizeIdentity(llm, profile);
        const paths = await synthesizePaths(llm, profile);
        // 每条「用户陈述」的事实，原话都必须出现在该轮回答中
        for (const f of Object.values(state.facts)) {
          if (f!.source !== "stated") continue;
          const turn = state.turns.find((t) => t.id === f!.turnId)!;
          expect(quoteInAnswer(f!.quote!, turn.answer!.text), `${f!.key} 的原话`).toBe(true);
        }
        expect(state.turns.length).toBeLessThanOrEqual(20);
        expect(state.followUpsUsed).toBeLessThanOrEqual(4);
        out[id] = {
          label: USERS[id].label,
          questions: state.turns.length,
          followUps: transcript.filter((t) => t.kind === "followup").map((t) => ({ q: t.q, reason: t.reason })),
          llmFailures: state.llmFailures,
          avgTurnMs: Math.round(transcript.reduce((a, t) => a + t.ms, 0) / transcript.length),
          transcript,
          facts: Object.values(state.facts).map((f) => ({ key: f!.key, value: f!.value, source: f!.source, quote: f!.quote })),
          inferences: state.inferences.map((i) => ({ key: i.key, label: i.label, basis: i.basis, status: i.status })),
          skipped: state.skipped,
          contradictions: state.contradictions.map((c) => c.description),
          narrative,
          paths: { orderReason: paths.orderReason, source: paths.source, notes: paths.notes, paths: paths.paths.map((p) => ({ id: p.id, status: p.status, gate: p.gate, why: p.why, risks: p.risks })) },
        };
      }
      record.users = out;
      const w = out.wedding as { followUps: { q: string }[]; paths: { paths: { id: string; status: string }[] } };
      const r = out.retirement as { followUps: { q: string }[]; paths: { paths: { id: string; status: string }[] } };
      // 近期要结婚的用户：资金安全路径优先，增长路径需先满足前提
      expect(w.paths.paths[0].id).toBe("A");
      expect(w.paths.paths.find((p) => p.id === "C")!.status).toBe("conditional");
      expect(r.paths.paths[0].id).not.toBe("A");
      // 两位用户的追问不应完全相同
      expect(JSON.stringify(w.followUps)).not.toBe(JSON.stringify(r.followUps));
      saveRecord(`v2-live-${stamp}.json`, record);
    },
    600_000,
  );
});

describe.skipIf(!hasFuyao)("V2 真实数据：组合回测", () => {
  it(
    "三个研究组合与基准：统一共同区间，真实前复权日线",
    async () => {
      const { FuyaoMarketDataProvider, clearFuyaoCache } = await import("@/lib/providers/fuyao-provider");
      const { backtestPortfolio } = await import("@/lib/portfolio/service");
      const { TEMPLATES } = await import("@/lib/portfolio/universe");
      clearFuyaoCache();
      const provider = new FuyaoMarketDataProvider();
      const res: Record<string, unknown> = {};
      for (const id of ["A", "B", "C"] as const) {
        const r = await backtestPortfolio(provider, TEMPLATES[id].weights, "monthly");
        if (!r.portfolio.ok || !r.benchmark?.ok) throw new Error(`回测失败：${id}`);
        expect(r.portfolio.start).toBe(r.benchmark.start);
        expect(r.portfolio.days).toBeGreaterThan(500);
        const iso = (t: number) => new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
        res[id] = {
          weights: TEMPLATES[id].weights,
          start: iso(r.portfolio.start),
          end: iso(r.portfolio.end),
          days: r.portfolio.days,
          rebalances: r.portfolio.rebalances,
          metrics: r.portfolio.metrics,
          benchmark: r.benchmark.metrics,
          periods: r.portfolio.periods.map((p) => ({ label: p.label, ret: p.ret })),
          sources: r.sources,
        };
      }
      record.portfolio = res;
      saveRecord(`v2-live-${stamp}.json`, record);
    },
    300_000,
  );
});
