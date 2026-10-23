import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IdentityProfile } from "@/types/identity";
import { DEMO_IDENTITIES } from "@/lib/identity/demo";
import { buildDimensions, constraintsOf, riskTriad, toLegacyProfile } from "@/lib/identity/dimensions";
import { narrativeInput } from "@/lib/identity/narrative";
import { synthesizeIdentity } from "@/lib/identity/synthesis";
import { planPaths } from "@/lib/paths/rules";
import { synthesizePaths } from "@/lib/paths/synthesis";
import { PERSONA_A, PERSONA_B } from "@/lib/profile/personas";
import { parseIdentityProfile } from "@/lib/v2/schemas";
import { MemoryStore, LIMITS, setStore } from "@/lib/server/rate-limit";
import { fakeLLM, userPayload } from "../helpers/fake-llm";

const A = DEMO_IDENTITIES.A;
const B = DEMO_IDENTITIES.B;

describe("投资人格：三种风险分开计算", () => {
  it("用户 A：客观承受能力低、主观意愿高、目标要求高 —— 不混为一谈", () => {
    const t = riskTriad(A.facts);
    expect(t.capacity.level).toBe("low");
    expect(t.tolerance.level).toBe("high");
    expect(t.required.level).toBe("high");
    const ids = constraintsOf(A.facts).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["near_term_need", "no_reserve", "required_gt_capacity", "willingness_gt_capacity"]));
  });

  it("用户 B：承受能力高、意愿中等，没有硬性约束", () => {
    const t = riskTriad(B.facts);
    expect(t.capacity.level).toBe("high");
    expect(t.tolerance.level).toBe("medium");
    expect(constraintsOf(B.facts).filter((c) => c.severity === "hard")).toEqual([]);
  });

  it("输出 7 个维度，每个重要判断可回溯到用户的回答或标注的推断", () => {
    const dims = buildDimensions(A);
    expect(dims.map((d) => d.id)).toEqual(["lifeStage", "capacity", "willingness", "knowledge", "motivation", "behavior", "time"]);
    const cap = dims.find((d) => d.id === "capacity")!;
    expect(cap.evidence.some((e) => e.quote === "存款基本都在这 10 万里")).toBe(true);
    const beh = dims.find((d) => d.id === "behavior")!;
    expect(beh.evidence.some((e) => e.source === "inferred")).toBe(true);
    expect(beh.summary).toContain("不是人格诊断");
  });

  it("「不便透露」与未回答一律视为未知，不参与推断", () => {
    const p: IdentityProfile = { ...B, facts: { ...B.facts, lossImpact: { ...B.facts.lossImpact!, value: "prefer_not", label: "不便透露" } } };
    delete p.facts.reserveMonths;
    expect(riskTriad(p.facts).capacity.why).not.toContain("不便透露");
    const dims = buildDimensions(p);
    expect(dims.find((d) => d.id === "capacity")!.unknown).toEqual(expect.arrayContaining(["lossImpact", "reserveMonths"]));
  });

  it("映射回 InvestLens 原有画像，与原虚构画像 A/B 的关键字段一致", () => {
    const la = toLegacyProfile(A, false);
    for (const k of ["goal", "horizon", "riskWillingness", "lossCapacity", "liquidityNeed", "emergencyReserve"] as const) expect(la[k], k).toBe(PERSONA_A[k]);
    const lb = toLegacyProfile(B, false);
    for (const k of ["goal", "horizon", "riskWillingness", "lossCapacity", "liquidityNeed", "emergencyReserve", "incomeStability"] as const) expect(lb[k], k).toBe(PERSONA_B[k]);
    expect(la.consent.persistLocal).toBe(false);
  });

  it("发给模型的人格输入不包含访谈原话", () => {
    const raw = JSON.stringify(narrativeInput(A));
    expect(raw).not.toContain("存款基本都在这 10 万里");
    expect(raw).not.toContain("看到朋友赚了会很着急");
  });
});

describe("人格叙述：模型输出经过护栏", () => {
  it("编造的数字、买卖建议被删除；保留基于输入的叙述", async () => {
    const llm = fakeLLM(() => ({
      understanding: ["你明年要结婚，近期要用的钱需要先保障。", "按历史数据你每年能赚 18.5% 的收益。", "建议你立即买入宽基 ETF。"],
      topQuestions: [{ title: "先保障结婚用的钱", why: "这部分钱一年内要用。" }],
      tendencies: [{ text: "容易被短期上涨吸引", basis: "看到朋友赚钱会着急" }],
      uncertainties: [],
    }));
    const n = await synthesizeIdentity(llm, A);
    expect(n.source).toBe("llm");
    expect(n.understanding.join("")).toContain("明年要结婚");
    expect(n.understanding.join("")).not.toContain("18.5");
    expect(n.understanding.join("")).not.toContain("立即买入");
    expect(n.topQuestions).toHaveLength(3); // 不足三条时用规则补齐
    expect(n.notes.join("")).toContain("护栏");
  });

  it("模型失败时退回规则摘要，并如实标注", async () => {
    const llm = fakeLLM(() => new Error("boom"));
    const n = await synthesizeIdentity(llm, A);
    expect(n.source).toBe("rules");
    expect(n.understanding.length).toBeGreaterThan(0);
    expect(n.notes.join("")).toMatch(/规则/);
  });
});

