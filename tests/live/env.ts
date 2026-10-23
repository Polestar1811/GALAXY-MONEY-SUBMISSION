import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "../..");

/** 读取 .env.local 到 process.env（不打印任何值）。 */
export function loadEnvLocal() {
  const f = path.join(ROOT, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const secrets = () =>
  [process.env.FUYAO_API_KEY, process.env.LLM_API_KEY, process.env.FUYAO_RELAY_SECRET].filter((s): s is string => !!s && s.length >= 6);

/** 写入脱敏记录；写入前确认不含密钥。 */
export function saveRecord(name: string, data: unknown) {
  const out = path.join(ROOT, "docs/live-verification");
  fs.mkdirSync(out, { recursive: true });
  let text = JSON.stringify(data, null, 2);
  for (const s of secrets()) text = text.split(s).join("[REDACTED]");
  if (secrets().some((s) => text.includes(s))) throw new Error("record contains secret");
  fs.writeFileSync(path.join(out, name), text, "utf8");
}
