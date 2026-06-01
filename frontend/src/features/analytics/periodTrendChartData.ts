import type { AnalyticsAuditLog } from "@/api/domains/analytics.api";
import type { AnalyticsCompareCycle } from "@/features/analytics/analyticsPipelineFilter";

export type TrendHighlight = "none" | "yesterday" | "dayBefore" | "latest" | "previous";

export type TrendChartPoint = {
  /** 横轴短标签 */
  axisLabel: string;
  /** 完整周期标识（如 2026-05-16、2026-W20） */
  periodKey: string;
  /** 总条数（清洗纳入记录） */
  personTimes: number;
  studentCount: number;
  staffCount: number;
  highlight: TrendHighlight;
  deltaRounds?: number;
};

export type TrendChartMeta = {
  title: string;
  subtitle: string;
  points: TrendChartPoint[];
};

const FILL = {
  student: "#6366f1",
  staff: "#94a3b8",
  empty: "#e2e8f0",
} as const;

export function trendStudentFill(hasValue: boolean): string {
  return hasValue ? FILL.student : FILL.empty;
}

export function trendStaffFill(hasValue: boolean): string {
  return hasValue ? FILL.staff : FILL.empty;
}

function dedupeByPeriodLabel(logs: AnalyticsAuditLog[] | null | undefined): Map<string, AnalyticsAuditLog> {
  const map = new Map<string, AnalyticsAuditLog>();
  for (const log of logs ?? []) {
    const prev = map.get(log.periodLabel);
    if (!prev || new Date(log.createdAt) > new Date(prev.createdAt)) {
      map.set(log.periodLabel, log);
    }
  }
  return map;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function pointFromLog(log: AnalyticsAuditLog | undefined, highlight: TrendHighlight): TrendChartPoint {
  const total = log?.currentRounds ?? 0;
  const student = log?.studentRounds ?? 0;
  const staff = log?.staffRounds ?? Math.max(0, total - student);
  return {
    axisLabel: "",
    periodKey: log?.periodLabel ?? "",
    personTimes: total,
    studentCount: student,
    staffCount: staff,
    highlight,
    deltaRounds: log?.deltaRounds,
  };
}

const DAY_PERIOD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDayPeriodKey(periodKey: string): { y: number; m: number; d: number } | null {
  const m = DAY_PERIOD_RE.exec(periodKey);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function buildDayTrend(logs: AnalyticsAuditLog[], highlightPeriodKey?: string): TrendChartMeta {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const byLabel = dedupeByPeriodLabel(logs);
  const yesterday = addDays(today, -1);
  const yesterdayKey = isoDate(yesterday);

  // Determine window end: if viewing a historical day, end at that day; otherwise end at yesterday
  const selected = highlightPeriodKey ? parseDayPeriodKey(highlightPeriodKey) : null;
  const windowEnd = selected
    ? new Date(selected.y, selected.m, selected.d)
    : yesterday;

  // Start is 30 days before end (31 days total: windowEnd - 30 .. windowEnd)
  const windowStart = addDays(windowEnd, -30);

  const points: TrendChartPoint[] = [];
  const cursor = new Date(windowStart);

  for (let i = 0; i < 31; i++) {
    const periodKey = isoDate(cursor);
    const log = byLabel.get(periodKey);
    const d = cursor.getDate();
    const m = cursor.getMonth() + 1;
    const isCurrentMonth = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();

    let highlight: TrendHighlight = "none";
    if (highlightPeriodKey && periodKey === highlightPeriodKey) {
      highlight = "latest";
    } else if (periodKey === yesterdayKey) {
      highlight = "yesterday";
    } else if (periodKey === isoDate(addDays(today, -2))) {
      highlight = "dayBefore";
    }

    const p = pointFromLog(log, highlight);
    p.axisLabel = isCurrentMonth ? `${d}日` : `${m}/${d}`;
    p.periodKey = periodKey;
    points.push(p);

    cursor.setDate(cursor.getDate() + 1);
  }

  const title = selected
    ? `${selected.y}年${selected.m + 1}月${selected.d}日 — 前30天`
    : `${windowStart.getFullYear()}/${windowStart.getMonth() + 1}/${windowStart.getDate()} — ${windowEnd.getFullYear()}/${windowEnd.getMonth() + 1}/${windowEnd.getDate()} 趋势`;

  return {
    title,
    subtitle: selected ? `当前查看：${highlightPeriodKey}` : "",
    points,
  };
}

function parseWeekSortKey(label: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

function buildWeekTrend(logs: AnalyticsAuditLog[], highlightPeriodKey?: string): TrendChartMeta {
  const byLabel = dedupeByPeriodLabel(logs);
  const sorted = [...byLabel.entries()]
    .sort((a, b) => parseWeekSortKey(b[0]) - parseWeekSortKey(a[0]))
    .slice(0, 10)
    .reverse();

  const keys = sorted.map(([k]) => k);
  const latestKey = keys[keys.length - 1];
  const previousKey = keys[keys.length - 2];

  const points = sorted.map(([periodKey, log]) => {
    let highlight: TrendHighlight = "none";
    if (highlightPeriodKey && periodKey === highlightPeriodKey) highlight = "latest";
    else if (periodKey === latestKey) highlight = "latest";
    else if (periodKey === previousKey) highlight = "previous";
    const p = pointFromLog(log, highlight);
    p.axisLabel = periodKey.replace(/^\d{4}-/, "");
    p.periodKey = periodKey;
    return p;
  });

  return {
    title: "近 10 周条数趋势",
    subtitle: "",
    points,
  };
}

function parseMonthSortKey(label: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

function buildMonthTrend(logs: AnalyticsAuditLog[], highlightPeriodKey?: string): TrendChartMeta {
  const byLabel = dedupeByPeriodLabel(logs);
  const sorted = [...byLabel.entries()]
    .sort((a, b) => parseMonthSortKey(b[0]) - parseMonthSortKey(a[0]))
    .slice(0, 10)
    .reverse();

  const keys = sorted.map(([k]) => k);
  const latestKey = keys[keys.length - 1];
  const previousKey = keys[keys.length - 2];

  const points = sorted.map(([periodKey, log]) => {
    let highlight: TrendHighlight = "none";
    if (highlightPeriodKey && periodKey === highlightPeriodKey) highlight = "latest";
    else if (periodKey === latestKey) highlight = "latest";
    else if (periodKey === previousKey) highlight = "previous";
    const p = pointFromLog(log, highlight);
    p.axisLabel = periodKey;
    p.periodKey = periodKey;
    return p;
  });

  return {
    title: "近 10 个月条数趋势",
    subtitle: "",
    points,
  };
}

export function buildPeriodTrendChart(
  cycle: AnalyticsCompareCycle,
  historyLogs?: AnalyticsAuditLog[] | null,
  highlightPeriodKey?: string,
): TrendChartMeta {
  const logs = (historyLogs ?? []).filter((l) => l?.periodType === cycle);
  switch (cycle) {
    case "day":
      return buildDayTrend(logs, highlightPeriodKey);
    case "week":
      return buildWeekTrend(logs, highlightPeriodKey);
    case "month":
      return buildMonthTrend(logs, highlightPeriodKey);
    default:
      return { title: "", subtitle: "", points: [] };
  }
}
