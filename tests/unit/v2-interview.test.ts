import { describe, expect, it } from "vitest";
import type { InterviewState } from "@/types/identity";
import { applyAnswer, applySkip, editFact, finishEarly, newInterview, progress, quoteInAnswer, reviewInference, rewind, ruleContradictions, type TurnUnderstanding } from "@/lib/interview/engine";
import { interviewUserPayload, understandTurn } from "@/lib/interview/llm";
import { CORE_QUESTIONS, INTERVIEW_LIMITS } from "@/lib/interview/questions";
import { fakeLLM, userPayload } from "../helpers/fake-llm";

const U = (p: Partial<TurnUnderstanding> = {}): TurnUnderstanding => ({
  acknowledgment: "明白了。",
  extractedFacts: [],
  inferredTraits: [],
  missingInformation: [],
  contradictions: [],
  next: { type: "core" },
  questionReason: "",
  completionEligibility: false,
  ...p,
});

describe("访谈状态机：基本流程", () => {
  it("从「希望财富带来什么改变」开始，最多 20 题、4 个追问，进度可见", () => {
    const s = newInterview();
    expect(s.current?.id).toBe("q04");
    expect(CORE_QUESTIONS).toHaveLength(16);
    const p = progress(s);
    expect(p).toMatchObject({ asked: 1, max: 20, maxFollowUps: 4, followUpsUsed: 0 });
    expect(p.remainingEstimate).toBeGreaterThan(10);
  });

  it("用户点选的选项直接记为事实（selected），并按优先级进入下一题", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "希望家里更安心", choice: null }, U({ extractedFacts: [{ key: "lifeGoal", value: "希望家里更安心", quote: "希望家里更安心" }] }));
    expect(s.facts.lifeGoal).toMatchObject({ source: "stated", value: "希望家里更安心" });
    // 下一题由程序按优先级选择（近期支出与期限优先）
    expect(["q03", "q10"]).toContain(s.current?.id);
    const before = s.current!;
    s = applyAnswer(s, { text: "", choice: before.id === "q10" ? "1to3y" : "within1y" }, null);
    const key = before.id === "q10" ? "horizon" : "nearTermExpense";
    expect(s.facts[key]).toMatchObject({ source: "selected", quote: null });
    expect(s.turns[1].ai).toBe("none");
  });

  it("模型声称的「原话」不在回答中：不记为事实，降级为待确认推断", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "想让父母过得好一点", choice: null }, U({ extractedFacts: [{ key: "dependents", value: "parents", quote: "父母靠我养" }, { key: "lifeGoal", value: "", quote: "想让父母过得好一点" }] }));
    expect(s.facts.dependents).toBeUndefined();
    expect(s.inferences.find((i) => i.key === "dependents")).toMatchObject({ status: "pending", confidence: "low" });
    expect(s.facts.lifeGoal?.value).toBe("想让父母过得好一点");
  });

  it("不在目录中的字段与取值被丢弃", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "我 30 岁，年收入 20 万", choice: null }, U({ extractedFacts: [{ key: "salary", value: "200000", quote: "年收入 20 万" }, { key: "ageBand", value: "30", quote: "30 岁" }] }));
    expect(Object.keys(s.facts)).toEqual([]);
  });

  it("推断只作为待确认项；确认后写为用户确认的事实，拒绝后保持未知", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "明年就要结婚了", choice: null }, U({ inferredTraits: [{ key: "nearTermExpense", value: "within1y", basis: "提到明年结婚", confidence: "medium" }, { key: "lossAversion", value: "yes", basis: "提到担心", confidence: "low" }] }));
    expect(s.facts.nearTermExpense).toBeUndefined();
    const inf = s.inferences.find((i) => i.key === "nearTermExpense")!;
    const accepted = reviewInference(s, inf.id, true);
    expect(accepted.facts.nearTermExpense).toMatchObject({ value: "within1y", source: "edited", lockedByUser: true });
    const rejected = reviewInference(s, inf.id, false);
    expect(rejected.facts.nearTermExpense).toBeUndefined();
  });
});

