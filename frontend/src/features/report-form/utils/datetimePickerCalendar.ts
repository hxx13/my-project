/** 自定义日期面板：月历网格与 YYYY-MM-DD 格式化 */

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseYmd(s: string): { year: number; month: number; day: number } | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function todayYmd(): string {
  const d = new Date();
  return formatYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** 周一为一周起始；null 表示空白格 */
export function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const startOffset = (firstWeekday + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

export function parseHm(time: string): { hour: number; minute: number } {
  const m = time.match(/^(\d{2}):(\d{2})$/);
  if (!m) return { hour: 9, minute: 0 };
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function formatHm(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i);
