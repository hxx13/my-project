import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface SpecialStatusEntry {
  code: string;
  label: string;
  iconKey: string;
  detailName?: string;
  detailDescription?: string;
}

export interface CageShelfOption {
  shelveId: string;
  shelveName: string;
}

export interface CageShelfFilterOptions {
  campuses: Array<{ campusId: string; campusName: string }>;
  areas: Array<{ areaId: string; areaName: string }>;
  floors: Array<{ floorId: string; floorName: string }>;
  rooms: Array<{ roomId: string; roomName: string }>;
  shelves: CageShelfOption[];
}

export interface CageShelfCell {
  x: number;
  y: number;
  position: string;
  empty: boolean;
  stateLabel: string;
  animalCageType?: number;
  name?: string;
  piName?: string;
  projectGroup?: string;
  departmentName?: string;
  projectPiName?: string;
  cageBoxInfo?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  specialStatuses?: SpecialStatusEntry[];
  annotation?: {
    richText?: string | null;
    images?: string | null;
    updatedAt?: string;
    updatedBy?: string;
  };
}

export interface CageShelfDetail {
  shelfMeta: {
    campusName: string;
    areaName: string;
    floorName: string;
    roomName: string;
    shelveId: string;
    shelveName: string;
  };
  grid: CageShelfCell[];
  totalCells: number;
  filledCells: number;
  fromCache?: boolean;
  cachedAt?: string;
}

export async function importCageShelfCsv(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await authHttp.post<Result<{ created: number; updated: number; skipped: number; errors?: string[] }>>(
    "/v1/cage-shelves/import",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "导入失败");
  }
  return (
    res.data.data || {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    }
  );
}

export async function fetchCageShelfFilterOptions(params: {
  campusId?: number;
  areaId?: string;
  areaName?: string;
  floorId?: string;
  floorName?: string;
  roomId?: string;
  roomName?: string;
}) {
  const res = await authHttp.get<Result<CageShelfFilterOptions>>("/v1/cage-shelves/filter-options", { params });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "加载筛选项失败");
  }
  return res.data.data;
}

export async function fetchCageShelfDetail(shelveId: string, batchId?: string) {
  const res = await authHttp.get<Result<CageShelfDetail>>(`/v1/cage-shelves/${encodeURIComponent(String(shelveId))}/detail`, {
    params: batchId ? { batchId } : {},
  });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "加载笼架详情失败");
  }
  return res.data.data;
}

export interface CageShelfIndexRow {
  campusId: string;
  campusName: string;
  areaId: string;
  areaName: string;
  floorId: string;
  floorName: string;
  roomId: string;
  roomName: string;
  shelveId: string;
  shelveName: string;
  orders?: number;
  updateTime?: string;
}

export interface CageScanProgress {
  status: string;
  totalShelves: number;
  processedShelves: number;
  currentRoomName?: string;
  currentShelveName?: string;
  cagesScanned: number;
  cagesWithStatus: number;
  percent: number;
  message?: string;
  startedAt?: string;
}

export async function fetchCageScanProgress() {
  const res = await authHttp.get<Result<CageScanProgress>>("/v1/cage-shelves/scan-progress");
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取扫描进度失败");
  }
  return res.data.data;
}

export interface SpecialStatusGroup {
  statusCode: string;
  statusLabel: string;
  count: number;
  cages: SpecialStatusCage[];
}

export interface SpecialStatusCage {
  shelveId: string;
  shelveName: string;
  floorName: string;
  campusName: string;
  roomName: string;
  position: string;
  positionX: number;
  positionY: number;
  piName: string;
  departmentName: string;
  projectPiName: string;
  cageBoxQrCode: string;
  detailName: string;
  detailDescription: string;
  animalCageType: number;
}

export interface SpecialStatusOverview {
  groups: SpecialStatusGroup[];
  totalAbnormal: number;
  scannedAt: string;
}

export async function fetchSpecialStatusOverview(batchId?: string) {
  const res = await authHttp.get<Result<SpecialStatusOverview>>("/v1/cage-shelves/special-status-overview", {
    params: batchId ? { batchId } : {},
  });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取特殊状态总览失败");
  }
  return res.data.data;
}

export async function refreshShelfDetail(shelveId: string) {
  const res = await authHttp.post<Result<CageShelfDetail>>(
    `/v1/cage-shelves/${encodeURIComponent(String(shelveId))}/refresh`
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "刷新笼架数据失败");
  }
  return res.data.data;
}

