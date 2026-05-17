/** 与访问流水 debug 页（DebugTablePage）一致的筛选字段 */
export type DebugPipelineFilter = {
  keyword: string;
  startTime: string;
  endTime: string;
  actionType: "" | "1" | "2";
  campus: string;
  floor: string;
  roomName: string;
  excludeBlacklist: boolean;
};

export const defaultDebugPipelineFilter = (): DebugPipelineFilter => ({
  keyword: "",
  startTime: "",
  endTime: "",
  actionType: "",
  campus: "",
  floor: "",
  roomName: "",
  excludeBlacklist: true,
});

/** 组装后端查询参数（与 twinApi fetchFilteredDebugLogs 一致） */
export function buildDebugPipelineQueryParams(filters: DebugPipelineFilter): Record<string, string | boolean> {
  const params: Record<string, string | boolean> = { ...filters };
  if (params.startTime && typeof params.startTime === "string" && !params.startTime.includes(":")) {
    params.startTime = `${params.startTime} 00:00:00`;
  }
  if (params.endTime && typeof params.endTime === "string" && !params.endTime.includes(":")) {
    params.endTime = `${params.endTime} 23:59:59`;
  }
  if (!params.actionType) delete params.actionType;
  if (!params.roomName) delete params.roomName;
  if (!params.campus) delete params.campus;
  if (!params.floor) delete params.floor;
  if (!params.keyword) delete params.keyword;
  return params;
}

/** 兼容旧订阅里存的 regionName/floorName 字段 */
export function migrateLegacyAnalyticsFilter(raw: Record<string, unknown>): DebugPipelineFilter {
  const base = defaultDebugPipelineFilter();
  return {
    ...base,
    keyword: String(raw.keyword ?? "").trim(),
    startTime: String(raw.startTime ?? "").trim(),
    endTime: String(raw.endTime ?? "").trim(),
    actionType: (raw.actionType === "1" || raw.actionType === "2" ? raw.actionType : "") as DebugPipelineFilter["actionType"],
    campus: String(raw.campus ?? "").trim(),
    floor: String(raw.floor ?? raw.floorName ?? "").trim(),
    roomName: String(raw.roomName ?? "").trim(),
    excludeBlacklist: raw.excludeBlacklist !== false,
  };
}