describe("研究路径：规则决定顺序与前提，模型只写解释", () => {
  it("两位用户看到不同的优先方向；用户 A 偏好高风险也不会让增长路径优先", () => {
    const pa = planPaths(A);
    expect(pa.order[0]).toBe("A");
    expect(pa.status.C).toBe("conditional");
    expect(pa.gate.C).toMatch(/近期有必须使用的资金|应急储备/);
    const pb = planPaths(B);
    expect(pb.order[0]).toBe("C");
    expect(pb.status.C).toBe("priority");
  });

  it("模型无法改变排序与前提；编造的证券代码与收益数字被删除；个性化理由因人而异", async () => {
    const llm = fakeLLM((req) => {
      const p = userPayload(req);
      const near = JSON.stringify(p.user).includes("一年内有重要支出");
      return {
        paths: [
          { id: "C", why: near ? "你一年内要结婚，增长方向需要先等这笔钱落定。可以考虑 510300 这样的产品，年化 12%。" : "你的期限在 10 年以上，长期增长值得研究。", helps: "理解长期增长", risks: ["波动大"], costs: ["需要耐心"], changes: ["期限缩短"], explore: ["长期回撤有多深？"] },
          { id: "A", why: near ? "结婚要用的钱需要确定性。" : "现金管理是理解风险的参照。", helps: "保障资金", risks: ["收益低"], costs: ["机会成本"], changes: ["支出完成"], explore: ["要留多少现金？"] },
          { id: "B", why: "平衡稳定与增长。", helps: "看清取舍", risks: ["股债同跌"], costs: ["需要再平衡"], changes: ["承受能力变化"], explore: ["多久再平衡？"] },
        ],
      };
    });
    const ra = await synthesizePaths(llm, A);
    expect(ra.paths.map((p) => p.id)).toEqual(["A", "B", "C"]);
    const c = ra.paths.find((p) => p.id === "C")!;
    expect(c.status).toBe("conditional");
    expect(c.why).not.toMatch(/510300|12%/);
    const rb = await synthesizePaths(llm, B);
    expect(rb.paths[0].id).toBe("C");
    expect(rb.paths.find((p) => p.id === "A")!.why).not.toBe(ra.paths.find((p) => p.id === "A")!.why);
  });

  it("模型不可用时使用规则说明，并如实标注", async () => {
    const r = await synthesizePaths(null, A);
    expect(r.source).toBe("rules");
    expect(r.paths).toHaveLength(3);
    expect(r.paths.every((p) => p.risks.length > 0 && p.costs.length > 0 && p.explore.length > 0)).toBe(true);
  });
});

describe("V2 接口", () => {
  beforeEach(() => setStore(new MemoryStore()));
  afterEach(() => setStore(null));

  const post = (url: string, body: unknown, ip = "203.0.113.9") =>
    new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) });

  it("画像校验：非法取值被拒绝", () => {
    const bad = { ...A, facts: { ...A.facts, horizon: { ...A.facts.horizon!, value: "forever" } } };
    expect(parseIdentityProfile(bad).success).toBe(false);
    expect(parseIdentityProfile(A).success).toBe(true);
  });

  it("访谈接口：未配置模型时只记录点选的选项，并返回 fallback", async () => {
    const { newInterview } = await import("@/lib/interview/engine");
    const { POST } = await import("@/app/api/v2/interview/route");
    const s = newInterview();
    const r1 = await POST(post("/api/v2/interview", { state: s, answer: { text: "希望家里安心", choice: null } }));
    const j1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(j1.ai).toBe("fallback");
    expect(j1.llmError).toBe("NOT_CONFIGURED");
    expect(Object.keys(j1.state.facts)).toEqual([]);
    expect((await POST(post("/api/v2/interview", { state: { ...s, followUpsUsed: 99 }, answer: { text: "x", choice: null } }))).status).toBe(400);
  });

  it("人格与路径接口：未配置模型时返回规则结果；超过限额返回 429", async () => {
    const identity = await import("@/app/api/v2/identity/route");
    const r = await identity.POST(post("/api/v2/identity", { profile: A }));
    expect((await r.json()).narrative.source).toBe("rules");
    const paths = await import("@/app/api/v2/paths/route");
    let last = 0;
    for (let i = 0; i < LIMITS.v2.synthesis.limit + 1; i++) last = (await paths.POST(post("/api/v2/paths", { profile: B }, "198.51.100.77"))).status;
    expect(last).toBe(429);
  });
});