// ---- 用户笼位颜色配置 ----

export type CageColorConfig = Record<string, { bg: string; border: string }>;

export async function fetchUserCageColors(): Promise<CageColorConfig> {
  const res = await authHttp.get<Result<CageColorConfig>>("/v1/cage-shelves/user-colors");
  if (!res.data?.success) throw new Error(res.data?.message || "加载颜色配置失败");
  return res.data.data ?? {};
}

export async function saveUserCageColors(colors: CageColorConfig): Promise<void> {
  const res = await authHttp.post<Result<void>>("/v1/cage-shelves/user-colors", { colors });
  if (!res.data?.success) throw new Error(res.data?.message || "保存颜色配置失败");
}

// ---- cell refresh ----

export async function refreshCellDetail(shelveId: string, x: number, y: number) {
  const res = await authHttp.get<Result<CageShelfCell>>(
    `/v1/cage-shelves/${encodeURIComponent(String(shelveId))}/cells/${x}/${y}/refresh`
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "刷新笼位数据失败");
  }
  return res.data.data;
}

export async function fetchCageShelfIndexes(params: {
  campusId?: number;
  areaId?: string;
  floorId?: string;
  roomId?: string;
  page?: number;
  size?: number;
}) {
  const res = await authHttp.get<Result<{ rows: CageShelfIndexRow[]; total: number; page: number; size: number }>>(
    "/v1/cage-shelves/indexes",
    { params }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "加载索引表失败");
  }
  return res.data.data;
}

// ---- 特殊状态统计（前端计算，无需新后端接口） ----

export interface SpecialStatusStats {
  byStatus: { code: string; label: string; count: number }[];
  byCampus: { campusName: string; counts: Record<string, number>; total: number }[];
  byRoom: { roomName: string; campusName: string; counts: Record<string, number>; total: number }[];
  byGroup: { groupName: string; roomName: string; campusName: string; counts: Record<string, number>; total: number }[];
  allCages: SpecialStatusCage[];
  totalAbnormal: number;
  scannedAt: string;
}

/**
 * 从 SpecialStatusOverview 计算所有统计维度（纯前端聚合）。
 */
export function computeSpecialStatusStats(overview: SpecialStatusOverview): SpecialStatusStats {
  const { groups, totalAbnormal, scannedAt } = overview;

  const byStatus = groups.map((g) => ({ code: g.statusCode, label: g.statusLabel, count: g.count }));

  const allCages = groups.flatMap((g) => g.cages);

  // byCampus
  const campusMap = new Map<string, SpecialStatusStats["byCampus"][number]>();
  for (const g of groups) {
    for (const c of g.cages) {
      const cn = c.campusName || "未知校区";
      const entry = campusMap.get(cn) ?? { campusName: cn, counts: {}, total: 0 };
      entry.counts[g.statusCode] = (entry.counts[g.statusCode] ?? 0) + 1;
      entry.total++;
      campusMap.set(cn, entry);
    }
  }
  const byCampus = [...campusMap.values()].sort((a, b) => b.total - a.total);

  // byRoom
  const roomMap = new Map<string, SpecialStatusStats["byRoom"][number]>();
  for (const g of groups) {
    for (const c of g.cages) {
      const rn = c.roomName || "未知房间";
      const key = `${c.campusName ?? ""}|${rn}`;
      const entry = roomMap.get(key) ?? { roomName: rn, campusName: c.campusName || "", counts: {}, total: 0 };
      entry.counts[g.statusCode] = (entry.counts[g.statusCode] ?? 0) + 1;
      entry.total++;
      roomMap.set(key, entry);
    }
  }
  const byRoom = [...roomMap.values()].sort((a, b) => b.total - a.total);

  // byGroup (课题组 = projectPiName || piName)
  const groupMap = new Map<string, SpecialStatusStats["byGroup"][number]>();
  for (const g of groups) {
    for (const c of g.cages) {
      const gn = c.projectPiName || c.piName || "未知课题组";
      const key = `${c.campusName ?? ""}|${c.roomName ?? ""}|${gn}`;
      const entry = groupMap.get(key) ?? { groupName: gn, roomName: c.roomName || "", campusName: c.campusName || "", counts: {}, total: 0 };
      entry.counts[g.statusCode] = (entry.counts[g.statusCode] ?? 0) + 1;
      entry.total++;
      groupMap.set(key, entry);
    }
  }
  const byGroup = [...groupMap.values()].sort((a, b) => b.total - a.total);

  return { byStatus, byCampus, byRoom, byGroup, allCages, totalAbnormal, scannedAt };
}

