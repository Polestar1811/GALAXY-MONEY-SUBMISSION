import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

/**
 * Galaxy Money · Welcome
 * 首屏不再是行情终端：先说明为什么 AI 要先理解人，再给出两个入口（开始了解我 / 直接体验演示）；
 * 有经验的用户可以直接进入 InvestLens 专业工作台。
 */

const QUESTIONS = [
  "我为什么需要投资？",
  "我的钱应该怎样服务我的人生目标？",
  "以我现在的经济条件，能承担多大的风险？",
  "我是不是应该先建立应急储备？",
  "哪些研究方向值得我了解？",
  "不同选择可能带来怎样的结果和代价？",
];

const STAGES = [
  { n: "01", t: "认识 Galaxy Money", d: "为什么先了解你，而不是先推荐投资标的。", href: "#why" },
  { n: "02", t: "Genesis 深度访谈", d: "一次自然的对话：人生阶段、财务约束、动机与决策心理。最多 20 个问题，随时可以跳过。", href: "/genesis" },
  { n: "03", t: "投资人格", d: "七个维度的理解，每个判断都说明来自你的哪句话；你可以逐条修改。", href: "/identity?demo=A" },
  { n: "04", t: "财富研究路径", d: "根据你的真实约束，给出三条值得进一步研究的方向，以及各自的风险与代价。", href: "/paths?demo=A" },
  { n: "05", t: "组合探索", d: "用真实历史数据比较不同资产组合的收益、下跌幅度与波动。", href: "/explore?path=B" },
  { n: "06", t: "InvestLens 专业工作台", d: "行情、估值、回撤、AI 研究 Agent 与证据追溯。按需进入，不是默认的第一屏。", href: "/research/510300.SH?mode=simple" },
];

