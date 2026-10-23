"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CornerDownLeft, Loader2, Lock, Pause, SkipForward, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/primitives";
import { FACT_SPEC } from "@/lib/interview/catalog";
import { progress } from "@/lib/interview/engine";
import { CORE_BY_ID, INTERVIEW_LIMITS } from "@/lib/interview/questions";
import { useIdentity } from "@/lib/identity/store";
import { cn } from "@/lib/cn";

const SOURCE_LABEL = { stated: "你说的", selected: "你选择的", edited: "你修改的" } as const;

/** Genesis V2：由大模型驱动、程序约束的深度访谈。每次只问一个问题。 */
export function InterviewFlow() {
  const store = useIdentity();
  const { interview } = store;
  if (!interview) return <Intro onStart={store.startInterview} />;
  if (interview.status === "complete") return <Completion />;
  return <QuestionScreen />;
}

function Intro({ onStart }: { onStart: () => void }) {
  const store = useIdentity();
  const d = store.savedDraft;
  return (
    <section className="mx-auto max-w-[680px] animate-fade-up">
      {d && (
        <div role="status" className="mb-10 rounded-lg border border-line p-4 text-[13.5px]" data-testid="draft-banner">
          <p className="text-fg">
            这台设备上保存了一次未完成的访谈（{d.questions} 个问题，保存于 {new Date(d.savedAt).toLocaleString("zh-CN", { hour12: false })}）。
          </p>
          <p className="mt-1 text-[12.5px] text-muted">这是你之前主动选择保存的，24 小时后会自动删除。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={store.restoreDraft}>
              继续上次的访谈
            </Button>
            <Button size="sm" variant="ghost" onClick={store.discardDraft}>
              删除这份进度
            </Button>
          </div>
        </div>
      )}
      <p className="smallcaps text-faint">GENESIS · 01</p>
      <h1 className="display mt-4 text-[44px] text-fg sm:text-[64px]">
        先认识一下你<span className="galaxy-dot">.</span>
      </h1>
      <p className="mt-6 text-[15.5px] leading-[1.8] text-fg-2">
        在谈任何投资之前，我们想先了解：你希望金钱为你的人生带来什么、你现在的处境允许你承担多少风险。这是一次对话，不是考试——用你自己的话回答就好。
      </p>
      <ul className="mt-8 space-y-3 border-t border-line-soft pt-6 text-[13.5px] text-muted">
        <li>· 通常 10–16 个问题，最多 {INTERVIEW_LIMITS.maxQuestions} 个（含最多 {INTERVIEW_LIMITS.maxFollowUps} 个追问）。已经了解的内容不会重复问。</li>
        <li>· 每题都可以跳过、返回修改；你也可以随时暂停或提前结束。</li>
        <li>· 年龄、收入、储备等敏感问题可以只给区间，或选择不便透露。</li>
        <li className="flex gap-1.5">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          你的回答默认只保存在当前页面，服务器不保存；只有你主动开启时，才会临时保存在这台设备上。
        </li>
      </ul>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Button variant="primary" size="lg" onClick={onStart}>
          开始了解我 <ArrowRight className="h-4 w-4" />
        </Button>
        <Link href="/identity?demo=A" className="text-[13px] text-muted underline-offset-4 hover:text-fg hover:underline">
          先看看虚构用户的演示
        </Link>
      </div>
    </section>
  );
}

