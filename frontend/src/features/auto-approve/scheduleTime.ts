/** 自动审批定时：UI 仅选「每天 HH:mm」，存储仍为六段 Cron（0 分 时 * * *） */

export const DEFAULT_DAILY_TIME = "09:00";

export function timeToDailyCron(time: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!m) return `0 0 9 * * *`;
  const hour = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const minute = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `0 ${minute} ${hour} * * *`;
}

export function dailyCronToTime(cron: string | null | undefined): string {
  const parts = String(cron ?? "")
    .trim()
    .split(/\s+/);
  if (parts.length >= 3 && parts[0] === "0" && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
    const hour = parts[2].padStart(2, "0");
    const minute = parts[1].padStart(2, "0");
    return `${hour}:${minute}`;
  }
  return DEFAULT_DAILY_TIME;
}

export function formatDailyScheduleLabel(cron: string | null | undefined): string {
  return `每天 ${dailyCronToTime(cron)}`;
}
