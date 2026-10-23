import { getMarketDataProvider, parseSimulate } from "@/lib/providers";
import { fail, ok } from "@/lib/api/respond";
import { checkDataLimit, tooMany } from "@/lib/server/rate-limit";

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const limited = await checkDataLimit(req);
  if (limited) return tooMany(limited);
  const { symbol } = await params;
  const simulate = parseSimulate(new URL(req.url).searchParams.get("simulate"));
  try {
    return ok(await getMarketDataProvider(simulate).getSnapshot(symbol));
  } catch (e) {
    return fail(e);
  }
}
