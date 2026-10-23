import { getMarketDataProvider } from "@/lib/providers";
import { fail, ok } from "@/lib/api/respond";
import { checkDataLimit, tooMany } from "@/lib/server/rate-limit";

export async function GET(req: Request) {
  const limited = await checkDataLimit(req);
  if (limited) return tooMany(limited);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return ok(await getMarketDataProvider().search(q.slice(0, 40)));
  } catch (e) {
    return fail(e);
  }
}