function QuestionScreen() {
  const store = useIdentity();
  const s = store.interview!;
  const q = s.current!;
  const p = progress(s);
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTurn = s.turns[s.turns.length - 1];

  // 换题时清空输入
  useEffect(() => {
    setText("");
    setChoice(null);
    inputRef.current?.focus();
  }, [q.id, q.text]);

  const canSend = !store.turn.pending && (text.trim().length > 0 || choice !== null);
  const send = () => canSend && store.answer(text.trim(), choice);
  const group = q.kind === "core" ? CORE_BY_ID[q.id]?.groupLabel : null;
  const followNo = q.kind === "followup" ? Number(q.id.split("-")[1]) : null;
  const bar = Math.round((s.turns.length / Math.max(1, s.turns.length + p.remainingEstimate + 1)) * 100);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-labelledby="question-text" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted" data-testid="interview-progress">
          <span>
            第 <span className="num text-fg">{p.asked}</span> 题 · 最多 {p.max} 题
          </span>
          <span>预计还需约 {p.remainingEstimate} 题{p.followUpsUsed ? ` · 已追问 ${p.followUpsUsed}/${p.maxFollowUps}` : ""}</span>
        </div>
        <div className="mt-2 h-[2px] w-full bg-line-soft" aria-hidden>
          <div className="h-full bg-fg/70 transition-[width] duration-500" style={{ width: `${bar}%` }} />
        </div>

        {lastTurn?.acknowledgment && (
          <div className="mt-8 flex gap-3 text-[14px] text-fg-2" data-testid="interview-ack">
            <LogoMark size={22} className="mt-0.5 text-muted" />
            <p className="leading-relaxed">{lastTurn.acknowledgment}</p>
          </div>
        )}
        {store.turn.fallback && (
          <p role="status" className="mt-4 rounded-md border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[12.5px] text-fg-2">
            {store.turn.fallback}：上一题只记录了你点选的选项，你写的文字没有被解析成任何结论。你可以稍后在投资人格页补充或修改。
          </p>
        )}

        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            {followNo ? (
              <Badge tone="info">
                <Sparkles className="h-3 w-3" /> 追问 {followNo}/{INTERVIEW_LIMITS.maxFollowUps}
              </Badge>
            ) : (
              group && <span className="smallcaps text-faint">{group}</span>
            )}
            {q.sensitive && (
              <Badge tone="neutral">
                <Lock className="h-3 w-3" /> 可以只给区间或不回答
              </Badge>
            )}
          </div>
          <h1 id="question-text" className="mt-3 text-[24px] leading-[1.45] font-medium text-fg sm:text-[28px]">
            {q.text}
          </h1>
          {q.reason && <p className="mt-2 text-[13px] text-muted">为什么问：{q.reason}</p>}
        </div>

        <div className="mt-6 space-y-4">
          <label className="sr-only" htmlFor="interview-answer">
            你的回答
          </label>
          <textarea
            id="interview-answer"
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder="用你自己的话说就好……（Enter 发送，Shift + Enter 换行）"
            disabled={store.turn.pending}
            className="w-full resize-none rounded-md border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-fg placeholder:text-faint focus:border-fg/40 focus:outline-none disabled:opacity-60"
          />
          {q.helper.kind === "chips" && (
            <div>
              <p className="mb-2 text-[11.5px] text-faint">也可以直接选择：</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="快捷选项">
                {q.helper.options.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    aria-pressed={choice === o.code}
                    disabled={store.turn.pending}
                    onClick={() => setChoice((c) => (c === o.code ? null : o.code))}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                      choice === o.code ? "border-fg bg-fg text-[#050505]" : "border-line text-fg-2 hover:border-fg/40 hover:text-fg",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {store.turn.error && (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[13px] text-fg-2">
              {store.turn.error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button variant="primary" onClick={send} disabled={!canSend}>
              {store.turn.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
              {store.turn.pending ? "正在理解你的回答…" : "发送"}
            </Button>
            <Button variant="ghost" onClick={store.skip} disabled={store.turn.pending}>
              <SkipForward className="h-4 w-4" /> 跳过
            </Button>
            {s.turns.length > 0 && (
              <Button variant="ghost" onClick={store.back} disabled={store.turn.pending}>
                <ArrowLeft className="h-4 w-4" /> 上一题
              </Button>
            )}
            <span className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">
                  <Pause className="h-3.5 w-3.5" /> 暂停
                </Link>
              </Button>
              {p.canFinish && (
                <Button variant="ghost" size="sm" onClick={store.finish} disabled={store.turn.pending}>
                  提前结束
                </Button>
              )}
            </span>
          </div>
          <div className="flex items-start gap-2.5 pt-2 text-[12px] text-muted">
            <Switch checked={store.draftConsent} onCheckedChange={store.setDraftConsent} ariaLabel="在本设备临时保存访谈进度" />
            <span>
              在本设备临时保存访谈进度（默认关闭）。开启后刷新页面也能继续；24 小时后自动删除，关闭开关会立即删除。
            </span>
          </div>
          {p.canFinish && p.keyGaps.length > 0 && (
            <p className="text-[11.5px] text-faint">
              现在结束也可以；以下信息仍未知，相关判断会更保守：{p.keyGaps.map((k) => FACT_SPEC[k].label).join("、")}。
            </p>
          )}
        </div>
      </section>
      <KnownPanel />
    </div>
  );
}

function KnownPanel() {
  const { interview } = useIdentity();
  const s = interview!;
  const facts = useMemo(() => Object.values(s.facts), [s.facts]);
  const pending = s.inferences.filter((i) => i.status === "pending");
  return (
    <aside aria-label="目前了解到的信息" className="space-y-5 border-t border-line-soft pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
      <div>
        <p className="smallcaps text-faint">目前了解到的</p>
        {facts.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-faint">还没有记录任何信息。</p>
        ) : (
          <ul className="mt-3 space-y-2.5" data-testid="known-facts">
            {facts.map((f) => (
              <li key={f!.key} className="text-[12.5px]">
                <span className="text-faint">{FACT_SPEC[f!.key].label}</span>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-fg-2">{f!.label}</span>
                  <span className="shrink-0 text-[10.5px] text-faint">{SOURCE_LABEL[f!.source]}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pending.length > 0 && (
        <p className="text-[12px] text-muted">另有 {pending.length} 条推断，需要你在投资人格页确认，确认前不会当作事实。</p>
      )}
      {s.skipped.length > 0 && <p className="text-[12px] text-faint">已跳过：{s.skipped.map((k) => FACT_SPEC[k].label).join("、")}（保持未知）</p>}
      {s.contradictions.length > 0 && (
        <div>
          <p className="smallcaps text-faint">值得留意</p>
          <ul className="mt-2 space-y-1.5 text-[12px] text-fg-2">
            {s.contradictions.map((c) => (
              <li key={c.id}>· {c.description}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function Completion() {
  const store = useIdentity();
  const router = useRouter();
  const s = store.interview!;
  const pending = s.inferences.filter((i) => i.status === "pending").length;
  return (
    <section className="mx-auto max-w-[640px] animate-fade-up">
      <p className="smallcaps text-faint">GENESIS · 完成</p>
      <h1 className="display mt-4 text-[40px] text-fg sm:text-[56px]">
        谢谢你的耐心<span className="galaxy-dot">.</span>
      </h1>
      <p className="mt-6 text-[15px] leading-[1.8] text-fg-2">
        这次对话一共 {s.turns.length} 个问题。我们记录了 {Object.keys(s.facts).length} 项你说出或选择的信息
        {s.skipped.length ? `，${s.skipped.length} 项你选择不回答（会保持未知）` : ""}
        {pending ? `，另有 ${pending} 条推断需要你确认` : ""}。
      </p>
      <p className="mt-3 text-[13.5px] text-muted">下一步，我们会把这些整理成一份可以逐条查看、修改和确认的投资人格。确认之前，它不会用于任何研究。</p>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            store.buildIdentity();
            router.push("/identity");
          }}
        >
          生成我的投资人格 <ArrowRight className="h-4 w-4" />
        </Button>
        {s.turns.length > 0 && s.turns.length < INTERVIEW_LIMITS.maxQuestions && (
          <Button variant="ghost" onClick={store.back}>
            <ArrowLeft className="h-4 w-4" /> 回到上一题
          </Button>
        )}
      </div>
    </section>
  );
}
