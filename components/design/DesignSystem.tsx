"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Palette } from "lucide-react";
import { useState } from "react";
import { color } from "@/lib/design-tokens/tokens";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Badge, DemoBadge, FictionBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { SeverityMeter, Skeleton, Slider, Switch } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { StateView } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const SWATCHES: { name: string; token: string; hex: string; note: string }[] = [
  { name: "Background", token: "--color-bg", hex: color.bg, note: "页面底色" },
  { name: "Surface", token: "--color-surface", hex: color.surface, note: "面板" },
  { name: "Surface 2", token: "--color-surface-2", hex: color.surface2, note: "卡片 / 输入" },
  { name: "Line", token: "--color-line", hex: color.line, note: "边框" },
  { name: "Foreground", token: "--color-fg", hex: color.fg, note: "主文字" },
  { name: "Muted", token: "--color-muted", hex: color.muted, note: "次级文字" },
  { name: "Galaxy Ivory", token: "--color-brand", hex: color.brand, note: "主强调：按钮 / 选中 / 焦点" },
  { name: "Verified · Sage", token: "--color-teal", hex: color.teal, note: "功能色：已核验 / 真实数据 / 与你有关" },
  { name: "Galaxy Red", token: "--color-galaxy", hex: color.galaxy, note: "只用于品牌句点与短线" },
  { name: "Ivory Section", token: "--color-ivory", hex: color.ivory, note: "Galaxy 反白区" },
  { name: "Up", token: "--color-up", hex: color.up, note: "上涨（A 股红涨）" },
  { name: "Down", token: "--color-down", hex: color.down, note: "下跌（A 股绿跌）" },
  { name: "Warn", token: "--color-warn", hex: color.warn, note: "演示 / 待确认" },
  { name: "Risk", token: "--color-risk", hex: color.risk, note: "风险强调（与涨跌分离）" },
];

const LIVE_STATES = [
  { label: "加载中（慢速）", href: "/research/510300.SH?simulate=slow" },
  { label: "服务错误", href: "/research/510300.SH?simulate=error" },
  { label: "未授权", href: "/research/510300.SH?simulate=unauthorized" },
  { label: "不支持的标的", href: "/research/600519.SH" },
  { label: "空图表数据", href: "/research/510300.SH?simulate=empty" },
];

