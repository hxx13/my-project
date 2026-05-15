/**
 * 将接口返回的日期时间格式化为「北京时间」展示字符串。
 * 使用浏览器对 ISO（含 Z / 偏移）的解析 + Intl 固定 Asia/Shanghai，避免简单 slice 丢掉时区导致差 8 小时。
 */
export function formatDateTimeAsiaShanghai(v: unknown): string {
  if (v == null || v === "") return "-";
  const s = String(v).trim();
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return s.length > 19 ? s.slice(0, 19).replace("T", " ") : s;
  }
  try {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
    return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
  } catch {
    return s.length > 19 ? s.slice(0, 19).replace("T", " ") : s;
  }
}
