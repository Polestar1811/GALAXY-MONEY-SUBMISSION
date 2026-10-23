import { z } from "zod";
import { parseProfile } from "@/lib/profile/schema";
import { parseSimulate } from "@/lib/providers";
import { getResearchService } from "@/lib/research";
import { badRequest, fail, ok } from "@/lib/api/respond";
import { checkDataLimit, tooMany } from "@/lib/server/rate-limit";

const bodySchema = z.object({
  symbol: z.string().min(1).max(20),
  question: z.string().max(200).default(""),
  profile: z.unknown().nullable(),
  simulate: z.string().optional(),
  mode: z.enum(["research", "brief"]).default("research"),
});

/**
 * 研究接口。画像只在本次请求中用于排序与解释，服务端不记录、不存储。
 */
export async function POST(req: Request) {
  const limited = await checkDataLimit(req);
  if (limited) return tooMany(limited);
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return badRequest("请求格式不正确");
  }
  const profile = body.profile ? parseProfile(body.profile) : null;
  if (body.profile && !profile) return badRequest("画像数据未通过校验");

  const service = getResearchService(parseSimulate(body.simulate));
  try {
    if (body.mode === "brief") return ok(await service.brief({ symbol: body.symbol, profile }));
    return ok(await service.research({ symbol: body.symbol, question: body.question, profile }));
  } catch (e) {
    return fail(e);
  }
}