// ---- 笼位事件日志 ----

export interface CageEventLogEntry {
  id: number;
  scanBatchId: string;
  eventType: string;
  cageBoxQrCode?: string;
  prevShelveId?: string;
  prevPosition?: string;
  prevCampusName?: string;
  prevRoomName?: string;
  currShelveId?: string;
  currPosition?: string;
  currCampusName?: string;
  currRoomName?: string;
  prevValueJson?: string;
  currValueJson?: string;
  detailSummary?: string;
  piName?: string;
  projectPiName?: string;
  departmentName?: string;
  changedAt: string;
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  BASELINE_ESTABLISHED: "基线建立",
  BOX_ARRIVED: "笼盒到达",
  BOX_DEPARTED: "笼盒移出",
  BOX_MOVED: "笼盒移动",
  TYPE_CHANGED: "类型变更",
  STATUS_ADDED: "状态新增",
  STATUS_REMOVED: "状态解除",
  STATUS_CHANGED: "状态变更",
  PI_CHANGED: "PI 变更",
  DEPT_CHANGED: "部门变更",
};

export async function fetchCageEventLogs(params: {
  eventType?: string;
  campusName?: string;
  searchText?: string;
  startTime?: string;
  endTime?: string;
  offset?: number;
  limit?: number;
}): Promise<{ rows: CageEventLogEntry[]; total: number; offset: number; limit: number }> {
  const res = await authHttp.get<Result<{ rows: CageEventLogEntry[]; total: number; offset: number; limit: number }>>(
    "/v1/cage-shelves/event-logs",
    { params }
  );
  if (!res.data?.success) throw new Error(res.data?.message || "查询事件日志失败");
  return res.data.data;
}

export async function fetchEventTimeline(cageBoxQrCode: string, limit = 100): Promise<CageEventLogEntry[]> {
  const res = await authHttp.get<Result<CageEventLogEntry[]>>(
    `/v1/cage-shelves/event-logs/timeline/${encodeURIComponent(cageBoxQrCode)}`,
    { params: { limit } }
  );
  if (!res.data?.success) throw new Error(res.data?.message || "查询时间线失败");
  return res.data.data ?? [];
}

// ── New snapshot + bookmark APIs ──────────────────────────────────

export interface CageCellSnapshot {
  roomId: number;
  shelveId: number;
  positionX: number;
  positionY: number;
  positionLabel: string;
  animalCageType?: number;
  cageBoxJson?: string;
  specialStatusesJson?: string;
  scannedAt?: string;
  empty?: boolean;
}

