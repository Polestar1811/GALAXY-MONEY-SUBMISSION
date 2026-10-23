"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Loader2, Lock, Pencil, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Dimension, FactKey, IdentityProfile, Level } from "@/types/identity";
import { Badge, FictionBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/primitives";
import { FACT_SPEC, FACT_SPECS } from "@/lib/interview/catalog";
import { buildDimensions, constraintsOf, riskTriad } from "@/lib/identity/dimensions";
import { useIdentity } from "@/lib/identity/store";
import { v2api } from "@/lib/client/v2";
import { cn } from "@/lib/cn";

const LEVEL: Record<Level, { word: string; tone: string }> = {
  low: { word: "较低", tone: "text-risk" },
  medium: { word: "中等", tone: "text-warn" },
  high: { word: "较高", tone: "text-teal" },
  unknown: { word: "未知", tone: "text-faint" },
};
const SOURCE: Record<string, string> = { stated: "你说的", selected: "你选择的", edited: "你修改的", inferred: "推断" };

/** 读取 ?demo=A|B，切换到虚构用户。 */
function useDemoParam() {
  const sp = useSearchParams();
  const store = useIdentity();
  const demo = sp.get("demo");
  useEffect(() => {
    if (demo === "A" || demo === "B") store.useDemo(demo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);
}

export function IdentityReport() {
  useDemoParam();
  const store = useIdentity();
  const p = store.active;
  if (!store.hydrated) return <div className="skeleton h-64" />;
  if (!p) {
    return (
      <section className="mx-auto max-w-[620px] py-10 text-center">
        <h1 className="display text-[40px] text-fg">还没有你的投资人格</h1>
        <p className="mt-4 text-[14.5px] text-muted">投资人格来自一次对话。你也可以先看看虚构用户的演示。</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="primary" asChild>
            <Link href="/genesis">开始了解我</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/identity?demo=A">看演示：用户 A</Link>
          </Button>
        </div>
      </section>
    );
  }
  return <Report profile={p} editable={store.source.kind === "user"} />;
}

function Report({ profile, editable }: { profile: IdentityProfile; editable: boolean }) {
  const store = useIdentity();
  const router = useRouter();
  const dims = useMemo(() => buildDimensions(profile), [profile]);
  const triad = useMemo(() => riskTriad(profile.facts), [profile.facts]);
  const cons = useMemo(() => constraintsOf(profile.facts), [profile.facts]);
  const key = store.cacheKey(profile);
  const narrative = store.narratives[key];
  const [shownKey, setShownKey] = useState<string | null>(null);
  const shown = narrative ?? (shownKey ? store.narratives[shownKey] : undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [persist, setPersist] = useState(store.persistLocal);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await v2api.identity(profile);
      store.setNarrative(key, r.narrative);
      setShownKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };
  // 首次进入自动生成；修改后由用户手动更新（避免每次修改都调用模型）
  useEffect(() => {
    if (!narrative && !shownKey && !loading) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const stale = !!shown && !narrative;

  const pendingTraits = profile.inferences.filter((i) => i.status === "pending" && !(i.key in FACT_SPEC));
  const pendingFacts = profile.inferences.filter((i) => i.status === "pending" && i.key in FACT_SPEC);

  return (
    <div className="space-y-14">
      <header>
        <p className="smallcaps text-faint">INVESTOR IDENTITY · 02</p>
        <h1 className="display mt-4 text-[40px] text-fg sm:text-[56px]">
          我们对你的理解<span className="galaxy-dot">.</span>
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {profile.kind === "demo" ? (
            <>
              <FictionBadge />
              <Badge tone="neutral">{profile.label}</Badge>
            </>
          ) : (
            <Badge tone={profile.confirmed ? "teal" : "warn"}>{profile.confirmed ? "已确认" : "待你确认"}</Badge>
          )}
          {shown && <Badge tone="neutral">{shown.source === "llm" ? "AI 撰写 · 经规则校验" : "规则生成"}</Badge>}
        </div>
      </header>

      {/* 叙述 */}
      <section aria-labelledby="h-understanding">
        <h2 id="h-understanding" className="sr-only">
          我们对你的理解
        </h2>
        {loading && !shown ? (
          <div className="space-y-3" aria-busy>
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> 正在整理我们对你的理解…
            </p>
            <div className="skeleton h-5 w-full" />
            <div className="skeleton h-5 w-11/12" />
            <div className="skeleton h-5 w-4/5" />
          </div>
        ) : shown ? (
          <div className="space-y-4 text-[16px] leading-[1.9] text-fg" data-testid="identity-narrative">
            {shown.understanding.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            {shown.notes.map((n) => (
              <p key={n} className="text-[12px] text-faint">
                {n}
              </p>
            ))}
          </div>
        ) : null}
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-fg-2">
            {error}{" "}
            <button className="underline" onClick={generate}>
              重试
            </button>
          </p>
        )}
        {stale && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-line px-3 py-2 text-[12.5px] text-muted">
            你修改了画像，上面的文字还是修改前的理解。
            <Button size="sm" variant="secondary" onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} 更新理解
            </Button>
          </div>
        )}
      </section>

      {/* 三个最重要的问题 */}
      {shown && (
        <section aria-labelledby="h-top">
          <h2 id="h-top" className="smallcaps text-faint">
            你当前最重要的三个问题
          </h2>
          <ol className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft md:grid-cols-3">
            {shown.topQuestions.map((q, i) => (
              <li key={i} className="bg-bg p-5">
                <span className="num text-[11px] text-galaxy">0{i + 1}</span>
                <p className="mt-2 text-[15px] font-medium text-fg">{q.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{q.why}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 风险的三件事 */}
      <section aria-labelledby="h-risk">
        <h2 id="h-risk" className="smallcaps text-faint">
          关于风险，这三件事要分开看
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3" data-testid="risk-triad">
          {(
            [
              ["实际能承受多少", "客观承受能力", triad.capacity],
              ["心里愿意承受多少", "主观风险意愿", triad.tolerance],
              ["目标需要承担多少", "目标对风险的要求", triad.required],
            ] as const
          ).map(([q, name, v]) => (
            <div key={name} className="rounded-lg border border-line-soft p-5">
              <p className="text-[12px] text-faint">{name}</p>
              <p className="mt-1 text-[15px] text-fg">
                {q}：<span className={LEVEL[v.level].tone}>{LEVEL[v.level].word}</span>
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{v.why}</p>
            </div>
          ))}
        </div>
        {cons.length > 0 && (
          <ul className="mt-4 space-y-2" data-testid="constraints">
            {cons.map((c) => (
              <li key={c.id} className="flex gap-3 rounded-md border border-line-soft px-4 py-3 text-[13px]">
                <Badge tone={c.severity === "hard" ? "risk" : c.severity === "soft" ? "warn" : "neutral"} className="mt-0.5 shrink-0">
                  {c.severity === "hard" ? "优先约束" : c.severity === "soft" ? "需要留意" : "信息不足"}
                </Badge>
                <span>
                  <span className="text-fg">{c.title}</span>
                  <span className="text-muted"> — {c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 决策倾向与待确认的推断 */}
      {(shown?.tendencies.length || pendingTraits.length || pendingFacts.length) ? (
        <section aria-labelledby="h-tend">
          <h2 id="h-tend" className="smallcaps text-faint">
            你可能存在的决策倾向（初步推断，不是人格诊断）
          </h2>
          <ul className="mt-4 space-y-2">
            {[...pendingTraits, ...pendingFacts].map((i) => (
              <li key={i.id} className="flex flex-col gap-2 rounded-md border border-line-soft px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 text-[13.5px]">
                  <span className="text-fg">{i.key in FACT_SPEC ? `${FACT_SPEC[i.key as FactKey].label}：${i.label}？` : i.label}</span>
                  <p className="mt-0.5 text-[12px] text-muted">依据：{i.basis}</p>
                </div>
                {editable ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => store.review(i.id, true)}>
                      <Check className="h-3.5 w-3.5" /> 符合我
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => store.review(i.id, false)}>
                      <X className="h-3.5 w-3.5" /> 不符合
                    </Button>
                  </div>
                ) : (
                  <Badge tone="neutral">待确认推断</Badge>
                )}
              </li>
            ))}
            {shown?.tendencies
              .filter((t) => !pendingTraits.some((i) => i.label === t.text))
              .map((t) => (
                <li key={t.text} className="rounded-md border border-line-soft px-4 py-3 text-[13.5px]">
                  <span className="text-fg">{t.text}</span>
                  <p className="mt-0.5 text-[12px] text-muted">依据：{t.basis}</p>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {/* 七个维度 */}
      <section aria-labelledby="h-dims">
        <h2 id="h-dims" className="smallcaps text-faint">
          七个维度 · 可以展开查看依据并修改
        </h2>
        <ul className="mt-4 divide-y divide-line-soft border-y border-line-soft" data-testid="dimensions">
          {dims.map((d) => (
            <DimensionRow key={d.id} d={d} profile={profile} editable={editable} />
          ))}
        </ul>
      </section>

      {/* 不确定的事 */}
      {shown && shown.uncertainties.length > 0 && (
        <section aria-labelledby="h-unc">
          <h2 id="h-unc" className="smallcaps text-faint">
            我们还不确定的事情
          </h2>
          <ul className="mt-4 space-y-2 text-[13.5px]">
            {shown.uncertainties.map((u) => (
              <li key={u.item} className="flex gap-2">
                <span className="text-faint">·</span>
                <span>
                  <span className="text-fg">{u.item}</span>
                  <span className="text-muted"> — {u.impact}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 确认 */}
      <section className="rounded-lg border border-line p-5 sm:p-6" aria-labelledby="h-confirm">
        {editable ? (
          <>
            <h2 id="h-confirm" className="text-[16px] font-medium text-fg">
              确认后，我们才会用它组织你的研究方向
            </h2>
            <label className="mt-4 flex items-start gap-2.5 text-[13.5px] text-fg-2">
              <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              我已查看以上理解；不准确的地方已经修改或拒绝（之后仍可随时修改）。
            </label>
            <div className="mt-4 flex items-center gap-3 text-[13px] text-muted">
              <Switch checked={persist} onCheckedChange={setPersist} ariaLabel="仅保存在此设备" />
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> 仅保存在此设备（默认关闭：关闭页面后即清除，服务器不保存）
              </span>
            </div>
            <Button
              className="mt-6"
              variant="primary"
              size="lg"
              disabled={!ack}
              onClick={() => {
                store.confirm(persist);
                router.push("/paths");
              }}
            >
              确认，查看我的财富研究路径 <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <h2 id="h-confirm" className="text-[16px] font-medium text-fg">
              这是一位虚构用户的投资人格
            </h2>
            <p className="mt-2 text-[13px] text-muted">他的「原话」是为演示编写的示例。你可以继续看他的财富研究路径，或者开始你自己的对话。</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="primary" asChild>
                <Link href="/paths">
                  查看这位虚构用户的财富路径 <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/genesis">开始了解我</Link>
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DimensionRow({ d, profile, editable }: { d: Dimension; profile: IdentityProfile; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const keys = FACT_SPECS.filter((s) => s.dimension === d.id).map((s) => s.key);
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-4 py-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] text-fg">{d.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{d.summary}</p>
        </div>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 pb-5 text-[13px]">
          <div>
            <p className="text-[11.5px] text-faint">为什么我们这样理解你</p>
            {d.evidence.length === 0 ? (
              <p className="mt-1 text-muted">还没有相关信息。</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {d.evidence.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2">
                    <Badge tone={e.source === "inferred" ? "info" : "neutral"}>{SOURCE[e.source]}</Badge>
                    <span className="text-fg-2">{e.label}</span>
                    {e.quote && <span className="text-muted">——「{e.quote}」</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {d.unknown.length > 0 && <p className="text-faint">未知：{d.unknown.map((k) => FACT_SPEC[k].label).join("、")}</p>}
          {editable && (
            <div className="space-y-2 border-t border-line-soft pt-3">
              <p className="flex items-center gap-1.5 text-[11.5px] text-faint">
                <Pencil className="h-3 w-3" /> 如果判断错了，直接修改（修改后的内容不会再被 AI 改动）
              </p>
              {keys.map((k) => (
                <FactEditor key={k} k={k} profile={profile} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function FactEditor({ k, profile }: { k: FactKey; profile: IdentityProfile }) {
  const store = useIdentity();
  const spec = FACT_SPEC[k];
  const f = profile.facts[k];
  const [text, setText] = useState(f?.value ?? "");
  if (spec.text) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="w-48 shrink-0 text-muted" htmlFor={`edit-${k}`}>
          {spec.label}
        </label>
        <input
          id={`edit-${k}`}
          value={text}
          maxLength={80}
          onChange={(e) => setText(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-fg"
        />
        <Button size="sm" variant="secondary" disabled={!text.trim() || text === f?.value} onClick={() => store.setFact(k, text.trim())}>
          保存
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="w-48 shrink-0 text-muted" htmlFor={`edit-${k}`}>
        {spec.label}
      </label>
      <select
        id={`edit-${k}`}
        aria-label={`修改${spec.label}`}
        value={f?.value ?? ""}
        onChange={(e) => store.setFact(k, e.target.value || null)}
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-fg"
      >
        <option value="">未知 / 不回答</option>
        {spec.values.map((v) => (
          <option key={v.code} value={v.code}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  );
}
