import { formatBeijingDateTimeFull, formatBeijingDateTimeMedium, parseToDate } from "@/utils/beijingTime";

/**
 * 将接口返回的日期时间格式化为「北京时间」展示字符串（含秒）。
 * 无时区后缀按 Asia/Shanghai 墙钟解析；错误带 Z 的 UTC 串会按项目约定修正。
 */
export function formatDateTimeAsiaShanghai(v: unknown): string {
  if (v == null || v === "") return "-";
  const s = String(v).trim();
  if (!s) return "-";
  const formatted = formatBeijingDateTimeFull(s);
  return formatted === "—" ? s.length > 19 ? s.slice(0, 19).replace("T", " ") : s : formatted;
}

/** 不含秒的北京时间展示（列表常用） */
export function formatDateTimeAsiaShanghaiShort(v: unknown): string {
  if (v == null || v === "") return "-";
  const formatted = formatBeijingDateTimeMedium(String(v));
  return formatted === "—" ? "-" : formatted;
}

/** 不含秒的北京时间展示（列表常用）；兼容旧 toTime/toTimeText 命名 */
export function formatWallClockDateTime(v: unknown): string {
  return formatDateTimeAsiaShanghaiShort(v);
}

/** 比较两个 API 时间先后（毫秒） */
export function compareApiDateTime(a: unknown, b: unknown): number {
  const ta = parseToDate(a == null ? null : String(a))?.getTime() ?? 0;
  const tb = parseToDate(b == null ? null : String(b))?.getTime() ?? 0;
  return ta - tb;
}
