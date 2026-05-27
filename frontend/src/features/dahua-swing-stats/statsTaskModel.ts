import { normalizeChannelCode } from "@/utils/dahuaChannelUtils";
import type { DahuaSwingStatsPullTask } from "@/api/domains/dahuaSwingStats.api";

export type StatsPeriodMode = "PREVIOUS_DAY" | "PREVIOUS_WEEK" | "HISTORICAL_RANGE" | "SINCE_LAST";

export type StatsUiForm = {
  id?: number;
  name: string;
  enabled: number;
  periodMode: StatsPeriodMode;
  dataFromTime: string;
  dataToTime: string;
  historyStart: string;
  historyEnd: string;
  backfillChunkDays: number;
  backfillCursor: string;
  /** 历史回溯累计入库条数（存在 queryJson.backfillTotalSaved） */
  backfillTotalSaved: number;
  channelCodes: string[];
  deptIds: string;
  personCode: string;
  personName: string;
  openType: number | "";
  enterOrExit: number | "";
  openResult: number | "";
  cleanRuleProfileId: number;
};

export const DAILY_PERIOD_MODES: StatsPeriodMode[] = ["PREVIOUS_DAY", "PREVIOUS_WEEK", "SINCE_LAST"];

export const DAILY_PERIOD_OPTIONS: { value: StatsPeriodMode; label: string; hint: string }[] = [
  {
    value: "PREVIOUS_DAY",
    label: "昨日日批",
    hint: "每日定时执行时拉取「上一自然日」在下方刷卡时刻范围内的记录；何时执行在「定时管理」配置",
  },
  {
    value: "PREVIOUS_WEEK",
    label: "上周周批",
    hint: "每次拉取上一自然周（周一至周日）在下方刷卡时刻范围内的记录",
  },
  {
    value: "SINCE_LAST",
    label: "水位增量",
    hint: "自上次成功拉取结束时间至今；首次约回溯 24 小时，适合补洞",
  },
];

export const PERIOD_MODE_LABEL: Record<StatsPeriodMode, string> = {
  PREVIOUS_DAY: "昨日日批",
  PREVIOUS_WEEK: "上周周批",
  HISTORICAL_RANGE: "历史回溯",
  SINCE_LAST: "水位增量",
};

export function isHistoricalTask(t: DahuaSwingStatsPullTask): boolean {
  return parsePeriodMode(t.periodMode) === "HISTORICAL_RANGE";
}

export function isDailyTask(t: DahuaSwingStatsPullTask): boolean {
  return !isHistoricalTask(t);
}

export function defaultDailyForm(): StatsUiForm {
  return {
    name: "",
    enabled: 1,
    periodMode: "PREVIOUS_DAY",
    dataFromTime: "00:00",
    dataToTime: "23:59",
    historyStart: "",
    historyEnd: "",
    backfillChunkDays: 7,
    backfillCursor: "",
    backfillTotalSaved: 0,
    channelCodes: [],
    deptIds: "",
    personCode: "",
    personName: "",
    openType: "",
    enterOrExit: "",
    openResult: "",
    cleanRuleProfileId: 0,
  };
}

export function defaultBackfillForm(): StatsUiForm {
  return {
    ...defaultDailyForm(),
    enabled: 0,
    periodMode: "HISTORICAL_RANGE",
  };
}

