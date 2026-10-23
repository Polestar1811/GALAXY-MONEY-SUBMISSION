// E2E 专用：OpenAI 兼容的 Mock LLM 服务（测试替身，不属于产品代码，不计入真实 LLM 验证）。
// 规划阶段返回固定计划；回答阶段只使用请求中提供的事实与证据编号构造回答。
import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT || 4010);

function plan() {
  return {
    intent: "识别与该用户相关的主要风险及其证据",
    outOfScope: false,
    outOfScopeReason: null,
    focusTags: ["drawdown", "valuation"],
    steps: [
      { tool: "market_snapshot", purpose: "确认最新行情与时点" },
      { tool: "price_history", purpose: "计算回撤与波动" },
      { tool: "fund_profile_valuation", purpose: "核实估值与规模" },
    ],
  };
}

function answer(input) {
  const f = (id) => input.facts.find((x) => x.factId === id);
  const mdd = f("f-mdd-3y");
  const vol = f("f-vol-1y");
  const top = input.research_priorities[0];
  const profile = (input.user_profile || []).join("，") || "未提供画像";
  return {
    summary: `【Mock 回答】针对「${input.question}」：近 3 年最大回撤 ${mdd.value}，1 年年化波动率 ${vol.value}。由于你的画像（${profile}），研究首先关注「${top.title}」。是否投资由你决定。`,
    findings: [
      { kind: "fact", statement: `近 3 年最大回撤为 ${mdd.value}。`, evidenceIds: mdd.evidenceIds },
      { kind: "fact", statement: `1 年年化波动率为 ${vol.value}。`, evidenceIds: vol.evidenceIds },
      { kind: "inference", statement: `对你而言，「${top.title}」是最需要先研究清楚的问题。`, evidenceIds: ["e-drawdown"] },
    ],
    risks: input.rule_risks.slice(0, 3).map((r) => ({ riskId: r.riskId, explanation: `${r.title}：${r.summary}`, evidenceIds: ["e-drawdown"] })),
    uncertainties: ["历史回撤与波动不代表未来。"],
    informationGaps: input.facts.filter((x) => String(x.value).startsWith("未知")).slice(0, 2).map((x) => `${x.label} 当前未知`),
    followUps: ["回撤修复通常需要多长时间？", "估值分位的口径是什么？"],
  };
}

// ---------- V2（Galaxy Money）任务：访谈 / 投资人格 / 研究路径 ----------
function interview(p) {
  const text = p.answer.text || "";
  const q = p.current_question;
  const extracted = [];
  if (q.id === "q04" && text) extracted.push({ key: "lifeGoal", value: "", quote: text.slice(0, 30) });
  const remaining = p.remaining_core_questions;
  const base = { inferredTraits: [], missingInformation: [], contradictions: [], questionReason: "", completionEligibility: false };
  if (text.includes("结婚") && p.followups_left > 0) {
    extracted.push({ key: "nearTermExpense", value: "within1y", quote: "结婚" });
    return {
      ...base,
      acknowledgment: "【Mock】你提到近期要结婚，这会影响能承受多少波动。",
      extractedFacts: extracted,
      next: { type: "followup", text: "结婚大概会用掉准备投资的钱里的多少？", targets: ["nearTermExpenseShare"] },
      questionReason: "近期必须使用的钱不适合承担短期波动",
    };
  }
  if (text.includes("翻倍") && p.followups_left > 0) {
    extracted.push({ key: "expectedOutcome", value: "double_fast", quote: "翻倍" });
    return {
      ...base,
      acknowledgment: "【Mock】你对收益的期望比较高。",
      extractedFacts: extracted,
      inferredTraits: [{ key: "overconfidence", value: "yes", basis: "希望很快翻倍", confidence: "medium" }],
      next: { type: "followup", text: "如果中途先亏掉三成，你会怎样安排生活和这笔钱？", targets: ["lossImpact"] },
      questionReason: "高收益目标需要先确认可承受的损失",
    };
  }
  return {
    ...base,
    acknowledgment: text ? `【Mock】收到：${text.slice(0, 16)}` : "【Mock】收到你的选择。",
    extractedFacts: extracted,
    next: remaining.length ? { type: "core", questionId: remaining[0].id } : { type: "finish" },
  };
}

function identity(input) {
  return {
    understanding: [`【Mock 理解】我们记录了你的 ${input.facts.length} 项信息。客观承受能力：${input.risk.capacity_objective.level}；主观意愿：${input.risk.tolerance_subjective.level}。`],
    topQuestions: input.constraints.slice(0, 3).map((c) => ({ title: c.title, why: c.detail })),
    tendencies: input.inferences.filter((i) => i.status === "待确认推断").slice(0, 2).map((i) => ({ text: i.item, basis: i.basis })),
    uncertainties: input.unknown.slice(0, 3).map((u) => ({ item: u, impact: "未知时相关判断会更保守。" })),
  };
}

function paths(input) {
  const first = input.user.constraints[0]?.title ?? "你的期限与目标";
  return {
    paths: input.plan.map((p) => ({
      id: p.id,
      why: `【Mock】${p.status === "conditional" ? `需要先满足前提：${p.gate}。` : ""}结合「${first}」，这条路径帮助你理解${p.focus}。`,
      helps: "看清这类方向的收益与代价。",
      risks: ["历史不代表未来"],
      costs: ["需要时间学习"],
      changes: ["你的期限或资金需要发生变化"],
      explore: ["这类资产历史上最深跌过多少？"],
    })),
  };
}

const stats = { plan: 0, respond: 0, interview: 0, identity: 0, paths: 0 };

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method === "GET" && req.url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(stats));
    return;
  }
  if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
    res.writeHead(404).end();
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    const body = JSON.parse(raw);
    const system = body.messages[0].content;
    const user = body.messages.find((m) => m.role === "user").content;
    const v2 = system.startsWith("[task:interview]") ? interview : system.startsWith("[task:identity]") ? identity : system.startsWith("[task:paths]") ? paths : null;
    if (v2) {
      stats[system.slice(6, system.indexOf("]"))]++;
      const content = JSON.stringify(v2(JSON.parse(user)));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ model: body.model, choices: [{ message: { role: "assistant", content } }], usage: { prompt_tokens: 0, completion_tokens: 0 } }));
      return;
    }
    const isPlan = system.includes("研究计划") && !system.includes("研究结论");
    stats[isPlan ? "plan" : "respond"]++;
    let content;
    if (isPlan) {
      const q = JSON.parse(user).question || "";
      if (q.includes("[slow]")) await new Promise((r) => setTimeout(r, 4000));
      content = JSON.stringify(plan());
    } else {
      const json = user.replace(/^<research_input>\n/, "").replace(/\n<\/research_input>$/, "");
      content = JSON.stringify(answer(JSON.parse(json)));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ model: body.model, choices: [{ message: { role: "assistant", content } }], usage: { prompt_tokens: 0, completion_tokens: 0 } }));
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock llm on ${PORT}`));
