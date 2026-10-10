import { adminHttp } from "@/api/core/adminHttp";

type ApiResult<T> = { success?: boolean; message?: string; data?: T };

export type LongtermVariable = {
  winccVariableName: string;
  sortOrder: number;
  displayLabel: string | null;
  unit: string | null;
  enabled: boolean;
  floorCode?: string | null;
  roomCanonical?: string | null;
  metricKindCode?: string | null;
  metricKindLabel?: string | null;
};

export type LongtermCandidate = {
  winccVariableName: string;
  displayLabel: string | null;
  floorCode: string | null;
  roomCanonical: string | null;
  metricKindCode: string | null;
  enabledInCatalog: boolean;
  selected: boolean;
  /** 所属分区（变量目录原本的导入分区）—— 加入变量时按它逐层加载 */
  bundleCode: string | null;
  bundleDisplayName: string | null;
};

/** 变量目录的分区选项（含各分区变量数） */
export type LongtermBundleOption = {
  code: string;
  displayName: string;
  count: number;
};

/** 矩阵的列头 = 一个平分槽位（`slot` 序号 + 该槽的名义时间点） */
export type LongtermSlot = { slot: number; time: string };

export type LongtermMatrixRow = {
  variableName: string;
  displayLabel: string | null;
  unit: string | null;
  /** 指标类型（TEMP/HUM/PRESSURE…）——曲线按它画合规区间 */
  metricKindCode: string | null;
  /** 这个变量映射的房间名 —— 表格第一列显示的是它（变量名放在悬停提示里） */
  roomCanonical: string | null;
  /** 与所属表的 columns 按下标对齐；该槽没采到是 null */
  values: (string | null)[];
};

export type LongtermDayMatrix = {
  day: string;
  slotCount: number;
  columns: LongtermSlot[];
  rows: LongtermMatrixRow[];
};

export type LongtermMatrix = {
  days: string[];
  dayTables: LongtermDayMatrix[];
};

export type LongtermSample = {
  sampleAt: string;
  variableName: string;
  numericValue: number | null;
  rawValue: string | null;
  unit: string | null;
  roomCanonical: string | null;
  floorCode: string | null;
  snapshotAt: string | null;
};

export type LongtermSamplePage = { total: number; page: number; size: number; items: LongtermSample[] };

export type LongtermSampleLog = {
  runAt: string;
  outcome: "OK" | "SKIPPED" | "FAILED";
  rowsWritten: number;
  reason: string | null;
  durationMs: number;
};

export type LongtermPlan = {
  scheduleEnabled: boolean;
  pollIntervalSeconds: number;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  sampleRows: number;
  variableCount: number;
  recentRuns: LongtermSampleLog[];
};

export type LongtermExportRequest = {
  /** TABLE=Excel 表格 / CURVE=A4 纵向 PDF 曲线（一天一页、一行两张） */
  form?: "TABLE" | "CURVE";
  layout: "LONG" | "WIDE";
  variableNames: string[];
  /** **精确选中的日期**（yyyy-MM-dd，可多选）；时间范围必填，不选不允许导出 */
  days: string[];
  month?: string | null;
  from?: string | null;
  to?: string | null;
};

function unwrap<T>(body: ApiResult<T> | undefined, fallbackMsg: string): T {
  if (!body?.success || body.data === undefined) {
    throw new Error(body?.message || fallbackMsg);
  }
  return body.data;
}

export async function fetchLongtermCandidates(params: { keyword?: string; floor?: string; bundle?: string }) {
  const res = await adminHttp.get<ApiResult<LongtermCandidate[]>>("telemetry/longterm/candidates", { params });
  return unwrap(res.data, "加载候选变量失败");
}

/** 变量目录的分区列表：加入变量时先让用户选分区，避免一次拉五千多个点位。 */
export async function fetchLongtermCandidateBundles() {
  const res = await adminHttp.get<ApiResult<LongtermBundleOption[]>>("telemetry/longterm/candidates/bundles");
  return unwrap(res.data, "加载变量分区失败");
}

export async function fetchLongtermVariables() {
  const res = await adminHttp.get<ApiResult<LongtermVariable[]>>("telemetry/longterm/variables");
  return unwrap(res.data, "加载已选变量失败");
}

export async function saveLongtermVariables(list: LongtermVariable[]) {
  const res = await adminHttp.put<ApiResult<LongtermVariable[]>>("telemetry/longterm/variables", list);
  return unwrap(res.data, "保存失败");
}

export async function fetchLongtermPlan() {
  const res = await adminHttp.get<ApiResult<LongtermPlan>>("telemetry/longterm/plan");
  return unwrap(res.data, "加载归档计划失败");
}

export async function fetchLongtermSamples(params: {
  page: number;
  size: number;
  variableQ?: string;
  month?: string;
}) {
  const res = await adminHttp.get<ApiResult<LongtermSamplePage>>("telemetry/longterm/samples", { params });
  return unwrap(res.data, "加载明细失败");
}

export async function fetchLongtermMonths() {
  const res = await adminHttp.get<ApiResult<string[]>>("telemetry/longterm/months");
  return unwrap(res.data, "加载月份失败");
}

/**
 * 按天矩阵：**一天一张表**，行=变量、列=平分槽位。
 * 列用槽位序号而不是实际采样时刻 —— 实际采样有延迟，用时刻当列名会错位。
 * 传了 day 就只取那一天（日历选天）；否则按 month / from-to。
 */
export async function fetchLongtermMatrix(params: { day?: string; month?: string; from?: string; to?: string }) {
  const res = await adminHttp.get<ApiResult<LongtermMatrix>>("telemetry/longterm/matrix", { params });
  return unwrap(res.data, "加载归档矩阵失败");
}

/** 区间内有哪些天有数据（日历上标点用） */
export async function fetchLongtermDays(params: { month?: string; from?: string; to?: string }) {
  const res = await adminHttp.get<ApiResult<string[]>>("telemetry/longterm/days", { params });
  return unwrap(res.data, "加载有数据的日期失败");
}

/** 导出可能慢，超时放宽；响应是裸字节流（失败时后端回纯文本），故不解 envelope、直接交 blob。 */
export async function exportLongtermXlsx(req: LongtermExportRequest): Promise<Blob> {
  const res = await adminHttp.post("/telemetry/longterm/export", req, {
    responseType: "blob",
    timeout: 120_000,
  });
  return res.data as Blob;
}

/**
 * 曲线导出：后端用无头 Chromium 把「打印视图」出成 A4 纵向 PDF
 * （一天一页、一行两张，多天合到一份文件里）。
 */
export async function exportLongtermPdf(req: LongtermExportRequest): Promise<Blob> {
  const res = await adminHttp.post("/telemetry/longterm/export/pdf", req, {
    responseType: "blob",
    timeout: 180_000,
  });
  return res.data as Blob;
}