/** GET /api/cage-shelves/{roomId}/{shelveId}/cells */
export async function fetchShelfCells(roomId: string, shelveId: string): Promise<{
  roomId: number; shelveId: number; cells: CageCellSnapshot[]; isEmpty?: boolean;
}> {
  const res = await authHttp.get<Result<any>>(
    `/cage-shelves/${encodeURIComponent(roomId)}/${encodeURIComponent(shelveId)}/cells`
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载笼位失败");
  return res.data.data;
}

/** GET /api/cage-shelves/cells/batch?pairs=r1:s1,r2:s2 */
export async function fetchShelfCellsBatch(pairs: string[]): Promise<{ key: string; cells: CageCellSnapshot[] }[]> {
  const res = await authHttp.get<Result<any[]>>(
    `/cage-shelves/cells/batch`, { params: { pairs: pairs.join(',') } }
  );
  if (!res.data?.success) throw new Error(res.data?.message || "批量加载笼位失败");
  return res.data.data ?? [];
}

export interface BookmarkEntry {
  roomId: string;
  shelveId: string;
  shelveName: string;
  campusName: string;
  roomName: string;
  createdAt: string;
}

function normalizeBookmarkEntry(raw: Record<string, unknown>): BookmarkEntry {
  const shelveId = String(raw.shelveId ?? "");
  const roomId = String(raw.roomId ?? "");
  const shelveName = typeof raw.shelveName === "string" && raw.shelveName.trim() !== ""
    ? raw.shelveName
    : shelveId;
  return {
    roomId,
    shelveId,
    shelveName,
    campusName: String(raw.campusName ?? ""),
    roomName: String(raw.roomName ?? ""),
    createdAt: String(raw.createdAt ?? ""),
  };
}

/** 按 roomId:shelveId 去重，避免历史脏数据或精度丢失导致重复卡片 */
export function dedupeBookmarks(list: BookmarkEntry[]): BookmarkEntry[] {
  const seen = new Map<string, BookmarkEntry>();
  for (const b of list) {
    const key = `${b.roomId}:${b.shelveId}`;
    if (!key || key === ":") continue;
    if (!seen.has(key)) seen.set(key, b);
  }
  return [...seen.values()];
}

export interface CageShelfTreeNode {
  campusId: string; campusName: string;
  areaId: string; areaName: string;
  floorId: string; floorName: string;
  roomId: string; roomName: string;
  shelveId: string; shelveName: string;
  type1?: number; type2?: number; type3?: number; type4?: number;
}

/** GET /api/cage-shelves/full-tree — 全量树，前端缓存无需级联 */
export async function fetchFullTree(): Promise<CageShelfTreeNode[]> {
  const res = await authHttp.get<Result<CageShelfTreeNode[]>>("/cage-shelves/full-tree");
  if (!res.data?.success) throw new Error(res.data?.message || "加载笼架树失败");
  return res.data.data ?? [];
}

/** GET /api/cage-shelves/bookmarks */
export async function fetchBookmarks(): Promise<BookmarkEntry[]> {
  const res = await authHttp.get<Result<Record<string, unknown>[]>>(`/cage-shelves/bookmarks`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载收藏失败");
  return dedupeBookmarks((res.data.data ?? []).map(normalizeBookmarkEntry));
}

/** PUT /api/cage-shelves/{roomId}/{shelveId}/bookmark */
export async function toggleBookmarkApi(roomId: string, shelveId: string): Promise<{
  roomId: string; shelveId: string; bookmarked: boolean;
}> {
  const res = await authHttp.put<Result<any>>(
    `/cage-shelves/${encodeURIComponent(roomId)}/${encodeURIComponent(shelveId)}/bookmark`
  );
  if (!res.data?.success) throw new Error(res.data?.message || "操作失败");
  return res.data.data;
}

// ---- 快照批次（历史数据源） ----

export interface SnapshotBatch {
  scanBatchId: string;
  scannedAt: string;
  totalRows: number;
  abnormalRows: number;
  shelfCount: number;
}

export async function fetchSnapshotBatches(): Promise<SnapshotBatch[]> {
  const res = await authHttp.get<Result<SnapshotBatch[]>>("/cage-shelves/snapshot-batches");
  if (!res.data?.success) throw new Error(res.data?.message || "加载快照批次失败");
  return res.data.data ?? [];
}

// ---- 笼位特殊状态持续告警 ----

export interface CageAlertConfig {
  id?: number;
  statusCode: string;
  statusLabel: string;
  thresholdDays: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PersistedAlert {
  statusCode: string;
  statusLabel: string;
  shelveId: string;
  positionX: number;
  positionY: number;
  position: string;
  campusName: string;
  roomName: string;
  cageBoxQrCode: string;
  projectPiName: string;
  thresholdDays: number;
  persistedDays: number;
  spanDays?: number;
  persisted?: boolean;
  firstDetectedAt: string;
}

export async function fetchPersistedAlerts(baselineBatchId?: string, mode?: string): Promise<{ alerts: PersistedAlert[]; generatedAt: string; spanDays: number; baselineBatchId?: string; currentBatchId?: string }> {
  const res = await authHttp.get<Result<any>>("/v1/cage-shelves/persisted-alerts", {
    params: { baselineBatchId: baselineBatchId || "", mode: mode || "auto" },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "加载告警数据失败");
  return res.data.data ?? { alerts: [], generatedAt: "", spanDays: 0 };
}

export async function fetchAlertConfig(mode?: string): Promise<CageAlertConfig[]> {
  const res = await authHttp.get<Result<CageAlertConfig[]>>("/v1/cage-shelves/alert-config", {
    params: { mode: mode || "auto" },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "加载告警配置失败");
  return res.data.data ?? [];
}

export async function saveAlertConfig(configs: CageAlertConfig[], mode?: string): Promise<void> {
  const res = await authHttp.put<Result<void>>("/v1/cage-shelves/alert-config", configs, {
    params: { mode: mode || "auto" },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "保存告警配置失败");
}
