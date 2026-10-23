"use client";

import Link from "next/link";
import {
  ChevronDown,
  Database,
  EyeOff,
  FileJson,
  HardDrive,
  ListTree,
  Lock,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import type { InvestorProfile, ProfileFieldKey, ProfileValues } from "@/types/profile";
import { PROFILE_FIELDS, optionLabel } from "@/lib/profile/fields";
import { PERSONA_A, PERSONA_B } from "@/lib/profile/personas";
import { STORAGE_KEY, useProfile } from "@/lib/profile/store";
import { IDENTITY_STORAGE_KEY, useIdentity } from "@/lib/identity/store";
import { RULES } from "@/lib/personalization/rules";
import { deriveSignals, SIGNAL_LABELS } from "@/lib/personalization/signals";
import { Badge, FictionBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Switch } from "@/components/ui/primitives";
import { PanelSkeleton, StateView } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export function ProfileManager() {
  const p = useProfile();
  const identity = useIdentity();
  const toast = useToast();
  const [clearOpen, setClearOpen] = useState(false);
  const [openField, setOpenField] = useState<ProfileFieldKey | null>(null);
  const [showJson, setShowJson] = useState(false);

  if (!p.hydrated) return <PanelSkeleton rows={6} className="mx-auto max-w-[1200px]" />;
  const up = p.userProfile;
  const signals = deriveSignals(up);

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-5 sm:px-6 lg:py-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="kicker">Profile & Privacy</span>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">画像与隐私</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            查看 InvestLens 知道关于你的什么、它如何影响研究内容，并随时修改或清除。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={!up ? "neutral" : up.status === "confirmed" ? "teal" : "warn"}>
            {!up ? "未建立画像" : up.status === "confirmed" ? "已确认" : "有未确认修改"}
          </Badge>
          <Badge tone={p.storedLocally ? "brand" : "neutral"}>
            {p.storedLocally ? <HardDrive className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {p.storedLocally ? "已保存在此设备" : "仅内存 · 不保存"}
          </Badge>
        </div>
      </section>

      {up && up.status === "draft" && (
        <div className="flex flex-col gap-3 rounded-lg border border-warn/30 bg-warn/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-fg-2">
            你修改了画像。<span className="text-muted">确认前，研究页的「我的」视角暂时使用通用顺序，不会把未确认的信息当作事实。</span>
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              p.confirmProfile();
              toast("画像已确认，研究视角已更新");
            }}
          >
            确认修改
          </Button>
        </div>
      )}

      <Panel data-testid="identity-privacy">
        <PanelHeader
          icon={<Sparkles />}
          kicker="Galaxy Money"
          title="投资人格与访谈"
          actions={
            identity.identity && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/identity">查看与修改</Link>
              </Button>
            )
          }
        />
        <div className="grid gap-3 px-5 pb-5 text-[13px] sm:grid-cols-3">
          <div>
            <p className="text-[11.5px] text-faint">访谈回答</p>
            <p className="mt-1 text-fg-2">
              {identity.interview
                ? `${identity.interview.turns.length} 个问题 · ${identity.draftConsent ? "已按你的选择临时保存在此设备（24 小时）" : "仅在本页面内存中"}`
                : identity.savedDraft
                  ? `此设备上有一份未完成的访谈进度（${identity.savedDraft.questions} 题）`
                  : "无"}
            </p>
          </div>
          <div>
            <p className="text-[11.5px] text-faint">投资人格</p>
            <p className="mt-1 text-fg-2">
              {identity.identity ? `${Object.keys(identity.identity.facts).length} 项信息 · ${identity.identity.confirmed ? "已确认" : "待确认"}` : "未建立"}
            </p>
          </div>
          <div>
            <p className="text-[11.5px] text-faint">保存位置</p>
            <p className="mt-1 text-fg-2">{identity.persistLocal ? `此设备（${IDENTITY_STORAGE_KEY}）` : "仅内存，关闭页面即清除"}</p>
          </div>
          <p className="text-[12px] text-muted sm:col-span-3">
            服务器不存储你的访谈内容或投资人格。生成理解与研究路径时，只发送结构化的字段取值（不发送你的原话）；访谈每一轮只发送当前这一问一答。
          </p>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Panel>
            <PanelHeader
              icon={<UserRound />}
              kicker="我的画像"
              title="你提供的信息"
              actions={
                up && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/genesis">重新建档</Link>
                  </Button>
                )
              }
            />
            {!up ? (
              <StateView
                kind="empty"
                title="还没有你的画像"
                description="InvestLens 目前对你一无所知。建立画像大约需要 3 分钟，每个问题都可以跳过。"
                action={
                  <>
                    <Button asChild variant="primary" size="sm">
                      <Link href="/genesis">开始 Genesis 建档</Link>
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => p.setLens("A")}>
                      先用虚构画像 A
                    </Button>
                  </>
                }
              />
            ) : (
              <ul className="divide-y divide-line-soft border-t border-line-soft">
                {PROFILE_FIELDS.map((f) => {
                  const value = up[f.key];
                  const skipped = up.skipped.includes(f.key);
                  const expanded = openField === f.key;
                  return (
                    <li key={f.key} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="w-full min-w-0 sm:w-[150px]">
                          <div className="text-[13px] font-medium text-fg">{f.label}</div>
                          <div className="text-[11px] text-faint">
                            {value ? "你的回答" : skipped ? "你已跳过" : "未回答"}
                            {f.sensitive && " · 谨慎信息"}
                          </div>
                        </div>
                        <div className="relative min-w-0 flex-1">
                          <label htmlFor={`f-${f.key}`} className="sr-only">
                            修改{f.label}
                          </label>
                          <select
                            id={`f-${f.key}`}
                            value={value ?? ""}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              p.updateField(f.key, e.target.value as ProfileValues[typeof f.key]);
                              toast(`已修改「${f.label}」，确认后生效`, "info");
                            }}
                            className={cn(
                              "h-9 w-full appearance-none rounded-md border bg-bg-deep/60 pr-8 pl-3 text-[13px] focus:border-brand/50 focus:outline-none",
                              value ? "border-line-soft text-fg" : "border-dashed border-line text-faint",
                            )}
                          >
                            <option value="" disabled>
                              {skipped ? "已跳过 —— 选择以补充" : "未回答 —— 选择以补充"}
                            </option>
                            {f.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute top-2.5 right-2.5 h-4 w-4 text-faint" />
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`查看「${f.label}」如何影响研究`}
                            aria-expanded={expanded}
                            onClick={() => setOpenField(expanded ? null : f.key)}
                          >
                            <ListTree className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`移除「${f.label}」`}
                            disabled={!value}
                            onClick={() => {
                              p.removeField(f.key);
                              toast(`已移除「${f.label}」`, "info");
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {expanded && (
                        <div className="mt-3 animate-fade-up rounded-lg border border-line-soft bg-bg-deep/40 px-3.5 py-3">
                          <div className="kicker mb-1.5">这项信息如何影响研究</div>
                          <ul className="space-y-1">
                            {f.influences.map((x) => (
                              <li key={x} className="text-[12.5px] leading-relaxed text-fg-2">
                                · {x}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {RULES.filter((r) => r.field === f.key || (f.key === "emergencyReserve" && r.id === "R1-liquidity") || (f.key === "lossCapacity" && r.id === "R6-gap")).map((r) => (
                              <Badge key={r.id} tone="brand">
                                {r.id} {r.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader icon={<Sparkles />} kicker="透明规则" title="全部个性化规则（演示逻辑）" actions={<Badge>{RULES.length} 条</Badge>} />
            <div className="px-5 pb-5">
              <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
                第一迭代使用确定性规则，而不是大模型。每条规则只能调整研究顺序、风险强调与解释，<b className="font-medium text-fg-2">不能修改任何事实数据</b>。
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {RULES.map((r) => {
                  const hit = up?.status === "confirmed" && r.when(signals, up);
                  return (
                    <li key={r.id} className={cn("rounded-xl border px-3.5 py-2.5", hit ? "border-brand/30 bg-brand-soft/40" : "border-line-soft")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">{r.name}</span>
                        {hit ? <Badge tone="brand">对你生效</Badge> : <span className="num text-[10.5px] text-faint">{r.id}</span>}
                      </div>
                      <p className="mt-1 text-[12px] text-muted">{r.effect}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Panel>
        </div>

        <div className="space-y-4 lg:col-span-5">
          <Panel>
            <PanelHeader icon={<Lock />} kicker="隐私控制" title="存储与授权" />
            <div className="space-y-4 px-5 pb-5">
              <div className="flex items-start justify-between gap-4 rounded-xl border border-line-soft bg-bg-deep/40 p-3.5">
                <div>
                  <label htmlFor="consent" className="text-[13px] font-medium text-fg">
                    仅保存在此设备
                  </label>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    开启后写入此浏览器 localStorage（键名 <code className="num text-fg-2">{STORAGE_KEY}</code>），不上传任何服务器。关闭即立即删除。
                  </p>
                </div>
                <Switch
                  id="consent"
                  checked={!!up?.consent.persistLocal}
                  onCheckedChange={(v) => {
                    if (!up) return;
                    p.setConsent(v);
                    toast(v ? "已保存在此设备" : "已从此设备删除，仅保留在本次会话内存中", v ? "success" : "info");
                  }}
                />
              </div>
              {!up && <p className="text-[12px] text-faint">建立画像后才能选择是否保存。</p>}

              <div>
                <button
                  type="button"
                  onClick={() => setShowJson((v) => !v)}
                  aria-expanded={showJson}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-brand hover:underline"
                >
                  <FileJson className="h-3.5 w-3.5" /> {showJson ? "收起" : "查看"}此设备实际存储的内容
                </button>
                {showJson && (
                  <pre className="num mt-2 max-h-64 overflow-auto rounded-lg border border-line-soft bg-bg-deep p-3 text-[11px] leading-relaxed text-fg-2">
                    {(() => {
                      const raw = p.readStored();
                      if (!raw) return "（空）此设备没有保存任何 InvestLens 画像数据。";
                      try {
                        return JSON.stringify(JSON.parse(raw), null, 2);
                      } catch {
                        return raw;
                      }
                    })()}
                  </pre>
                )}
              </div>

              <div className="rounded-xl border border-danger/25 bg-danger/[0.05] p-3.5">
                <div className="text-[13px] font-medium text-fg">清除全部个人资料</div>
                <p className="mt-0.5 text-[12px] text-muted">删除内存与本设备中的投资人格、访谈回答、研究路径与视角选择。</p>
                <Button variant="danger" size="sm" className="mt-3" onClick={() => setClearOpen(true)} disabled={!up && !p.storedLocally && !identity.identity && !identity.interview && !identity.savedDraft}>
                  <Trash2 className="h-3.5 w-3.5" /> 一键清除
                </Button>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader icon={<ShieldCheck />} kicker="承诺" title="InvestLens 不会做的事" />
            <ul className="space-y-2.5 px-5 pb-5 text-[12.5px] leading-relaxed text-fg-2">
              {[
                "不询问或推断具体收入、资产规模、持仓明细。",
                "不推断政治、健康、宗教、民族等敏感属性。",
                "不把系统推断的「研究视角」当作关于你的事实，所有推断均有标注。",
                "不使用画像引导更频繁的交易，不提供买卖指令或收益承诺。",
                "未经你明确同意，不在任何地方持久保存画像。",
              ].map((x) => (
                <li key={x} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                  {x}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader icon={<Database />} kicker="演示画像" title="虚构画像 A / B 对照" actions={<FictionBadge />} />
            <div className="overflow-x-auto px-5 pb-5">
              <table className="w-full min-w-[320px] text-left text-[12px]">
                <thead>
                  <tr className="text-faint">
                    <th className="py-1.5 font-normal">字段</th>
                    <th className="py-1.5 font-normal">A · 近期用款</th>
                    <th className="py-1.5 font-normal">B · 长期储备</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {PROFILE_FIELDS.map((f) => (
                    <tr key={f.key}>
                      <td className="py-1.5 pr-2 text-muted">{f.label.replace("（可选）", "")}</td>
                      <td className="py-1.5 pr-2 text-fg-2">{optionLabel(f.key, PERSONA_A[f.key]) ?? "—"}</td>
                      <td className="py-1.5 text-fg-2">{optionLabel(f.key, PERSONA_B[f.key]) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => (p.setLens("A"), toast("已切换到虚构画像 A", "info"))}>
                  使用 A
                </Button>
                <Button size="sm" variant="secondary" onClick={() => (p.setLens("B"), toast("已切换到虚构画像 B", "info"))}>
                  使用 B
                </Button>
              </div>
            </div>
          </Panel>

          {up && (
            <Panel className="p-5">
              <div className="kicker mb-2">你的研究视角（推断）</div>
              <SignalsGrid profile={up} />
            </Panel>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="清除全部个人资料？"
        description="将删除内存与此设备中的投资人格、访谈回答、研究路径与视角选择。此操作无法撤销。"
        confirmLabel="确认清除"
        danger
        onConfirm={() => {
          // 同时清除 V2 访谈、投资人格与研究路径缓存（identity.clear 内部也会清除原有画像）
          identity.clear();
          toast("已清除全部个人资料");
        }}
      />
    </div>
  );
}

function SignalsGrid({ profile }: { profile: InvestorProfile }) {
  const s = deriveSignals(profile);
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {(
        [
          ["期限视角", SIGNAL_LABELS.horizon[s.horizon]],
          ["流动性压力", SIGNAL_LABELS.liquidityPressure[s.liquidityPressure]],
          ["客观承受能力", SIGNAL_LABELS.capacity[s.capacity]],
          ["主观偏好", SIGNAL_LABELS.willingness[s.willingness]],
          ["经验", SIGNAL_LABELS.experience[s.experience]],
          ["解释深度", SIGNAL_LABELS.depth[s.depth]],
        ] as const
      ).map(([k, v]) => (
        <div key={k} className="rounded-lg border border-line-soft px-2.5 py-1.5">
          <div className="text-[10.5px] text-faint">{k}</div>
          <div className="text-[12.5px] text-fg-2">{v}</div>
        </div>
      ))}
    </div>
  );
}
