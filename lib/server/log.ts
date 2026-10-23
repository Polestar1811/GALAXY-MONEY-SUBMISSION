/**
 * 服务端结构化日志：只记录事件名与非敏感字段，并对已知密钥做二次脱敏。
 * 不记录 API Key、请求头、完整画像或模型提示词。
 */
const SECRET_ENV = ["FUYAO_API_KEY", "LLM_API_KEY", "FUYAO_RELAY_SECRET", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"];

export function redact(text: string): string {
  let out = text;
  for (const name of SECRET_ENV) {
    const v = process.env[name];
    if (v && v.length >= 6) out = out.split(v).join("[REDACTED]");
  }
  // 兜底：形似 Bearer / sk- 的令牌
  return out.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [REDACTED]").replace(/\bsk-[A-Za-z0-9_\-]{8,}/g, "sk-[REDACTED]");
}

export function logEvent(event: string, fields: Record<string, string | number | boolean | null | undefined> = {}) {
  if (process.env.INVESTLENS_LOG === "off") return;
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...fields });
  console.info(redact(line));
}
