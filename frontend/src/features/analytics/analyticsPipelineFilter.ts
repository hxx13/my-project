/** 对比周期：每日 / 每周 / 每月清算 */
export type AnalyticsCompareCycle = "day" | "week" | "month";

/** @deprecated 使用 AnalyticsCompareCycle */
export type AnalyticsCycle = AnalyticsCompareCycle;

/** 已保存配置（不含时间；时间由每日自动清算生成） */
export type AnalyticsScopeFilter = {
  actionType: "" | "1" | "2";
  campuses: string[];
  floors: string[];
  roomName: string;
  excludeBlacklist: boolean;
  /** 启用的清算对比：日、周、月（至少一项） */
  compareCycles: AnalyticsCompareCycle[];
};

/** 编辑区临时状态 = 范围筛选 + 对比周期（保存时写入配置） */
export type AnalyticsDraftFilter = AnalyticsScopeFilter;

export const CAMPUS_OPTIONS = [
  { value: "浦东", label: "浦东" },
  { value: "浦西", label: "浦西" },
] as const;

export const PUDONG_FLOOR_OPTIONS = [
  { value: "E11A", label: "E11A" },
  { value: "E11B", label: "E11B" },
  { value: "地下E11C", label: "E11C" },
  { value: "1", label: "1F" },
  { value: "2", label: "2F" },
  { value: "3", label: "3F" },
  { value: "4", label: "4F" },
] as const;

export const COMPARE_CYCLE_OPTIONS: { value: AnalyticsCompareCycle; label: string; hint: string }[] = [
  { value: "day", label: "每日清算", hint: "昨日 vs 前日" },
  { value: "week", label: "每周清算", hint: "上周 vs 上上周" },
  { value: "month", label: "每月清算", hint: "上月 vs 上上月" },
];

export const defaultAnalyticsDraftFilter = (): AnalyticsDraftFilter => ({
  actionType: "",
  campuses: [],
  floors: [],
  roomName: "",
  excludeBlacklist: true,
  compareCycles: ["day"],
});

export function scopeFilterOnly(filter: AnalyticsDraftFilter): AnalyticsScopeFilter {
  return {
    actionType: filter.actionType,
    campuses: filter.campuses,
    floors: filter.floors,
    roomName: filter.roomName,
    excludeBlacklist: filter.excludeBlacklist,
    compareCycles: filter.compareCycles.length ? filter.compareCycles : ["day"],
  };
}

export function migrateAnalyticsFilter(raw: Record<string, unknown>): AnalyticsDraftFilter {
  const base = defaultAnalyticsDraftFilter();
  const campuses = parseStringArray(raw.campuses);
  const legacyCampus = String(raw.campus ?? "").trim();
  if (!campuses.length && legacyCampus) campuses.push(legacyCampus);

  const floors = parseStringArray(raw.floors);
  const legacyFloor = String(raw.floor ?? raw.floorName ?? "").trim();
  if (!floors.length && legacyFloor) floors.push(legacyFloor);

  const fromAudit = parseStringArray(raw.auditCycles);
  const fromCompare = parseStringArray(raw.compareCycles);
  const compareCycles = [...fromCompare, ...fromAudit].filter(
    (c): c is AnalyticsCompareCycle => c === "day" || c === "week" || c === "month"
  );
  const uniqueCycles = [...new Set(compareCycles)];

  return {
    ...base,
    actionType: (raw.actionType === "1" || raw.actionType === "2" ? raw.actionType : "") as AnalyticsDraftFilter["actionType"],
    campuses,
    floors,
    roomName: String(raw.roomName ?? "").trim(),
    excludeBlacklist: raw.excludeBlacklist !== false,
    compareCycles: uniqueCycles.length ? uniqueCycles : base.compareCycles,
  };
}

function parseStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string" && v.includes(",")) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
