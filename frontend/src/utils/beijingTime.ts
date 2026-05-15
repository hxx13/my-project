/** 展示用时间统一为北京时间（Asia/Shanghai）；无时区字面值按东八区解析（与 MySQL DATETIME/JDBC 常见形态一致） */

export const ASIA_SHANGHAI = "Asia/Shanghai";

/**
 * 后端常见：`Timestamp.toInstant().toString()` 带 `Z`，但库中实为东八区墙钟被当成 UTC 写入，展示会少 8 小时。
 * 仅对以 `Z` 结尾的 ISO 在解析后叠加该毫秒数。后端修正后可改为 `0`。
 */
export const BEIJING_INSTANT_Z_EXTRA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 无时区后缀的 SQL/ISO 日期时间（按北京时间墙钟解析） */
const NAIVE_LOCAL_SQL = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;

/**
 * 解析为绝对时刻：带 Z/±offset 的按标准解析；无时区后缀的 `yyyy-MM-dd HH:mm:ss` 视为 Asia/Shanghai 墙钟。
 * 以 `Z` 结尾的 ISO 会叠加 {@link BEIJING_INSTANT_Z_EXTRA_OFFSET_MS}（默认 +8h）。
 */
export function parseToDate(v: string | undefined | null): Date | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  if (/Z$/i.test(normalized) || /[+-]\d{2}:\d{2}$/.test(normalized) || /[+-]\d{4}$/.test(normalized)) {
    const t = Date.parse(normalized);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    if (/Z$/i.test(normalized) && BEIJING_INSTANT_Z_EXTRA_OFFSET_MS !== 0) {
      return new Date(d.getTime() + BEIJING_INSTANT_Z_EXTRA_OFFSET_MS);
    }
    return d;
  }
  if (NAIVE_LOCAL_SQL.test(normalized)) {
    const t = Date.parse(`${normalized}+08:00`);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** yyyy/MM/dd HH:mm（24h），无效则返回占位 */
export function formatBeijingDateTimeMedium(v: string | undefined | null): string {
  const d = parseToDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: ASIA_SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** 含秒，用于通知全文等 */
export function formatBeijingDateTimeFull(v: string | undefined | null): string {
  const d = parseToDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: ASIA_SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatBeijingTimeHM(iso: string): string {
  const d = parseToDate(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: ASIA_SHANGHAI,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function calendarDayKeyBeijing(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ASIA_SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function sameCalendarDayBeijing(a: Date, b: Date): boolean {
  return calendarDayKeyBeijing(a) === calendarDayKeyBeijing(b);
}
