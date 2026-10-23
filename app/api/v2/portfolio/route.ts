import { z } from "zod";
import { getMarketDataProvider } from "@/lib/providers";
import { backtestPortfolio } from "@/lib/portfolio/service";
import { badRequest, fail, ok } from "@/lib/api/respond";
import { checkDataLimit, tooMany } from "@/lib/server/rate-limit";
import { readJson } from "@/lib/v2/route-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  weights: z.record(z.string().max(12), z.number().min(0).max(100)).refine((w) => Object.keys(w).length > 0 && Object.keys(w).length <= 6),
  rebalance: z.enum(["monthly", "none"]).default("monthly"),
});

/** 组合历史回测：只使用真实前复权日线；演示模式或数据不足时明确阻止，不生成任何结果。 */
export async function POST(req: Request) {
  const limited = await checkDataLimit(req);
  if (limited) return tooMany(limited);
  const read = await readJson(req, 4_000);
  if (!read.ok) return read.res;
  const parsed = bodySchema.safeParse(read.body);
  if (!parsed.success) return badRequest("组合参数不正确");
  try {
    return ok(await backtestPortfolio(getMarketDataProvider("none", req.signal), parsed.data.weights, parsed.data.rebalance));
  } catch (e) {
    return fail(e);
  }
}
