import { NextResponse } from "next/server";
import { synthesizePaths } from "@/lib/paths/synthesis";
import { getLLMProvider } from "@/lib/llm/provider";
import { badRequest } from "@/lib/api/respond";
import { logEvent } from "@/lib/server/log";
import { checkV2Rate, tooMany } from "@/lib/server/rate-limit";
import { parseIdentityProfile } from "@/lib/v2/schemas";
import { abortOn, readJson } from "@/lib/v2/route-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 三条财富研究路径：排序与前提由规则决定，模型只写个性化解释（经护栏校验）。 */
export async function POST(req: Request) {
  const limited = await checkV2Rate(req, "synthesis");
  if (limited) return tooMany(limited);
  const read = await readJson(req, 48_000);
  if (!read.ok) return read.res;
  const parsed = parseIdentityProfile((read.body as { profile?: unknown })?.profile);
  if (!parsed.success) return badRequest("画像数据未通过校验");
  try {
    const result = await synthesizePaths(getLLMProvider(), parsed.data, abortOn(req).signal);
    logEvent("v2.paths", { source: result.source, first: result.paths[0]?.id ?? null });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: { code: "CANCELLED", message: "已取消", retryable: true } }, { status: 499 });
  }
}