export function toApiDateTime(local: string): string {
  const s = (local || "").trim();
  if (!s) return "";
  if (s.includes("T")) {
    const [d, t] = s.split("T");
    const time = t.length === 5 ? `${t}:00` : t.length === 8 ? t : `${t}:00`;
    return `${d} ${time}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  return s;
}

export function fromApiDateTime(api: string): string {
  const s = (api || "").trim();
  if (!s) return "";
  if (s.includes("T")) return s.slice(0, 16);
  const normalized = s.replace(" ", "T");
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
}

export function parsePeriodMode(v: unknown): StatsPeriodMode {
  const s = String(v || "SINCE_LAST").toUpperCase();
  if (s === "PREVIOUS_DAY" || s === "PREVIOUS_WEEK" || s === "HISTORICAL_RANGE" || s === "SINCE_LAST") {
    return s;
  }
  return "SINCE_LAST";
}

export function fromPayload(t: DahuaSwingStatsPullTask): StatsUiForm {
  let query: Record<string, unknown> = {};
  try {
    query = t.queryJson ? JSON.parse(t.queryJson) : {};
  } catch {
    query = {};
  }
  return {
    id: t.id,
    name: t.name || "",
    enabled: t.enabled ?? 1,
    periodMode: parsePeriodMode(t.periodMode),
    dataFromTime: String(query.dataFromTime || "00:00").slice(0, 5),
    dataToTime: String(query.dataToTime || "23:59").slice(0, 5),
    historyStart: fromApiDateTime(String(query.historyStart || "")),
    historyEnd: fromApiDateTime(String(query.historyEnd || "")),
    backfillChunkDays: Number(query.backfillChunkDays) > 0 ? Number(query.backfillChunkDays) : 7,
    backfillCursor: fromApiDateTime(String(query.backfillCursor || "")) || String(query.backfillCursor || ""),
    backfillTotalSaved: Number(query.backfillTotalSaved) > 0 ? Number(query.backfillTotalSaved) : 0,
    channelCodes: Array.isArray(query.channelCodes)
      ? query.channelCodes.map((x) => normalizeChannelCode(String(x))).filter(Boolean)
      : [],
    deptIds: String(query.deptIds || ""),
    personCode: String(query.personCode || ""),
    personName: String(query.personName || ""),
    openType: query.openType == null ? "" : Number(query.openType),
    enterOrExit: query.enterOrExit == null ? "" : Number(query.enterOrExit),
    openResult: query.openResult == null ? "" : Number(query.openResult),
    cleanRuleProfileId: t.cleanRuleProfileId ?? 0,
  };
}

export function toPayload(ui: StatsUiForm, forcePeriodMode?: StatsPeriodMode): DahuaSwingStatsPullTask {
  const periodMode = forcePeriodMode ?? ui.periodMode;
  const query: Record<string, unknown> = {
    channelCodes: ui.channelCodes.map(normalizeChannelCode).filter(Boolean),
    deptIds: ui.deptIds || undefined,
    personCode: ui.personCode || undefined,
    personName: ui.personName || undefined,
    openType: ui.openType === "" ? undefined : ui.openType,
    enterOrExit: ui.enterOrExit === "" ? undefined : ui.enterOrExit,
    openResult: ui.openResult === "" ? undefined : ui.openResult,
  };
  if (periodMode === "HISTORICAL_RANGE") {
    query.historyStart = toApiDateTime(ui.historyStart);
    query.historyEnd = toApiDateTime(ui.historyEnd);
    query.backfillChunkDays = ui.backfillChunkDays > 0 ? ui.backfillChunkDays : 7;
    if (ui.backfillCursor.trim()) {
      query.backfillCursor = ui.backfillCursor.includes("T")
        ? toApiDateTime(ui.backfillCursor)
        : ui.backfillCursor.trim();
    } else {
      delete query.backfillCursor;
      delete query.backfillDone;
    }
    if (ui.backfillTotalSaved > 0) {
      query.backfillTotalSaved = ui.backfillTotalSaved;
    } else {
      delete query.backfillTotalSaved;
    }
  } else {
    query.dataFromTime = ui.dataFromTime || "00:00";
    query.dataToTime = ui.dataToTime || "23:59";
  }
  const enabled =
      periodMode === "HISTORICAL_RANGE" ? 0 : ui.enabled;
  return {
    id: ui.id,
    name: ui.name.trim(),
    enabled,
    periodMode,
    periodDays: 1,
    queryJson: JSON.stringify(query),
    cleanRuleProfileId: ui.cleanRuleProfileId > 0 ? ui.cleanRuleProfileId : undefined,
  };
}

export function mergeTaskRow(
  prev: DahuaSwingStatsPullTask,
  body: DahuaSwingStatsPullTask,
  id: number
): DahuaSwingStatsPullTask {
  return { ...prev, ...body, id };
}

/** 将表单/datetime-local 或 API 时间解析为毫秒时间戳 */
export function parseUiDateTimeMs(value: string): number | null {
  const api = toApiDateTime(value);
  if (!api) return null;
  const d = new Date(api.replace(" ", "T"));
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/** 从历史开始、结束、每段天数估算总段数（用于自动回溯进度条） */
export function estimateBackfillTotalSegments(form: StatsUiForm): number {
  const startMs = parseUiDateTimeMs(form.historyStart);
  const endMs = parseUiDateTimeMs(form.historyEnd);
  if (startMs == null || endMs == null || endMs <= startMs) return 1;
  const chunkDays = form.backfillChunkDays > 0 ? form.backfillChunkDays : 7;
  const spanMs = endMs - startMs;
  return Math.max(1, Math.ceil(spanMs / (chunkDays * 86400000)));
}

/** 当前 cursor 是否已到达或超过回溯结束时间 */
export function isBackfillRangeComplete(form: StatsUiForm): boolean {
  const endMs = parseUiDateTimeMs(form.historyEnd);
  if (endMs == null) return false;
  const cursorMs = form.backfillCursor.trim()
    ? parseUiDateTimeMs(form.backfillCursor)
    : parseUiDateTimeMs(form.historyStart);
  if (cursorMs == null) return false;
  return cursorMs >= endMs;
}

export function formatBackfillProgressPct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export function formatBackfillRangeLabel(form: StatsUiForm): string {
  const s = form.historyStart || "—";
  const e = form.historyEnd || "—";
  return `${s} ~ ${e}`;
}

export function formatBackfillProgressLabel(form: StatsUiForm): string {
  if (isBackfillRangeComplete(form)) return "已完成";
  if (form.backfillCursor.trim()) return `进行中 · 下一段自 ${form.backfillCursor}`;
  return "未开始";
}

export function parseBackfillFromTask(t: DahuaSwingStatsPullTask): StatsUiForm {
  return fromPayload(t);
}

/** 回溯任务在列表/清洗中应展示的条数：优先记录库实数，其次累计回溯，最后本段 */
export function resolveStatsTaskDisplayCount(t: DahuaSwingStatsPullTask): {
  primary: number;
  lastSegment: number;
  source: "library" | "backfillTotal" | "lastSegment";
} {
  const lastSegment = t.lastSavedCount ?? 0;
  const lib = t.libraryRecordCount ?? 0;
  const cumulative = Math.max(t.backfillTotalSaved ?? 0, fromPayload(t).backfillTotalSaved);
  if (lib > 0) {
    return { primary: lib, lastSegment, source: "library" };
  }
  if (isHistoricalTask(t) && cumulative > 0) {
    return { primary: cumulative, lastSegment, source: "backfillTotal" };
  }
  return { primary: lastSegment, lastSegment, source: "lastSegment" };
}

/**
 * 清洗页默认数据窗：回溯用 historyStart~historyEnd；日批用上次拉取窗。
 */
export function resolveCleanDataWindow(t: DahuaSwingStatsPullTask): { startTime: string; endTime: string } {
  if (isHistoricalTask(t)) {
    const form = parseBackfillFromTask(t);
    return {
      startTime: form.historyStart ? fromApiDateTime(form.historyStart) : "",
      endTime: form.historyEnd ? fromApiDateTime(form.historyEnd) : "",
    };
  }
  return {
    startTime: t.lastPulledStart ? fromApiDateTime(t.lastPulledStart) : "",
    endTime: t.lastPulledEnd ? fromApiDateTime(t.lastPulledEnd) : "",
  };
}