describe("动态追问", () => {
  // 模拟真实模型：根据回答内容决定追问（Mock）
  const respond = (req: Parameters<Parameters<typeof fakeLLM>[0]>[0]) => {
    const p = userPayload(req);
    const t: string = p.answer.text;
    if (t.includes("结婚")) {
      return {
        acknowledgment: "这 10 万里有一部分是结婚要用的钱。",
        extractedFacts: [{ key: "nearTermExpense", value: "within1y", quote: "明年结婚" }],
        inferredTraits: [],
        missingInformation: ["nearTermExpenseShare"],
        contradictions: [],
        next: { type: "followup", text: "结婚大概会用掉这 10 万里的多少？剩下的钱如果短期亏 20%，会影响生活安排，还是主要影响心情？", targets: ["nearTermExpenseShare", "lossImpact"] },
        questionReason: "近期必须使用的资金决定了能承受多少波动",
        completionEligibility: false,
      };
    }
    if (t.includes("翻倍")) {
      return {
        acknowledgment: "你对收益的期望比较高。",
        extractedFacts: [{ key: "expectedOutcome", value: "double_fast", quote: "一年翻倍" }],
        inferredTraits: [{ key: "overconfidence", value: "yes", basis: "希望一年翻倍", confidence: "medium" }],
        missingInformation: ["lossImpact"],
        contradictions: [],
        next: { type: "followup", text: "如果为了追求翻倍，中途先亏掉三成，你会怎么安排生活和这笔钱？", targets: ["lossImpact", "drawdownReaction"] },
        questionReason: "高收益目标需要先确认可承受的损失",
        completionEligibility: false,
      };
    }
    return { acknowledgment: "好的。", extractedFacts: [], inferredTraits: [], missingInformation: [], contradictions: [], next: { type: "core", questionId: "q10" }, questionReason: "", completionEligibility: false };
  };

  it("同一题面对不同回答，产生不同的追问；稳定的回答不追问", async () => {
    const llm = fakeLLM(respond);
    const base = newInterview();
    const a = applyAnswer(base, { text: "我月入 8000，准备拿 10 万，明年结婚", choice: null }, await understandTurn(llm, base, { text: "我月入 8000，准备拿 10 万，明年结婚", choice: null }));
    const b = applyAnswer(base, { text: "希望一年翻倍，早点财务自由", choice: null }, await understandTurn(llm, base, { text: "希望一年翻倍，早点财务自由", choice: null }));
    const c = applyAnswer(base, { text: "希望老了以后不用发愁", choice: null }, await understandTurn(llm, base, { text: "希望老了以后不用发愁", choice: null }));
    expect(a.current?.kind).toBe("followup");
    expect(b.current?.kind).toBe("followup");
    expect(a.current?.text).not.toBe(b.current?.text);
    expect(a.current?.targets).toContain("nearTermExpenseShare");
    expect(b.current?.targets).toContain("lossImpact");
    expect(c.current).toMatchObject({ kind: "core", id: "q10" });
    expect(a.followUpsUsed).toBe(1);
  });

  it("追问额度用完、重复、无关或含投资建议的追问被程序拒绝，改问核心题", () => {
    const fu = (text: string, targets: string[]) => U({ next: { type: "followup", text, targets } });
    const s0 = newInterview();
    const used: InterviewState = { ...s0, followUpsUsed: 4 };
    expect(applyAnswer(used, { text: "嗯", choice: null }, fu("近期有多少钱要用？", ["nearTermExpenseShare"])).current?.kind).toBe("core");
    expect(applyAnswer(s0, { text: "嗯", choice: null }, fu("建议你现在买入沪深300，可以吗？", ["horizon"])).current?.kind).toBe("core");
    expect(applyAnswer(s0, { text: "嗯", choice: null }, fu("这个问题很重要吗？", [])).current?.kind).toBe("core");
    const repeated = applyAnswer(s0, { text: "嗯", choice: null }, fu(s0.current!.text, ["lifeGoal"]));
    expect(repeated.current?.kind).toBe("core");
  });

  it("硬上限：无论模型怎样提议，最多 20 题、4 个追问后自动结束", () => {
    let s = newInterview();
    let n = 0;
    while (s.status === "active" && n < 50) {
      n++;
      s = applyAnswer(s, { text: `第 ${n} 次回答`, choice: null }, U({ next: { type: "followup", text: `追问 ${n}：这部分钱什么时候要用？`, targets: ["horizon", "reserveMonths"] } }));
    }
    expect(s.status).toBe("complete");
    expect(s.turns.length).toBeLessThanOrEqual(INTERVIEW_LIMITS.maxQuestions);
    expect(s.turns.filter((t) => t.question.kind === "followup").length).toBe(4);
    expect(s.followUpsUsed).toBe(4);
    expect(s.current).toBeNull();
  });

  it("关键信息未掌握时，模型提议结束不会被采纳；全部掌握后可以提前结束", () => {
    const s = newInterview();
    expect(applyAnswer(s, { text: "就这些吧", choice: null }, U({ next: { type: "finish" } })).status).toBe("active");
    expect(finishEarly(s).status).toBe("complete");
  });
});

