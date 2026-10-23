"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import type { LensId } from "@/types/profile";
import { useProfile } from "@/lib/profile/store";
import { PERSONA_META } from "@/lib/profile/personas";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";

export function useLensOptions() {
  const { userProfile } = useProfile();
  const selfReady = userProfile?.status === "confirmed";
  return [
    { value: "A" as LensId, label: <>画像 A</>, title: `虚构 · ${PERSONA_META.A.title}` },
    { value: "B" as LensId, label: <>画像 B</>, title: `虚构 · ${PERSONA_META.B.title}` },
    {
      value: "self" as LensId,
      label: (
        <>
          <UserRound className="h-3.5 w-3.5" />
          我的
        </>
      ),
      disabled: !selfReady,
      title: selfReady ? "使用你已确认的画像" : "完成并确认 Genesis 画像后可用",
    },
  ];
}

/** 紧凑分段切换：顶部栏 / 研究页使用。 */
export function LensSegmented({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  const { lens, setLens } = useProfile();
  const options = useLensOptions();
  return (
    <Segmented<LensId>
      ariaLabel="切换研究视角（画像）"
      value={(lens ?? "none") as LensId}
      onChange={setLens}
      options={options}
      size={size}
      className={className}
    />
  );
}

/** 侧边栏中的视角卡片。 */
export function LensCard({ className }: { className?: string }) {
  const { lens, activeProfile, userProfile, setLens } = useProfile();
  const meta = lens === "A" || lens === "B" ? PERSONA_META[lens] : null;
  return (
    <div className={cn("rounded-xl border border-line-soft bg-bg-deep/50 p-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="kicker">研究视角</span>
        {lens && (
          <button type="button" onClick={() => setLens(null)} className="text-[11px] text-faint hover:text-fg-2">
            通用
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(["A", "B", "self"] as LensId[]).map((id) => {
          const disabled = id === "self" && userProfile?.status !== "confirmed";
          const active = lens === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => setLens(id)}
              title={disabled ? "完成 Genesis 并确认后可用" : undefined}
              className={cn(
                "h-8 rounded-lg border text-[12px] font-medium transition-colors",
                active ? "border-brand/50 bg-brand-soft text-fg" : "border-line-soft text-muted hover:border-line hover:text-fg-2",
                disabled && "opacity-40",
              )}
            >
              {id === "self" ? "我的" : id}
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11.5px] leading-snug text-muted">
        {meta ? (
          <>
            <span className="text-fg-2">虚构 · {meta.title}</span>
            <br />
            {meta.tagline}
          </>
        ) : activeProfile ? (
          <span className="text-fg-2">你的已确认画像</span>
        ) : lens === "self" ? (
          <>
            画像待确认，暂用通用视角。{" "}
            <Link href="/settings/profile" className="text-brand hover:underline">
              去确认
            </Link>
          </>
        ) : (
          "通用视角：未使用任何画像"
        )}
      </p>
    </div>
  );
}
