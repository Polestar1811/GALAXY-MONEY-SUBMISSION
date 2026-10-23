import { NextResponse } from "next/server";
import { ProviderError } from "@/lib/providers/types";
import { logEvent } from "@/lib/server/log";

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean };
}

const STATUS: Record<string, number> = {
  UNSUPPORTED_SYMBOL: 404,
  UNAUTHORIZED: 403,
  UPSTREAM_ERROR: 502,
  NOT_IMPLEMENTED: 501,
  EMPTY: 404,
  BAD_REQUEST: 400,
  NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
  BUDGET_EXHAUSTED: 429,
  TOO_MANY_CONCURRENT: 429,
  TIMEOUT: 504,
  MALFORMED: 502,
  CANCELLED: 499,
};

export function ok<T>(data: T) {
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export function fail(err: unknown) {
  if (err instanceof ProviderError) {
    return NextResponse.json<ApiErrorBody>(
      { error: { code: err.code, message: err.message, retryable: err.retryable } },
      { status: STATUS[err.code] ?? 500 },
    );
  }
  // 未预期的错误只记录脱敏后的类型与消息，不输出可能含请求信息的完整对象
  logEvent("api.internal_error", { name: err instanceof Error ? err.name : typeof err, message: err instanceof Error ? err.message.slice(0, 200) : null });
  return NextResponse.json<ApiErrorBody>(
    { error: { code: "INTERNAL", message: "服务内部错误", retryable: true } },
    { status: 500 },
  );
}

export function badRequest(message: string) {
  return NextResponse.json<ApiErrorBody>({ error: { code: "BAD_REQUEST", message, retryable: false } }, { status: 400 });
}
