import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Providers } from "@/components/layout/Providers";
import "./globals.css";

// Galaxy 官网声明的字体为 Inter；这里通过 next/font 自托管加载，避免依赖用户本机字体
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Galaxy Money — 先理解你，再理解市场", template: "%s · Galaxy Money" },
  description: "Galaxy Money：以人为中心的 AI 财富研究伙伴。先通过对话理解你的人生、财务约束与目标，再用真实金融数据帮你看懂不同选择的风险与代价。不提供买卖指令，决定始终由你做出。",
  applicationName: "Galaxy Money",
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${geistMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-[#050505]"
        >
          跳到主要内容
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