export function DesignSystem() {
  const toast = useToast();
  const [seg, setSeg] = useState<"1M" | "1Y" | "3Y">("1Y");
  const [v, setV] = useState(40);
  const [sw, setSw] = useState(false);

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-5 sm:px-6 lg:py-6">
      <section>
        <span className="kicker">Design System</span>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">InvestLens by Galaxy · 设计系统</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          沿用 Galaxy 官网设计系统的语义色板、字体与版式。CSS 变量定义于 <code className="num text-fg-2">app/globals.css</code>，TS 镜像位于{" "}
          <code className="num text-fg-2">lib/design-tokens/tokens.ts</code>。
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel className="lg:col-span-5">
          <PanelHeader icon={<Palette />} kicker="Brand" title="品牌标识" />
          <div className="space-y-5 px-5 pb-5">
            <div className="flex items-center gap-6 rounded-xl border border-line-soft bg-bg-deep/50 p-6">
              <LogoMark size={64} />
              <Logo size={34} showTagline />
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted">
              InvestLens 是 Galaxy 旗下的个人 AI 投资研究产品，直接使用 Galaxy 官网的品牌符号（圆环与两条交叉轨道）、Inter 字体、近黑 / 象牙白配色与发丝线版式；Galaxy 红只出现在字标句点上。资产从 Galaxy 官网项目只读复制，未修改原项目。
            </p>
          </div>
        </Panel>

        <Panel className="lg:col-span-7">
          <PanelHeader kicker="Tokens" title="语义色板" />
          <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-3">
            {SWATCHES.map((s) => (
              <div key={s.token} className="overflow-hidden rounded-xl border border-line-soft">
                <div className="h-12" style={{ background: s.hex }} />
                <div className="px-3 py-2">
                  <div className="text-[12px] font-medium">{s.name}</div>
                  <div className="num text-[10.5px] text-faint">{s.hex}</div>
                  <div className="text-[10.5px] text-muted">{s.note}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="lg:col-span-6">
          <PanelHeader kicker="Typography" title="字体与数字" />
          <div className="space-y-3 px-5 pb-5">
            <p className="text-[36px] leading-tight font-semibold tracking-[-0.03em]">先理解你</p>
            <p className="text-[20px] font-semibold">标题 20 / Semibold</p>
            <p className="text-[14px] text-fg-2">正文 14 / Inter（Galaxy）+ 中文系统无衬线</p>
            <p className="text-[12px] text-muted">辅助 12 / Muted</p>
            <p className="num text-[24px]">3.968 +1.27% 12,345.60</p>
            <p className="text-[12px] text-faint">标题沿用 Galaxy 的紧排大写英文；数字使用 Geist Mono 等宽表格数字（tabular-nums），保证行情列对齐。</p>
          </div>
        </Panel>

        <Panel className="lg:col-span-6">
          <PanelHeader kicker="Components" title="控件" />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => toast("主要操作已触发")}>Primary</Button>
              <Button variant="secondary" onClick={() => toast("次要操作已触发", "info")}>Secondary</Button>
              <Button variant="teal" onClick={() => toast("确认操作已触发")}>Teal</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger" onClick={() => toast("危险操作示例", "warn")}>Danger</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DemoBadge />
              <FictionBadge />
              <Badge tone="brand">Brand</Badge>
              <Badge tone="teal">Teal</Badge>
              <Badge tone="risk">Risk</Badge>
              <Badge tone="up">涨</Badge>
              <Badge tone="down">跌</Badge>
              <SeverityMeter level={3} />
              <SeverityMeter level={1} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Segmented ariaLabel="示例分段" value={seg} onChange={setSeg} options={[{ value: "1M", label: "1月" }, { value: "1Y", label: "1年" }, { value: "3Y", label: "3年" }]} size="sm" />
              <Switch checked={sw} onCheckedChange={setSw} ariaLabel="示例开关" />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-[12px] text-muted">
                <span>Slider</span>
                <span className="num text-fg">{v}</span>
              </div>
              <Slider value={v} onValueChange={setV} min={0} max={100} ariaLabel="示例滑杆" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
        </Panel>

        <Panel className="lg:col-span-12">
          <PanelHeader kicker="States" title="数据状态（未知值绝不显示为 0）" />
          <div className="grid gap-px overflow-hidden border-t border-line-soft bg-line-soft sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["empty", "暂无数据", "数据源返回为空，我们不会插值或随机填充。"],
                ["error", "服务暂时不可用", "上游失败会显式报错，不会静默回退到演示数据。"],
                ["unauthorized", "没有访问权限", "第二迭代将真实反映 API Key 的数据权限。"],
                ["unknown", "未知值", "如折溢价率缺失时显示「未知」，而不是 0。"],
                ["unsupported", "暂未接入该标的", "不会为没有数据的标的生成分析。"],
                ["anomaly", "数据异常或冲突", "多个来源不一致时标注冲突并展示双方。"],
              ] as const
            ).map(([k, t, d]) => (
              <div key={k} className="bg-surface">
                <StateView kind={k} title={t} description={d} compact />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-4">
            <span className="text-[12px] text-muted">在真实页面中触发（故障注入）：</span>
            {LIVE_STATES.map((s) => (
              <Link key={s.href} href={s.href} className="inline-flex items-center gap-1 rounded-full border border-line-soft px-3 py-1 text-[12px] text-fg-2 transition-colors hover:border-brand/40 hover:text-fg">
                {s.label} <ExternalLink className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <Link href="/app" className="inline-flex items-center gap-1 text-[13px] text-brand hover:underline">
        返回主页 <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
