import { calendarDayKeyBeijing } from "@/utils/beijingTime";

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

/** 默认只查今日，避免加载全量流水导致卡顿；与 FilterBar 的「今日」按钮行为一致 */
export const defaultDebugPipelineFilter = (): DebugPipelineFilter => {
  const today = calendarDayKeyBeijing(new Date());
  return {
    keyword: "",
    startTime: today,
    endTime: today,
    actionType: "",
    campus: "",
    floor: "",
    roomName: "",
    excludeBlacklist: true,
  };
};

/** 组装后端查询参数（与 twinApi fetchFilteredDebugLogs 一致） */
export function buildDebugPipelineQueryParams(
  filters: DebugPipelineFilter
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {
    excludeBlacklist: filters.excludeBlacklist,
  };
  if (filters.keyword.trim()) params.keyword = filters.keyword.trim();
  if (filters.startTime) {
    params.startTime = filters.startTime.includes(":")
      ? filters.startTime
      : `${filters.startTime} 00:00:00`;
  }
  if (filters.endTime) {
    params.endTime = filters.endTime.includes(":") ? filters.endTime : `${filters.endTime} 23:59:59`;
  }
  if (filters.actionType === "1" || filters.actionType === "2") {
    params.actionType = Number(filters.actionType);
  }
  if (filters.campus.trim()) params.campus = filters.campus.trim();
  if (filters.floor.trim()) params.floor = filters.floor.trim();
  if (filters.roomName.trim()) params.roomName = filters.roomName.trim();
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
