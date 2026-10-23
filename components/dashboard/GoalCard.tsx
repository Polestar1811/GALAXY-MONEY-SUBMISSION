"use client";

import type { InvestorProfile, ProfileSignals } from "@/types/profile";
import type { AppliedRule } from "@/types/research";
import { optionLabel } from "@/lib/profile/fields";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

const HORIZON_YEARS: Record<string, number> = { lt1y: 1, "1to3y": 3, "3to5y": 5, "5to10y": 10, gt10y: 15 };
const WILL: Record<string, number> = { conservative: 1, cautious: 2, balanced: 3, growth: 4, aggressive: 5 };
const CAP: Record<string, number> = { lt5: 1, "5to10": 2, "10to20": 3, "20to35": 4, gt35: 5 };

/** 目标与约束：期限时间轴 + 「愿意 vs 能够」对照。 */
export function GoalCard({ profile, signals, rules }: { profile: InvestorProfile; signals: ProfileSignals; rules?: AppliedRule[] }) {
  const years = profile.horizon ? HORIZON_YEARS[profile.horizon] : null;
  const needPct = years ? Math.min(100, (1 / years) * 100) : null;
  const showNeed = needPct !== null && !!profile.liquidityNeed && profile.liquidityNeed !== "none";
  const nearEnd = needPct !== null && needPct >= 70;
  const will = profile.riskWillingness ? WILL[profile.riskWillingness] : null;
  const cap = profile.lossCapacity ? CAP[profile.lossCapacity] : null;

  return (
    <div className="space-y-5 px-5 pb-5">
      <div>
        <div className="text-[11.5px] text-muted">投资目标</div>
        <div className="mt-1 text-[19px] font-semibold tracking-[-0.01em]">{optionLabel("goal", profile.goal) ?? "未回答"}</div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-[11.5px]">
          <span className="text-muted">投资期限</span>
          <span className="text-fg-2">{optionLabel("horizon", profile.horizon) ?? "未回答"}</span>
        </div>
        <div className="relative h-9">
          <div className="absolute top-4 right-0 left-0 h-1 rounded-full bg-line" />
          {years && <div className="absolute top-4 left-0 h-1 rounded-full bg-fg/70" style={{ width: "100%" }} />}
          <span className="absolute top-[11px] left-0 h-[11px] w-[11px] rounded-full border-2 border-bg bg-brand" />
          <span className="absolute top-[22px] left-0 text-[10.5px] text-faint">现在</span>
          {showNeed && (
            <span className="absolute top-0" style={{ left: `${needPct}%` }}>
              <span className="block h-[22px] w-[2px] -translate-x-1/2 bg-risk" />
              <span
                className={cn("absolute top-[22px] text-[10.5px] whitespace-nowrap text-risk", nearEnd ? "right-0" : "-translate-x-1/2")}
              >
                12 个月 · 可能用款
              </span>
            </span>
          )}
          {!(showNeed && nearEnd) && (
            <span className="absolute top-[22px] right-0 text-[10.5px] text-faint">{years ? (years >= 15 ? "10 年+" : `${years} 年`) : "?"}</span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11.5px] text-muted">愿意承受 vs 能够承受</span>
          {signals.willingnessExceedsCapacity ? <Badge tone="warn">存在差距</Badge> : <Badge tone="teal">一致</Badge>}
        </div>
        {(
          [
            ["主观偏好", will, optionLabel("riskWillingness", profile.riskWillingness), "bg-brand"],
            ["客观能力", cap, optionLabel("lossCapacity", profile.lossCapacity), "bg-teal"],
          ] as const
        ).map(([label, v, text, cls]) => (
          <div key={label} className="mb-2 grid grid-cols-[56px_1fr] items-center gap-2">
            <span className="text-[11.5px] text-faint">{label}</span>
            <div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={cn("h-1.5 flex-1 rounded-full", v !== null && i <= v ? cls : "bg-line")} />
                ))}
              </div>
              <div className="mt-1 text-[11px] text-muted">{text ?? "未回答"}</div>
            </div>
          </div>
        ))}
        {signals.willingnessExceedsCapacity && (
          <p className="text-[11.5px] leading-relaxed text-muted">研究边界以「客观能力」为准，主观偏好仅用于提示行为风险。</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11.5px]">
        <div className="rounded-lg border border-line-soft px-2.5 py-2">
          <div className="text-faint">近期资金需要</div>
          <div className="mt-0.5 text-fg-2">{optionLabel("liquidityNeed", profile.liquidityNeed) ?? "未回答"}</div>
        </div>
        <div className="rounded-lg border border-line-soft px-2.5 py-2">
          <div className="text-faint">独立应急储备</div>
          <div className="mt-0.5 text-fg-2">{optionLabel("emergencyReserve", profile.emergencyReserve) ?? "未回答"}</div>
        </div>
      </div>

      {rules && rules.length > 0 && (
        <div>
          <div className="kicker mb-2">这些约束如何改变了你的简报</div>
          <ul className="space-y-1.5">
            {rules.map((r) => (
              <li key={r.ruleId} className="flex gap-2 text-[12px] leading-relaxed">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                <span className="text-fg-2">
                  <span className="text-muted">{r.ruleName}：</span>
                  {r.effect}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
