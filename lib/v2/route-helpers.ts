import "server-only";
import { badRequest } from "@/lib/api/respond";

/** 读取并限制请求体大小（字符数），返回解析后的 JSON 或错误响应。 */
export async function readJson(req: Request, maxChars: number): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  const raw = await req.text().catch(() => "");
  if (raw.length > maxChars) return { ok: false, res: badRequest("请求内容过长") };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, res: badRequest("请求格式不正确") };
  }
}

/** 与客户端断开时中止模型调用。 */
export function abortOn(req: Request): AbortController {
  const ctrl = new AbortController();
  req.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  return ctrl;
}
