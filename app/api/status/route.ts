import { NextResponse } from "next/server";
import { resolveDataMode } from "@/lib/providers";
import { isLLMConfigured, llmConfigFromEnv } from "@/lib/llm/provider";
import { getStore, rateLimitEnabled } from "@/lib/server/rate-limit";

/**
 * 运行状态：只返回布尔值与公开可展示的信息（模式、模型名），绝不返回密钥或服务地址。
 */
export interface StatusBody {
  dataMode: "demo" | "fuyao";
  fuyaoConfigured: boolean;
  llmConfigured: boolean;
  llmModel: string | null;
  newsEnabled: boolean;
  /** 限流计数是否跨实例共享（shared = Redis；instance = 仅单实例内存；off = 本机测试关闭）。 */
  rateLimit: "shared" | "instance" | "off";
}

export function GET() {
  const cfg = llmConfigFromEnv();
  const mode = resolveDataMode();
  const body: StatusBody = {
    dataMode: mode,
    fuyaoConfigured: !!process.env.FUYAO_API_KEY?.trim(),
    llmConfigured: isLLMConfigured(cfg),
    llmModel: isLLMConfigured(cfg) ? cfg.model : null,
    newsEnabled: mode === "fuyao",
    rateLimit: rateLimitEnabled() ? getStore().kind : "off",
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
