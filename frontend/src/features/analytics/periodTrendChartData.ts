import type { AnalyticsAuditLog } from "@/api/domains/analytics.api";
import type { AnalyticsCompareCycle } from "@/features/analytics/analyticsPipelineFilter";

export type TrendHighlight = "none" | "yesterday" | "dayBefore" | "latest" | "previous";

export type TrendChartPoint = {
  /** 横轴短标签 */
  axisLabel: string;
  /** 完整周期标识（如 2026-05-16、2026-W20） */
  periodKey: string;
  personTimes: number;
  highlight: TrendHighlight;
  deltaRounds?: number;
};

export type TrendChartMeta = {
  title: string;
  subtitle: string;
  points: TrendChartPoint[];
};

const FILL = {
  default: "#a5b4fc",
  yesterday: "#10b981",
  dayBefore: "#f59e0b",
  latest: "#7c3aed",
  previous: "#94a3b8",
  empty: "#e2e8f0",
} as const;

export function trendBarFill(highlight: TrendHighlight, hasValue: boolean): string {
  if (!hasValue) return FILL.empty;
  switch (highlight) {
    case "yesterday":
      return FILL.yesterday;
    case "dayBefore":
      return FILL.dayBefore;
    case "latest":
      return FILL.latest;
    case "previous":
      return FILL.previous;
    default:
      return FILL.default;
  }
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

/** 日：当月所有已结束自然日；高亮昨日、前日 */
function buildDayTrend(logs: AnalyticsAuditLog[]): TrendChartMeta {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);
  const y = today.getFullYear();
  const m = today.getMonth();
  const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const byLabel = dedupeByPeriodLabel(logs);

  const yesterdayKey = isoDate(yesterday);
  const dayBeforeKey = isoDate(dayBefore);

  const points: TrendChartPoint[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const periodKey = `${monthPrefix}-${String(d).padStart(2, "0")}`;
    const dayDate = new Date(y, m, d);
    if (dayDate > yesterday) continue;

    const log = byLabel.get(periodKey);
    let highlight: TrendHighlight = "none";
    if (periodKey === yesterdayKey) highlight = "yesterday";
    else if (periodKey === dayBeforeKey) highlight = "dayBefore";

    points.push({
      axisLabel: `${d}日`,
      periodKey,
      personTimes: log?.currentRounds ?? 0,
      highlight,
      deltaRounds: log?.deltaRounds,
    });
  }

  return {
    title: "本月每日人次趋势",
    subtitle: `横轴为 ${monthPrefix} 各自然日；高亮昨日（${yesterdayKey}）与前日（${dayBeforeKey}）`,
    points,
  };
}

function parseWeekSortKey(label: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

/** 周：最近 10 个完整周；高亮最近两周 */
function buildWeekTrend(logs: AnalyticsAuditLog[]): TrendChartMeta {
  const byLabel = dedupeByPeriodLabel(logs);
  const sorted = [...byLabel.entries()]
    .sort((a, b) => parseWeekSortKey(b[0]) - parseWeekSortKey(a[0]))
    .slice(0, 10)
    .reverse();

  const keys = sorted.map(([k]) => k);
  const latestKey = keys[keys.length - 1];
  const previousKey = keys[keys.length - 2];

  const points = sorted.map(([periodKey, log]) => ({
    axisLabel: periodKey.replace(/^\d{4}-/, ""),
    periodKey,
    personTimes: log.currentRounds,
    highlight:
      periodKey === latestKey ? ("latest" as const) : periodKey === previousKey ? ("previous" as const) : ("none" as const),
    deltaRounds: log.deltaRounds,
  }));

  return {
    title: "近 10 周人次趋势",
    subtitle: "高亮最近一周与上一周（用于周环比）",
    points,
  };
}

function parseMonthSortKey(label: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

/** 月：最近 10 个月；高亮最近两月 */
function buildMonthTrend(logs: AnalyticsAuditLog[]): TrendChartMeta {
  const byLabel = dedupeByPeriodLabel(logs);
  const sorted = [...byLabel.entries()]
    .sort((a, b) => parseMonthSortKey(b[0]) - parseMonthSortKey(a[0]))
    .slice(0, 10)
    .reverse();

  const keys = sorted.map(([k]) => k);
  const latestKey = keys[keys.length - 1];
  const previousKey = keys[keys.length - 2];

  const points = sorted.map(([periodKey, log]) => ({
    axisLabel: periodKey,
    periodKey,
    personTimes: log.currentRounds,
    highlight:
      periodKey === latestKey ? ("latest" as const) : periodKey === previousKey ? ("previous" as const) : ("none" as const),
    deltaRounds: log.deltaRounds,
  }));

  return {
    title: "近 10 个月人次趋势",
    subtitle: "高亮最近一月与上一月（用于月环比）",
    points,
  };
}

export function buildPeriodTrendChart(
  cycle: AnalyticsCompareCycle,
  historyLogs?: AnalyticsAuditLog[] | null,
): TrendChartMeta {
  const logs = (historyLogs ?? []).filter((l) => l?.periodType === cycle);
  switch (cycle) {
    case "day":
      return buildDayTrend(logs);
    case "week":
      return buildWeekTrend(logs);
    case "month":
      return buildMonthTrend(logs);
    default:
      return { title: "", subtitle: "", points: [] };
  }
}
