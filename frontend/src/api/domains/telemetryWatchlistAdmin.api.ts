import axios from "axios";

type ApiResult<T> = {
  code?: number;
  success?: boolean;
  message?: string;
  data?: T;
};

export type TelemetryWatchlistBundle = {
  id?: number;
  code: string;
  displayName: string;
  sourceFilename?: string | null;
  active: boolean;
  /** 本分区变量是否参与 WinCC 合并拉数（大量点时可关） */
  includeInWinccPoll?: boolean;
};

export type TelemetryGlobalAlarmLimits = {
  tempMin?: string | null;
  tempMax?: string | null;
  humMin?: string | null;
  humMax?: string | null;
  pressureMin?: string | null;
  pressureMax?: string | null;
};

export type TelemetryWatchlistTag = {
  id?: number;
  /** 仅前端草稿行唯一键；replace 接口映射时不发送 */
  draftUid?: string;
  winccVariableName: string;
  structureType?: string | null;
  dataType?: string | null;
  displayLabel?: string | null;
  floorCode?: string | null;
  roomCanonical?: string | null;
  metricKindCode?: string | null;
  /** 已废弃：全局限值模式下保存本表时一律清空，不再逐变量维护 */
  cachedAlarmMinValue?: string | null;
  cachedAlarmMaxValue?: string | null;
  cachedAlarmLimitsAt?: string | null;
  enabled: boolean;
  sortOrder: number;
};

export type TelemetryMetricKind = {
  id?: number;
  code: string;
  labelZh: string;
  /** METRIC | LIMIT_MIN | LIMIT_MAX | SWITCH */
  kindRole?: string;
  sortOrder: number;
  builtin?: boolean;
  active: boolean;
};

/** 管理端：一个文件名分区 + 其变量表 */
export type TelemetryWatchlistZone = {
  bundle: TelemetryWatchlistBundle;
  tags: TelemetryWatchlistTag[];
};

export type TelemetryWatchlistTagPage = {
  total: number;
  page: number;
  size: number;
  items: TelemetryWatchlistTag[];
};

async function unwrap<T>(p: Promise<{ data: ApiResult<T> }>): Promise<T> {
  const res = await p;
  const body = res.data;
  if (!body?.success || body.data === undefined) {
    throw new Error(body?.message || "请求失败");
  }
  return body.data as T;
}

async function unwrapOk(p: Promise<{ data: ApiResult<unknown> }>): Promise<void> {
  const res = await p;
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || "请求失败");
  }
}

export async function listTelemetryWatchlists(): Promise<TelemetryWatchlistBundle[]> {
  return unwrap(axios.get<ApiResult<TelemetryWatchlistBundle[]>>("/api/v1/telemetry/watchlists"));
}

export async function listTelemetryWatchlistZonesWithTags(): Promise<TelemetryWatchlistZone[]> {
  return unwrap(axios.get<ApiResult<TelemetryWatchlistZone[]>>("/api/v1/telemetry/watchlists/admin/zones-with-tags"));
}

export async function listTelemetryMetricKinds(): Promise<TelemetryMetricKind[]> {
  return unwrap(axios.get<ApiResult<TelemetryMetricKind[]>>("/api/v1/telemetry/watchlists/metric-kinds"));
}

export async function createTelemetryMetricKind(body: {
  code: string;
  labelZh: string;
  kindRole?: string;
  sortOrder?: number;
  active?: boolean;
}): Promise<TelemetryMetricKind> {
  return unwrap(axios.post<ApiResult<TelemetryMetricKind>>("/api/v1/telemetry/watchlists/metric-kinds", body));
}

export async function updateTelemetryMetricKind(
  code: string,
  body: { labelZh?: string; kindRole?: string; sortOrder?: number; active?: boolean }
): Promise<TelemetryMetricKind> {
  return unwrap(
    axios.put<ApiResult<TelemetryMetricKind>>(
      `/api/v1/telemetry/watchlists/metric-kinds/${encodeURIComponent(code)}`,
      body
    )
  );
}

export async function deleteTelemetryMetricKind(code: string): Promise<void> {
  await unwrapOk(
    axios.delete<ApiResult<unknown>>(`/api/v1/telemetry/watchlists/metric-kinds/${encodeURIComponent(code)}`)
  );
}