const DEMOS = [
  {
    id: "A",
    title: "用户 A · 一年内要结婚",
    lines: ["准备拿 10 万元投资，希望一年翻倍", "其中约 6 万元明年结婚要用", "存款基本都在这 10 万里"],
    note: "愿意承担的风险，高于实际能承受的风险",
  },
  {
    id: "B",
    title: "用户 B · 为十年后养老做准备",
    lines: ["期限 10 年以上，应急资金独立", "下跌时选择按计划持有", "希望长期稳健增长"],
    note: "有足够的时间与缓冲去研究长期增长",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-bg">
      <header className="absolute inset-x-0 top-0 z-20 border-b border-white/[0.12]">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-6 px-5 sm:px-10 lg:px-[5vw]">
          <Link href="/" aria-label="Galaxy Money 首页">
            <Logo />
          </Link>
          <nav aria-label="首页导航" className="ml-auto hidden items-center gap-8 text-[11px] font-semibold tracking-[0.08em] text-[#9c9d9b] lg:flex">
            <a href="#why" className="transition-colors hover:text-white">为什么先了解你</a>
            <a href="#stages" className="transition-colors hover:text-white">六个阶段</a>
            <a href="#demo" className="transition-colors hover:text-white">体验演示</a>
            <a href="#principles" className="transition-colors hover:text-white">原则</a>
          </nav>
          <div className="ml-auto flex items-center gap-5 lg:ml-0">
            <Link href="/research/510300.SH" className="hidden text-[12px] font-semibold text-fg-2 transition-colors hover:text-white sm:inline">
              InvestLens
            </Link>
            <Link href="/genesis" className="inline-flex h-9 items-center rounded-[3px] bg-fg px-4 text-[12.5px] font-semibold text-[#050505] transition-colors hover:bg-white">
              开始了解我
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative isolate flex min-h-[720px] flex-col overflow-hidden px-5 pt-[120px] sm:px-10 lg:h-[100svh] lg:max-h-[980px] lg:px-[5vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/filament-torus.webp"
            alt=""
            aria-hidden
            className="filament pointer-events-none absolute top-[6%] right-[-42%] -z-10 aspect-square h-[70%] max-w-none opacity-40 sm:right-[-16%] sm:opacity-55 lg:top-0 lg:right-[-4%] lg:h-full lg:opacity-80"
          />
          <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
            <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.16em] text-[#858783] uppercase">
              <span>Human-centered investing</span>
              <span className="hidden sm:inline">Galaxy Money · V2</span>
            </div>
            <div className="mt-auto mb-[clamp(40px,8vh,88px)] max-w-[980px]">
              <p className="mb-5 text-[11px] font-semibold tracking-[0.2em] text-[#b5b5af] uppercase">AI can do the work. Only you can live the life.</p>
              <h1 className="display text-[clamp(48px,8.6vw,132px)] text-fg">
                先理解你<span className="text-[#878784]">，</span>
                <span className="block">
                  再理解市场<span className="galaxy-dot">.</span>
                </span>
              </h1>
              <p className="mt-8 max-w-[620px] text-[15.5px] leading-[1.85] text-fg-2">
                大多数金融 AI 从「你想买哪只股票」开始。Galaxy Money 从另一个问题开始：<span className="text-fg">你希望金钱为你的人生带来什么？</span>
                AI 帮你获得充分的信息、看懂不同选择的代价——决定始终由你做出。
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                <Link href="/genesis" className="inline-flex h-12 items-center gap-2 rounded-[3px] bg-fg px-6 text-[15px] font-semibold text-[#050505] transition-colors hover:bg-white">
                  开始了解我 <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#demo" className="text-action text-fg">
                  <span>直接体验演示</span>
                  <span aria-hidden>↓</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* 为什么先了解你 */}
        <section id="why" className="scroll-mt-20 border-t border-line-soft px-5 py-24 sm:px-10 lg:px-[5vw]">
          <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div>
              <p className="smallcaps text-faint">01 / WHY</p>
              <h2 className="display mt-5 text-[clamp(34px,4.6vw,64px)] text-fg">
                普通人的问题，
                <span className="block text-[#878784]">往往不是一只股票。</span>
              </h2>
              <p className="mt-6 max-w-[520px] text-[14.5px] leading-[1.85] text-muted">
                同样一只基金，对一年后要结婚的人和为十年后养老的人，意义完全不同。如果 AI 不先了解你的处境，再专业的分析也可能回答错了问题。
              </p>
            </div>
            <ol className="grid gap-px self-end overflow-hidden rounded-lg border border-line-soft bg-line-soft sm:grid-cols-2">
              {QUESTIONS.map((q, i) => (
                <li key={q} className="bg-bg px-5 py-6">
                  <span className="num text-[11px] text-faint">0{i + 1}</span>
                  <p className="mt-2 text-[16px] text-fg">{q}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 六个阶段 */}
        <section id="stages" className="scroll-mt-20 border-t border-line-soft bg-ivory px-5 py-24 text-ink sm:px-10 lg:px-[5vw]">
          <div className="mx-auto max-w-[1440px]">
            <p className="smallcaps text-[#666862]">02 / HOW</p>
            <h2 className="display mt-5 text-[clamp(34px,4.6vw,64px)]">从你的人生出发，再到市场<span className="galaxy-dot">.</span></h2>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-[#cecec7] bg-[#cecec7] md:grid-cols-2 lg:grid-cols-3">
              {STAGES.map((s) => (
                <li key={s.n} className="bg-ivory">
                  <Link href={s.href} className="group flex h-full flex-col p-6 transition-colors hover:bg-white/60">
                    <span className="num text-[11px] text-[#666862]">{s.n}</span>
                    <p className="mt-3 text-[18px] font-medium">{s.t}</p>
                    <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-[#4b4d47]">{s.d}</p>
                    <ArrowUpRight className="mt-4 h-4 w-4 text-[#666862] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 演示 */}
        <section id="demo" className="scroll-mt-20 border-t border-line-soft px-5 py-24 sm:px-10 lg:px-[5vw]">
          <div className="mx-auto max-w-[1440px]">
            <p className="smallcaps text-faint">03 / DEMO</p>
            <h2 className="display mt-5 text-[clamp(34px,4.6vw,64px)] text-fg">
              两个虚构的人<span className="text-[#878784]">，</span>
              <span className="block text-[#878784]">两种完全不同的研究起点。</span>
            </h2>
            <p className="mt-6 max-w-[620px] text-[14.5px] leading-[1.85] text-muted">不用回答任何问题，先看看 Galaxy Money 如何理解两位处境不同的用户，以及他们看到的研究路径有什么不同。人物与「原话」均为虚构示例。</p>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {DEMOS.map((d) => (
                <div key={d.id} className="flex flex-col rounded-lg border border-line-soft p-6">
                  <span className="num text-[11px] text-faint">虚构 · {d.id}</span>
                  <p className="mt-3 text-[20px] font-medium text-fg">{d.title}</p>
                  <ul className="mt-4 space-y-1.5 text-[13.5px] text-fg-2">
                    {d.lines.map((l) => (
                      <li key={l}>「{l}」</li>
                    ))}
                  </ul>
                  <p className="mt-4 text-[13px] text-muted">{d.note}</p>
                  <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-line-soft pt-5 text-[13px]">
                    <Link href={`/identity?demo=${d.id}`} className="inline-flex items-center gap-1 font-medium text-fg hover:underline">
                      以用户 {d.id} 体验 <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link href={`/paths?demo=${d.id}`} className="text-muted hover:text-fg">
                      直接看研究路径
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 原则 */}
        <section id="principles" className="scroll-mt-20 border-t border-line-soft px-5 py-24 sm:px-10 lg:px-[5vw]">
          <div className="mx-auto max-w-[1440px]">
            <p className="smallcaps text-faint">04 / PRINCIPLES</p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft md:grid-cols-2 lg:grid-cols-4">
              {[
                ["AI 不替你做决定", "不给买卖指令、不承诺收益、不预测涨跌；研究路径是研究方向，不是配置方案。"],
                ["能力与意愿分开看", "你愿意承担的风险，不等于你实际能承受的风险。近期要用的钱，不会因为你偏好高风险而被忽略。"],
                ["事实可追溯", "每个关于你的判断都说明来自你的哪句话；每个市场数字都来自真实数据与可验证的计算。"],
                ["你的信息由你控制", "默认不保存；可以查看、修改、撤回和一键清除。服务器不存储你的访谈内容。"],
              ].map(([t, d]) => (
                <div key={t} className="bg-bg p-6">
                  <p className="text-[15px] font-medium text-fg">{t}</p>
                  <p className="mt-3 text-[13px] leading-relaxed text-muted">{d}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link href="/genesis" className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-fg px-5 text-[14px] font-semibold text-[#050505] hover:bg-white">
                开始了解我 <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/research/510300.SH" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
                已经有经验？直接进入 InvestLens 专业工作台 <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line-soft px-5 py-10 sm:px-10 lg:px-[5vw]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 text-[12px] text-faint sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p>研究辅助工具，不构成投资建议。Galaxy · Humanity first.</p>
        </div>
      </footer>
    </div>
  );
}
