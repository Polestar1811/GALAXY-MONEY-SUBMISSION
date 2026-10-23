import type { HistoryPeriod } from "@/types/market";
import { getMarketDataProvider, parseSimulate } from "@/lib/providers";
import { HISTORY_PERIODS } from "@/lib/providers/types";
import { badRequest, fail, ok } from "@/lib/api/respond";
import { checkDataLimit, tooMany } from "@/lib/server/rate-limit";

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const limited = await checkDataLimit(req);
  if (limited) return tooMany(limited);
  const { symbol } = await params;
  const sp = new URL(req.url).searchParams;
  const period = (sp.get("period") ?? "1Y") as HistoryPeriod;
  if (!HISTORY_PERIODS.some((p) => p.id === period)) return badRequest(`不支持的周期：${period}`);
  try {
    return ok(await getMarketDataProvider(parseSimulate(sp.get("simulate"))).getHistory(symbol, period));
  } catch (e) {
    return fail(e);
  }
}