export async function createTelemetryWatchlist(body: {
  code: string;
  displayName: string;
}): Promise<TelemetryWatchlistBundle> {
  return unwrap(axios.post<ApiResult<TelemetryWatchlistBundle>>("/api/v1/telemetry/watchlists", body));
}

export async function deleteTelemetryWatchlist(code: string): Promise<void> {
  await unwrapOk(axios.delete<ApiResult<unknown>>(`/api/v1/telemetry/watchlists/${encodeURIComponent(code)}`));
}

export async function setTelemetryWatchlistPollEnabled(code: string, includeInWinccPoll: boolean): Promise<void> {
  await unwrapOk(
    axios.patch<ApiResult<unknown>>(`/api/v1/telemetry/watchlists/${encodeURIComponent(code)}/poll-enabled`, {
      includeInWinccPoll,
    })
  );
}

export async function activateTelemetryWatchlist(code: string): Promise<void> {
  await unwrapOk(
    axios.post<ApiResult<unknown>>(`/api/v1/telemetry/watchlists/${encodeURIComponent(code)}/activate`)
  );
}

export async function listTelemetryWatchlistTagsAll(code: string): Promise<TelemetryWatchlistTag[]> {
  return unwrap(
    axios.get<ApiResult<TelemetryWatchlistTag[]>>(
      `/api/v1/telemetry/watchlists/${encodeURIComponent(code)}/tags/all`
    )
  );
}

export async function getTelemetryGlobalAlarmLimits(): Promise<TelemetryGlobalAlarmLimits> {
  return unwrap(axios.get<ApiResult<TelemetryGlobalAlarmLimits>>("/api/v1/telemetry/watchlists/global-alarm-limits"));
}

export async function putTelemetryGlobalAlarmLimits(body: TelemetryGlobalAlarmLimits): Promise<TelemetryGlobalAlarmLimits> {
  return unwrap(
    axios.put<ApiResult<TelemetryGlobalAlarmLimits>>("/api/v1/telemetry/watchlists/global-alarm-limits", body)
  );
}

export async function replaceTelemetryWatchlistTags(
  code: string,
  tags: TelemetryWatchlistTag[],
  sourceFilename?: string | null
): Promise<{ saved: number }> {
  const body = tags.map((t) => ({
    winccVariableName: t.winccVariableName,
    structureType: t.structureType ?? null,
    dataType: t.dataType ?? null,
    displayLabel: t.displayLabel ?? null,
    floorCode: t.floorCode ?? null,
    roomCanonical: t.roomCanonical ?? null,
    metricKindCode: t.metricKindCode ?? null,
    // 全局限值模式：写回标签表时不携带逐变量缓存上下限
    cachedAlarmMinValue: "",
    cachedAlarmMaxValue: "",
    enabled: t.enabled,
    sortOrder: t.sortOrder,
  }));
  return unwrap(
    axios.put<ApiResult<{ saved: number }>>(
      `/api/v1/telemetry/watchlists/${encodeURIComponent(code)}/tags`,
      body,
      { params: sourceFilename ? { sourceFilename } : {} }
    )
  );
}

export async function importTelemetryWatchlistCsv(
  code: string,
  csvText: string,
  sourceFilename?: string | null
): Promise<{ imported: number }> {
  return unwrap(
    axios.post<ApiResult<{ imported: number }>>(
      `/api/v1/telemetry/watchlists/${encodeURIComponent(code)}/import`,
      { csvText, sourceFilename: sourceFilename ?? null }
    )
  );
}

/** 一键上传本地 CSV（multipart，不经过工程目录） */
export async function importTelemetryWatchlistCsvFile(
  code: string,
  file: File
): Promise<{ imported: number }> {
  const fd = new FormData();
  fd.append("file", file);
  return unwrap(
    axios.post<ApiResult<{ imported: number }>>(
      `/api/v1/telemetry/watchlists/${encodeURIComponent(code)}/import-file`,
      fd
    )
  );
}

/** 上传 CSV：后端按文件名生成清单名、整表写入并设为 WinCC 当前使用的清单 */
export async function importTelemetryWatchlistCsvFileQuick(
  file: File
): Promise<{ imported: number; bundleCode: string; displayName: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return unwrap(
    axios.post<ApiResult<{ imported: number; bundleCode: string; displayName: string }>>(
      "/api/v1/telemetry/watchlists/quick-import-file",
      fd
    )
  );
}