describe("跳过、返回、失败与隐私", () => {
  it("跳过的问题保持未知，不产生事实", () => {
    let s = newInterview();
    s = applySkip(s);
    expect(s.skipped).toContain("lifeGoal");
    expect(s.facts.lifeGoal).toBeUndefined();
    expect(s.turns[0]).toMatchObject({ skipped: true, answer: null });
  });

  it("返回上一题：撤回该轮的事实与推断", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "希望家里安心", choice: null }, U({ extractedFacts: [{ key: "lifeGoal", value: "", quote: "希望家里安心" }], inferredTraits: [{ key: "lossAversion", value: "yes", basis: "安心", confidence: "low" }] }));
    const back = rewind(s);
    expect(back.turns).toHaveLength(0);
    expect(back.current?.id).toBe("q04");
    expect(back.facts.lifeGoal).toBeUndefined();
    expect(back.inferences).toHaveLength(0);
  });

  it("模型不可用：自由文字不被编造为事实，只记录点选的选项，并计入失败次数", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "我想早点退休", choice: null }, null);
    expect(Object.keys(s.facts)).toEqual([]);
    expect(s.turns[0].ai).toBe("fallback");
    expect(s.llmFailures).toBe(1);
    expect(s.status).toBe("active");
  });

  it("用户手动修改过的事实不会被模型覆盖", () => {
    let s = newInterview();
    s = { ...s, ...editFact(s, "horizon", "gt10y") };
    s = applyAnswer(s, { text: "可能一年内就要用", choice: null }, U({ extractedFacts: [{ key: "horizon", value: "lt1y", quote: "一年内就要用" }] }));
    expect(s.facts.horizon).toMatchObject({ value: "gt10y", lockedByUser: true });
  });

  it("发给模型的只有当前问答与结构化信息，不包含此前回答的原文", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "我叫张三，住在杭州，想让父母安心", choice: null }, U({ extractedFacts: [{ key: "lifeGoal", value: "", quote: "想让父母安心" }] }));
    const payload = JSON.stringify(interviewUserPayload(s, { text: "三年内没有大额支出", choice: null }));
    expect(payload).not.toContain("张三");
    expect(payload).not.toContain("杭州");
    expect(payload).toContain("三年内没有大额支出");
  });

  // 以下三条来自真实 DeepSeek 访谈中发现的问题（docs/live-verification/v2-live-*.json）
  it("回归：没有明确拒答时，模型给出的「不便透露」不被记录（「没有别的储备」不是拒答）", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "存款基本都在这 10 万里，没有别的储备了", choice: null }, U({ extractedFacts: [{ key: "reserveMonths", value: "prefer_not", quote: "没有别的储备了" }] }));
    expect(s.facts.reserveMonths).toBeUndefined();
    let t = newInterview();
    t = applyAnswer(t, { text: "这个不太想说", choice: null }, U({ extractedFacts: [{ key: "reserveMonths", value: "prefer_not", quote: "不太想说" }] }));
    expect(t.facts.reserveMonths?.value).toBe("prefer_not");
  });

  it("回归：用户说了明确金额时，资金区间以用户的数字为准", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "准备拿 50 万左右", choice: null }, U({ extractedFacts: [{ key: "investAmount", value: "50kto200k", quote: "50 万左右" }] }));
    expect(s.facts.investAmount?.value).toBe("200kto1m");
    let t = newInterview();
    t = applyAnswer(t, { text: "大概 10 万", choice: null }, U({ extractedFacts: [{ key: "investAmount", value: "gt1m", quote: "10 万" }] }));
    expect(t.facts.investAmount?.value).toBe("50kto200k");
  });

  it("回归：模型给出的矛盾最多保留最近 3 条，并告知模型已记录的矛盾", () => {
    let s = newInterview();
    for (let i = 0; i < 5; i++) {
      if (s.status !== "active") break;
      s = applyAnswer(s, { text: `回答 ${i}`, choice: null }, U({ contradictions: [{ description: `第 ${i} 条矛盾：目标与承受能力不匹配`, keys: ["expectedOutcome"] }] }));
    }
    const llm = s.contradictions.filter((c) => c.origin === "llm");
    expect(llm).toHaveLength(3);
    expect(llm.map((c) => c.description)).toContain("第 4 条矛盾：目标与承受能力不匹配");
    expect(interviewUserPayload(s, { text: "x", choice: null }).known_contradictions).toHaveLength(3);
  });

  it("回归：回应、矛盾说明与追问中转述的数字必须与用户原话一致", () => {
    let s = newInterview();
    s = applyAnswer(s, { text: "准备投资的 10 万里有 6 万要结婚用，亏一万就影响生活", choice: null }, U({
      acknowledgment: "明白，10 万里有 8 万是结婚要用的。",
      contradictions: [
        { description: "之前说亏 5% 以内就会影响生活，与追求翻倍不匹配", keys: ["lossImpact", "expectedOutcome"] },
        { description: "10 万里有 6 万近期要用，能承担波动的只有 4 万左右", keys: ["nearTermExpenseShare"] },
      ],
      next: { type: "followup", text: "剩下的 7 万如果亏两成，会影响生活吗？", targets: ["lossImpact"] },
    }));
    expect(s.turns[0].acknowledgment).toBeNull(); // 「8 万」与原话不符
    const llm = s.contradictions.filter((c) => c.origin === "llm").map((c) => c.description);
    expect(llm.some((d) => d.includes("5%"))).toBe(false);
    // 「4 万」不在原话中（是推算），同样不作为对用户的转述展示
    expect(llm).toHaveLength(0);
    expect(s.current?.kind).toBe("core"); // 追问中的「7 万」不符，改问核心题
    let t = newInterview();
    t = applyAnswer(t, { text: "准备投资的 10 万里有 6 万要结婚用，亏一万就影响生活", choice: null }, U({
      acknowledgment: "明白，10 万里有 6 万是一年内要用的，亏一万就会影响生活。",
      contradictions: [{ description: "10 万里有 6 万近期要用，却希望一年翻倍", keys: ["nearTermExpenseShare"] }],
    }));
    expect(t.turns[0].acknowledgment).toContain("6 万");
    expect(t.contradictions.filter((c) => c.origin === "llm")).toHaveLength(1);
  });

  it("原话校验忽略空白与标点", () => {
    expect(quoteInAnswer("一年 翻倍", "希望一年翻倍！")).toBe(true);
    expect(quoteInAnswer("两年翻倍", "希望一年翻倍")).toBe(false);
    expect(quoteInAnswer("年", "一年")).toBe(false);
  });

  it("规则层识别「高收益期望 × 低承受能力」等矛盾", () => {
    let s = newInterview();
    s = { ...s, ...editFact(s, "expectedOutcome", "double_fast") };
    s = { ...s, ...editFact(s, "lossImpact", "5to10") };
    expect(ruleContradictions(s.facts).map((c) => c.id)).toContain("c-required-capacity");
  });

  it("模型输出不是 JSON 时修复一次，仍失败则报错（由路由降级处理）", async () => {
    const bad = fakeLLM(() => "not json");
    await expect(understandTurn(bad, newInterview(), { text: "x", choice: null })).rejects.toMatchObject({ code: "MALFORMED" });
    expect(bad.calls).toHaveLength(2);
  });
});
