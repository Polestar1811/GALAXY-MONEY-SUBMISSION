/** Asia/Shanghai 时间格式化（扶摇时间戳均按该时区解释）。 */
const dateFmt = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function shanghaiDate(ms: number): string {
  return dateFmt.format(new Date(ms)).replace(/\//g, "-");
}

export function shanghaiDateTime(ms: number): string {
  return dateTimeFmt.format(new Date(ms)).replace(/\//g, "-");
}

/**
 * 该 K 线是否为「当日、尚未收盘」：扶摇日线在交易时段内会包含当天未完成的 K 线（独立复核时发现），
 * 它的收盘价是盘中价，不能当作收盘价使用。以 15:05（北京时间）为当日收盘完成的界线。
 */
export function isUnfinishedTodayBar(barMs: number, now = Date.now()): boolean {
  if (shanghaiDate(barMs) !== shanghaiDate(now)) return false;
  const d = new Date(now + 8 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes() < 15 * 60 + 5;
}

/** 超过该天数视为可能过期（覆盖长假休市）。 */
export const STALE_DAYS = 10;

export function isStale(ms: number | null, now = Date.now()): boolean {
  return ms !== null && now - ms > STALE_DAYS * 86_400_000;
}
