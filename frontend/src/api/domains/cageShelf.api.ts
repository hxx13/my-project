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
  id?: string | number;
  x: number;
  y: number;
  position: string;
  empty: boolean;
  visible?: boolean;
  stateLabel: string;
  animalCageType?: number;
  name?: string;
  piName?: string;
  projectGroup?: string;
  departmentName?: string;
  projectPiName?: string;
  activeClaimId?: string | number;
  occupantName?: string;
  cageBoxInfo?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  specialStatuses?: SpecialStatusEntry[];
  /** 该笼位 active claim 的状态（locked/confirmed/pending_approval/...，无 active claim 为 undefined） */
  claimStatus?: string;
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
    shelfIndexId?: number;
    roomId?: string | number;
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
  id: number;
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
  keyword?: string;
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
  roomId: number | string;
  shelveId: number | string;
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
  roomId: number | string; shelveId: number | string; cells: CageCellSnapshot[]; isEmpty?: boolean;
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
  id: number;  // cage_shelf_index 主键，用于 pool/claim 等接口的 shelfIndexId
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

export async function deleteSnapshotBatch(batchId: string): Promise<{ deletedBatch: string; eventsDeleted: number; snapshotsDeleted: number }> {
  const res = await authHttp.delete<Result<{ deletedBatch: string; eventsDeleted: number; snapshotsDeleted: number }>>(
    `/v1/cage-shelves/snapshot-batches/${encodeURIComponent(batchId)}`
  );
  if (!res.data?.success) throw new Error(res.data?.message || "删除快照失败");
  return res.data.data;
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

export async function fetchPersistedAlerts(baselineBatchId?: string, currentBatchId?: string, mode?: string): Promise<{ alerts: PersistedAlert[]; generatedAt: string; spanDays: number; baselineBatchId?: string; currentBatchId?: string }> {
  const res = await authHttp.get<Result<any>>("/v1/cage-shelves/persisted-alerts", {
    params: { baselineBatchId: baselineBatchId || "", currentBatchId: currentBatchId || "", mode: mode || "auto" },
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

// ==========================================================================
// 🔧 实时数据源 + 笼位分配（2026-07-27 新增）
// ==========================================================================

export interface RealtimeRefreshResponse {
  shelves: CageShelfDetail[];
  roomMeta: { roomId: string; roomName?: string; shelfCount: number };
  fromRealtime: boolean;
  cachedAt: string;
  cooldownRemainingMs: number;
}

export interface AupItem {
  id: string;
  registerNo: string;
  projectGroupName: string;
  piName: string;
}

export interface CooldownStatus {
  cooldownRemainingMs: number;
  inCooldown: boolean;
}

/** 实时拉取笼架数据（含 1min 冷却） */
export async function fetchRealtimeRefresh(roomId: string, shelveId?: string): Promise<RealtimeRefreshResponse> {
  const res = await authHttp.post<Result<RealtimeRefreshResponse>>("/v1/cage-shelves/realtime/refresh", {
    roomId, shelveId: shelveId || undefined,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "实时刷新失败");
  return res.data.data!;
}

/** 强制实时拉取（绕过冷却） */
export async function forceRealtimeRefresh(roomId: string): Promise<RealtimeRefreshResponse> {
  const res = await authHttp.post<Result<RealtimeRefreshResponse>>("/v1/cage-shelves/realtime/force-refresh", {
    roomId,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "强制刷新失败");
  return res.data.data!;
}

/** 查询冷却剩余时间 */
export async function fetchCooldownRemaining(roomId: string, shelveId?: string): Promise<CooldownStatus> {
  const res = await authHttp.get<Result<CooldownStatus>>("/v1/cage-shelves/realtime/cooldown", {
    params: { roomId, shelveId: shelveId || undefined },
  });
  return res.data?.data ?? { cooldownRemainingMs: 0, inCooldown: false };
}

/** 查分配用 AUP 列表 */
export async function fetchAllocationAups(): Promise<AupItem[]> {
  const res = await authHttp.get<Result<AupItem[]>>("/v1/cage-shelves/allocation/aups");
  return res.data?.data ?? [];
}

/** 执行笼位分配 */
export async function assignCages(
  roomId: string, shelveId: string, cageIds: string[], aupId: string, registerNumber?: string,
): Promise<{ ok: boolean }> {
  const res = await authHttp.post<Result<{ ok: boolean }>>("/v1/cage-shelves/allocation/assign", {
    roomId, shelveId, cageIds, aupId, registerNumber,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "分配失败");
  return res.data.data ?? { ok: false };
}

/** 取消笼位分配 */
export async function cancelCageAssignment(cageIds: string[], roomId?: string): Promise<{ ok: boolean }> {
  const res = await authHttp.post<Result<{ ok: boolean }>>("/v1/cage-shelves/allocation/cancel", {
    cageIds, roomId: roomId || undefined,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "取消分配失败");
  return res.data.data ?? { ok: false };
}

// ── 笼盒扫码操作 ──

// 动作集合的唯一来源是 features/cage-shelf/constants 的 CAGE_BOX_ACTIONS 表；
// 这里只做 type-only 转出（运行时完全擦除，不产生 import 环），保持既有引用路径不变。
export type { CageBoxAction } from "@/features/cage-shelf/constants";
import type { CageBoxAction } from "@/features/cage-shelf/constants";

export interface CageBoxActionRequest {
  roomId: string;
  shelveId: string;
  cageBoxCode: string;
  action: CageBoxAction;
  specialBreedingName?: string;
  specialBreedingDescription?: string;
  animalHealthDegree?: number;
  healthDetail?: string;
  itching?: number;
  reportUserName?: string;
  observeDate?: string;
}

export interface CageBoxActionResult {
  success: boolean;
  cageBoxCode: string;
  cageBoxId: string;
  animalCageId: string;
  action: string;
}

export async function executeCageBoxAction(req: CageBoxActionRequest): Promise<CageBoxActionResult> {
  const res = await authHttp.post<Result<CageBoxActionResult>>("/aro/cage-box/action", req);
  if (!res.data?.success) throw new Error(res.data?.message || "操作失败");
  return res.data.data!;
}

// ── 笼盒绑定 / 取消颜色（2026-07-30） ──

/** cancelColor 取值：1=特殊饲养 2=分笼 3=健康检查 */
export type CancelColor = 1 | 2 | 3;

/**
 * Action → CancelColor 映射。仅覆盖 ARO 侧有颜色语义的三个动作；
 * 合笼/动物转移是本地自定义状态，ARO 无对应颜色，故为 Partial（取值可能为 undefined）。
 */
export const ACTION_CANCEL_COLOR: Partial<Record<CageBoxAction, CancelColor>> = {
  DIVIDE: 2,
  SPECIAL_BREEDING: 1,
  HEALTH_CHECK: 3,
};

export async function cancelCageBoxColor(
  roomId: string,
  shelveId: string,
  cageBoxCode: string,
  color: number,
): Promise<boolean> {
  const res = await authHttp.post<Result<boolean>>("/aro/cage-box/cancel", { roomId, shelveId, cageBoxCode, color });
  if (!res.data?.success) throw new Error(res.data?.message || "取消颜色失败");
  return res.data.data ?? false;
}

/** 扫码后查询笼盒的课题组成员（绑定前校验用） */
export interface CageBoxMember {
  id: number;
  jobNumber: string;
  name: string;
}

export interface CageBoxMembersResult {
  cageBoxCode: string;
  cageBoxId: number | string;
  animalCageId: number | string;
  members: CageBoxMember[];
}

export async function fetchCageBoxMembers(
  roomId: string, shelveId: string, cageBoxCode: string
): Promise<CageBoxMembersResult> {
  const res = await authHttp.post<Result<CageBoxMembersResult>>("/aro/cage-box/members", { roomId, shelveId, cageBoxCode });
  if (!res.data?.success) throw new Error(res.data?.message || "查询成员失败");
  return res.data.data!;
}

/** 笼位更新 payload */
export interface AnimalCageUpdatePayload {
  id: number | string;
  name: string;
  roomId: number | string;
  shelveId: number | string;
  postionX: number;
  postionY: number;
  qrcode?: string;
  state?: number;
  type?: number;
  typeId?: number | string;
  typeName?: string;
  orders?: number;
}

export async function updateAnimalCage(data: AnimalCageUpdatePayload): Promise<boolean> {
  const res = await authHttp.post<Result<boolean>>("/v1/cage-shelves/cage/update", data);
  console.log("[API updateAnimalCage] 完整响应:", JSON.stringify(res, null, 2));
  if (!res.data?.success) throw new Error(res.data?.message || "笼位更新失败");
  return res.data.data ?? false;
}

// ── 笼位预约管理（2026-07-28） ──

export interface BookingRoom {
  roomId: string;
  name: string;
  description: string;
  shelveNumber: number;
  animalCageNumber: number;
  rentAnimalCageNumber: number;
  usedAnimalCageNumber: number;
  lastRentNumber: number;
  memo: string;
}

export interface BookingAup {
  id: string;
  roomId: string;
  name: string;
  piName: string;
  registerNumber: string;
  aupId: string;
  rentNumber: number;
  usedAnimalCageNumber: number;
  memo: string;
  beginTime: string;
  endTime: string;
}

export interface BookingRoomsResponse {
  data: {
    list: BookingRoom[];
    total: number;
    pageNum: number;
    pageSize: number;
    page: number;
  };
  status: number;
}

export interface BookingAupsResponse {
  data: BookingAup[];
  status: number;
}

/** 房间预约汇总列表 */
export async function fetchBookingRooms(pageNum = 1, pageSize = 30): Promise<BookingRoomsResponse> {
  const res = await authHttp.get<Result<BookingRoomsResponse>>("/v1/cage-shelves/booking/rooms", {
    params: { pageNum, pageSize },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "加载房间预约列表失败");
  return res.data.data!;
}

/** 手动同步：从 ARO 拉取房间预约汇总 + AUP 明细落本地（硬覆盖） */
export async function syncBookingData(): Promise<{ ok: boolean; rooms: number; aups: number }> {
  const res = await authHttp.post<Result<{ ok: boolean; rooms: number; aups: number }>>(
    "/v1/cage-shelves/booking/sync",
  );
  if (!res.data?.success) throw new Error(res.data?.message || "同步失败");
  return res.data.data ?? { ok: false, rooms: 0, aups: 0 };
}

/** 房间内 AUP 分配明细 */
export async function fetchBookingRoomAups(roomId: string, pageNum = 1, pageSize = 30): Promise<BookingAupsResponse> {
  const res = await authHttp.get<Result<BookingAupsResponse>>(
    `/v1/cage-shelves/booking/rooms/${encodeURIComponent(roomId)}/aups`,
    { params: { pageNum, pageSize } }
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载AUP分配失败");
  return res.data.data!;
}

/** 新增/编辑 AUP 分配 */
export async function saveBookingAup(roomId: string, body: Record<string, unknown>): Promise<void> {
  const res = await authHttp.post<Result<unknown>>(
    `/v1/cage-shelves/booking/rooms/${encodeURIComponent(roomId)}/aups`,
    body
  );
  if (!res.data?.success) throw new Error(res.data?.message || "保存AUP分配失败");
}

/** 删除 AUP 分配 */
export async function deleteBookingAup(id: string): Promise<void> {
  const res = await authHttp.post<Result<unknown>>(
    `/v1/cage-shelves/booking/aups/${encodeURIComponent(id)}/delete`
  );
  if (!res.data?.success) throw new Error(res.data?.message || "删除AUP分配失败");
}

/** 保存房间上限（animal_cage_number） */
export async function saveRoomCapacity(roomId: string, capacity: number): Promise<void> {
  const res = await authHttp.post<Result<unknown>>(
    `/v1/cage-shelves/booking/rooms/${encodeURIComponent(roomId)}/capacity`,
    { capacity }
  );
  if (!res.data?.success) throw new Error(res.data?.message || "保存房间上限失败");
}

/** AUP 下拉字典（自己的字段口径：id/registerNo/projectGroupName/piName） */
export async function fetchAupDict(): Promise<{ id: string; registerNo: string; projectGroupName: string; piName: string }[]> {
  const res = await authHttp.get<Result<{ id: string; registerNo: string; projectGroupName: string; piName: string }[]>>(
    "/v1/cage-shelves/booking/aups/dict"
  );
  return res.data?.data ?? [];
}

// ── 统一扫码查询 ──

export interface CodeLookupCageBox {
  /** 从 cage_shelf_index 解析的真实 shelveId（非快照表） */
  shelveId?: number;
  roomId?: number;
  campusName: string;
  roomName: string;
  positionX: number;
  positionY: number;
  positionLabel: string;
}

/** 新扫码语义：笼位（animal_cage_id）命中 */
export interface CodeLookupCell {
  animalCageId?: string;
  shelveId?: string;
  shelveName?: string;
  roomId?: string | number;
  campusName: string;
  roomName: string;
  positionX: number;
  positionY: number;
  positionLabel: string;
}

/** 笼位 active claim 摘要 */
export interface CodeLookupClaim {
  /** cage_claims.id（AUTO_INCREMENT，小整数） */
  id: number;
  claimStatus: string;
  claimantId: string;
  claimantName: string;
  /** 是否需要到场确认 */
  confirmRequired?: boolean;
  /** ARO AUP 雪花 ID，可能为空 */
  aupId?: number | string | null;
  aupNumber?: string | null;
  projectPiName?: string | null;
  projectName?: string | null;
  hasInfo: boolean;
}

export interface CodeLookupResult {
  type: "CAGE_CELL" | "LEGACY_CAGE_BOX" | "CAGE_BOX" | "ASSET" | "NOT_FOUND";
  message?: string;
  cageBox?: CodeLookupCageBox;
  cageCell?: CodeLookupCell;
  claim?: CodeLookupClaim;
  asset?: Record<string, unknown>;
  /** 旧盒码兜底命中时，位置字段平铺在顶层（供定位高亮） */
  legacy?: boolean;
  roomId?: string | number;
  shelveId?: string;
  shelveName?: string;
  positionX?: number;
  positionY?: number;
  campusName?: string;
  roomName?: string;
}

/** 统一扫码查询：根据二维码/条形码内容自动识别类型 */
export async function lookupCode(code: string): Promise<CodeLookupResult> {
  const res = await authHttp.get<Result<CodeLookupResult>>("/v1/scan/lookup", {
    params: { code },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "查询失败");
  const data = res.data.data!;
  console.log("[lookupCode] 扫码内容=", code, "→ type=", data.type, "cageCell=", data.cageCell, "claim=", data.claim);
  return data;
}

// ── 笼位ID索引 API (cage-cell-index) ──

export interface ShelfCellSummary {
  shelfIndexId: number;
  shelveId: number | string;
  shelveName: string;
  roomId: number | string;
  roomName: string;
  campusName: string;
  areaName: string;
  floorName: string;
  totalCells: number;
  syncedCells: number;
  boundCells: number;
  lastSyncedAt: string | null;
}

export interface CageCellIndexEntry {
  id: number;
  shelfIndexId: number;
  shelveId: string;
  positionX: number;
  positionY: number;
  /** ARO 雪花 ID，必须用字符串，禁止 Number() */
  animalCageId: string | null;
  hasCageBox: boolean;
  cageBoxCode: string | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  syncedAt: string | null;
}

export interface CellSyncStats {
  ok: boolean;
  totalShelves: number;
  successShelves: number;
  failShelves: number;
  totalCellsWritten?: number;
  totalUpdated?: number;
  totalSkipped?: number;
  total?: number;
  startedAt: string;
  finishedAt: string;
  failures?: Array<{ shelveId: string; error: string }>;
  error?: string;
}

/** 一键本地同步流水线结果（全量 → 补全详情 → 状态） */
export interface LocalSyncPipelineResult {
  ok: boolean;
  failedStep: string | null;
  failedMessage: string | null;
  completedSteps: string[];
  steps: {
    syncAllCells?: CellSyncStats;
    syncDetailFields?: CellSyncStats;
    syncStatusFromBook?: CellSyncStats;
  };
  startedAt: string;
  finishedAt: string;
}

const LOCAL_PIPELINE_STEP_LABEL: Record<string, string> = {
  syncAllCells: "全量同步笼位",
  syncDetailFields: "补全详情字段",
  syncStatusFromBook: "同步状态",
};

export function localPipelineStepLabel(step: string | null | undefined): string {
  if (!step) return "未知步骤";
  return LOCAL_PIPELINE_STEP_LABEL[step] ?? step;
}

export async function fetchCellIndexSummary(params: {
  roomId?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const res = await authHttp.get<Result<{ rows: ShelfCellSummary[]; total: number; page: number; pageSize: number }>>(
    "/cage-cell-index/summary",
    { params }
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载笼位索引汇总失败");
  return res.data.data!;
}

export async function fetchCellIndexByShelf(shelfIndexId: number): Promise<CageCellIndexEntry[]> {
  const res = await authHttp.get<Result<CageCellIndexEntry[]>>(
    `/cage-cell-index/shelf/${shelfIndexId}/cells`
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载笼位列表失败");
  return res.data.data ?? [];
}

export async function syncAllCellIds(roomId?: number): Promise<CellSyncStats> {
  const res = await authHttp.post<Result<CellSyncStats>>("/cage-cell-index/sync", {
    roomId: roomId ?? undefined,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "同步失败");
  return res.data.data!;
}

export interface CageCellLookupResult {
  shelfIndexId: number;
  shelveId: string;
  positionX: number;
  positionY: number;
  animalCageId: string;
  hasCageBox: boolean;
  cageBoxCode: string | null;
  campusName: string;
  areaName: string;
  floorName: string;
  roomName: string;
  roomId: string;
  shelveName: string;
}

/** 独立 /book 状态同步 */
export async function syncStatusFromBook(roomId?: number): Promise<CellSyncStats> {
  const res = await authHttp.post<Result<CellSyncStats>>("/cage-cell-index/sync-status", { roomId: roomId ?? undefined });
  if (!res.data?.success) throw new Error(res.data?.message || "状态同步失败");
  return res.data.data!;
}

// ═══════════════════════════════════════════
// 本地业务接口 (/api/local/*)
// ═══════════════════════════════════════════

export async function localAllocate(animalCageIds: (number | string)[], aupId: number | string, roomId: number | string, shelveId: number | string, piName: string, aupNumber: string) {
  const res = await authHttp.post<Result<any>>("/local/allocate", { animalCageIds, aupId, roomId, shelveId, piName, aupNumber });
  if (!res.data?.success) throw new Error(res.data?.message || "分配失败");
}
export async function localCancelAllocate(animalCageIds: (number | string)[]) {
  const res = await authHttp.post<Result<any>>("/local/cancel-allocate", { animalCageIds });
  if (!res.data?.success) throw new Error(res.data?.message || "取消分配失败");
}
export async function localEdit(animalCageId: number | string, toggle: string, enable: boolean, cageBoxCode?: string) {
  const res = await authHttp.post<Result<any>>("/local/edit", { animalCageId, toggle, enable, cageBoxCode: cageBoxCode || "" });
  if (!res.data?.success) throw new Error(res.data?.message || "编辑失败");
}

/** 补全详情字段 — 从 ARO /list 批量拉取 PI/课题组/动物品系等 */
export async function syncDetailFields(roomId?: number): Promise<CellSyncStats> {
  const res = await authHttp.post<Result<CellSyncStats>>("/cage-cell-index/sync-details", {
    roomId: roomId ?? undefined,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "详情补全失败");
  return res.data.data!;
}

/**
 * 一键同步本地笼位（仅超管）：固定顺序
 * 1) /back 全量 → 2) /list 补全详情 → 3) /book 状态
 */
export async function syncLocalCagePipeline(roomId?: number): Promise<LocalSyncPipelineResult> {
  const res = await authHttp.post<Result<LocalSyncPipelineResult>>(
    "/cage-cell-index/sync-local-pipeline",
    { roomId: roomId ?? undefined },
    { timeout: 600_000 },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "一键同步失败");
  return res.data.data!;
}

/** 本地数据源：通过 shelveId 加载笼架网格 */
export async function fetchLocalShelfGridByShelveId(shelveId: string): Promise<CageShelfDetail> {
  const res = await authHttp.get<Result<CageShelfDetail>>(`/cage-cell-index/local-grid/by-shelve/${shelveId}`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载本地数据失败");
  return res.data.data!;
}

/** 全局反查：根据 animalCageId 定位笼位 */
export async function lookupAnimalCageId(animalCageId: string): Promise<CageCellLookupResult> {
  const res = await authHttp.get<Result<CageCellLookupResult>>("/cage-cell-index/lookup", {
    params: { animalCageId },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "未找到");
  return res.data.data!;
}

export async function updateCellAnimalCageId(
  shelfIndexId: number,
  positionX: number,
  positionY: number,
  animalCageId: string | null
): Promise<boolean> {
  const res = await authHttp.put<Result<{ ok: boolean }>>("/cage-cell-index/cell", {
    shelfIndexId,
    positionX,
    positionY,
    animalCageId,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "更新笼位ID失败");
  return res.data.data?.ok ?? false;
}

// ── 本地标注（实验记录 + 照片）─

export async function fetchLocalAnnotate(animalCageId: number | string): Promise<{ experimentDesc: string; imagesJson: string; statusPhotos?: string }> {
  const res = await authHttp.get<Result<{ experimentDesc: string; imagesJson: string; statusPhotos?: string }>>(`/local/annotate/${animalCageId}`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载标注失败");
  return res.data.data ?? { experimentDesc: "", imagesJson: "[]" };
}

export async function localAnnotate(animalCageId: number | string, experimentDesc?: string, imagesJson?: string, statusPhotos?: string) {
  const res = await authHttp.post<Result<any>>("/local/annotate", { animalCageId, experimentDesc, imagesJson, statusPhotos });
  if (!res.data?.success) throw new Error(res.data?.message || "保存标注失败");
}

// ═══════════════════════════════════════════
// 笼位申请系统 (/api/student/cage-claims + /api/admin/cage-claims)
// ═══════════════════════════════════════════

/** 池中可用笼位 */
export interface PoolCell {
  animalCageId: string;
  positionX: number;
  positionY: number;
  shelveId: string;
  cageTypeCode: number;
  projectPiName: string;
  aupNumber: string;
  departmentName: string;
  projectName: string;
}

/** 申请记录 */
export interface CageClaimItem {
  id: number;
  animalCageId: string;
  claimStatus: string;
  claimantId: string;
  claimantName: string;
  claimantDept: string;
  aupId: number | string | null;
  assignerId: string | null;
  assignerName: string | null;
  confirmRequired: boolean;
  retryCount: number;
  rejectedAt: string | null;
  confirmedAt: string | null;
  releasedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  campusName?: string;
  areaName?: string;
  floorName?: string;
  roomName?: string;
  shelveName?: string;
  shelveId?: string;
  positionLabel?: string;
  aupNumber?: string;
  latestRejectReason?: string | null;
  positionX?: number;
  positionY?: number;
}

/** 审批记录 */
export interface ApprovalRecordItem {
  id: number;
  targetType: string;
  targetId: number;
  approverId: string;
  approverName: string;
  approverRole: string;
  decision: string;
  rejectReason: string | null;
  createdAt: string;
}

// ── 学生端 ──

/** 查看池中可用笼位 */
export async function fetchPoolCells(shelfIndexId: number): Promise<PoolCell[]> {
  const res = await authHttp.get<Result<PoolCell[]>>("/student/cage-claims/pool", {
    params: { shelfIndexId },
  });
  if (!res.data?.success) throw new Error(res.data?.message || "加载池数据失败");
  return res.data.data ?? [];
}

/** 申请笼位 */
export async function claimCage(animalCageId: string, shelfIndexId: number): Promise<{ id: number; animalCageId: string; status: string; needApproval: boolean }> {
  const res = await authHttp.post<Result<{ id: number; animalCageId: string; status: string; needApproval: boolean }>>(
    "/student/cage-claims", { animalCageId, shelfIndexId },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "申请失败");
  return res.data.data!;
}

/** 取消申请 */
export async function cancelClaim(id: number): Promise<void> {
  const res = await authHttp.post<Result<any>>(`/student/cage-claims/${id}/cancel`);
  if (!res.data?.success) throw new Error(res.data?.message || "取消失败");
}

/** 到场确认 */
export async function confirmClaim(id: number | string): Promise<void> {
  const res = await authHttp.post<Result<any>>(`/student/cage-claims/${id}/confirm`);
  if (!res.data?.success) throw new Error(res.data?.message || "确认失败");
}

/** 管理端代学生确认到位（管理员/饲养组长） */
export async function adminConfirmClaim(id: number | string): Promise<void> {
  const res = await authHttp.post<Result<any>>(`/admin/cage-claims/${id}/confirm`);
  if (!res.data?.success) throw new Error(res.data?.message || "确认失败");
}

/** 管理端批量通过待审批认领，返回 per-id 结果 */
export async function batchApproveClaims(ids: number[]): Promise<Array<{ id: number; ok: boolean; status?: string; error?: string }>> {
  const res = await authHttp.post<Result<Array<{ id: number; ok: boolean; status?: string; error?: string }>>>(
    "/admin/cage-claims/batch-approve", { ids },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "批量审批失败");
  return res.data.data ?? [];
}

/** 管理端归档一个占用中的笼位（回空笼盒 type2） */
export async function archiveCage(animalCageId: string | number, reason?: string): Promise<void> {
  const res = await authHttp.post<Result<any>>("/admin/cage-info/occupancy/archive", { animalCageId, reason });
  if (!res.data?.success) throw new Error(res.data?.message || "归档失败");
}

/** 手动修正历史 confirmed 笼位（2→3 + 写占用者），返回修正条数 */
export async function reconcileCageOccupancy(): Promise<number> {
  const res = await authHttp.post<Result<{ fixed: number }>>("/admin/cage-claims/reconcile-occupancy");
  if (!res.data?.success) throw new Error(res.data?.message || "修正失败");
  return res.data.data?.fixed ?? 0;
}

/** 释放笼位 */
export async function releaseClaim(id: number, reason?: string): Promise<void> {
  const res = await authHttp.post<Result<any>>(`/student/cage-claims/${id}/release`, { reason });
  if (!res.data?.success) throw new Error(res.data?.message || "释放失败");
}

/** 转移归属 */
export async function transferClaim(id: number, toStudentUserId: string, reason?: string): Promise<void> {
  const res = await authHttp.post<Result<any>>(`/student/cage-claims/${id}/transfer`, { toStudentUserId, reason });
  if (!res.data?.success) throw new Error(res.data?.message || "转移失败");
}

/** 我的申请列表 */
export async function fetchMyClaims(status?: string): Promise<CageClaimItem[]> {
  const res = await authHttp.get<Result<CageClaimItem[]>>("/student/cage-claims/my", {
    params: status ? { status } : undefined,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "加载申请列表失败");
  return res.data.data ?? [];
}

// ── 管理端 ──

/** 待审批列表 */
export async function fetchPendingClaims(
  status?: string, keyword?: string, page = 1, pageSize = 20,
): Promise<{ list: CageClaimItem[]; total: number; page: number; pageSize: number }> {
  const res = await authHttp.get<Result<{ list: CageClaimItem[]; total: number; page: number; pageSize: number }>>(
    "/admin/cage-claims/pending",
    { params: { status, keyword, page, pageSize } },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载待审批列表失败");
  return res.data.data ?? { list: [], total: 0, page: 1, pageSize: 20 };
}

/** 审批 */
export async function approveClaim(id: number, decision: "approved" | "rejected", reason?: string): Promise<void> {
  const res = await authHttp.post<Result<any>>(`/admin/cage-claims/${id}/approve`, { decision, reason });
  if (!res.data?.success) throw new Error(res.data?.message || "审批失败");
}

/** 手动分配 */
export async function assignClaim(animalCageId: string, shelfIndexId: number, studentUserId: string, aupId?: number): Promise<void> {
  const res = await authHttp.post<Result<any>>("/admin/cage-claims/assign", {
    animalCageId, shelfIndexId, studentUserId, aupId,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "分配失败");
}

/** 审批历史 */
export async function fetchClaimHistory(id: number): Promise<ApprovalRecordItem[]> {
  const res = await authHttp.get<Result<ApprovalRecordItem[]>>(`/admin/cage-claims/${id}/history`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载审批历史失败");
  return res.data.data ?? [];
}

// ── 笼位占用记录 ──

export interface CageOccupancyRecord {
  id: number; eventType: string; occupantId: number | null; occupantName?: string | null;
  fromAnimalCageId?: string | null; toAnimalCageId?: string | null; operatorName?: string | null;
  reason?: string | null; createdAt?: string | null;
}

export async function fetchCageOccupancyRecords(view: "cage" | "person", id: number | string): Promise<CageOccupancyRecord[]> {
  const params = view === "cage" ? { view, cageId: id } : { view, occupantId: id };
  const res = await authHttp.get<Result<CageOccupancyRecord[]>>("/admin/cage-info/occupancy/records", { params });
  if (!res.data?.success) throw new Error(res.data?.message || "加载记录失败");
  return res.data.data ?? [];
}

export async function searchPersonnelByKeyword(keyword: string): Promise<Array<{ id: number; name: string }>> {
  const res = await authHttp.get<Result<{ list?: Array<{ id: number; name: string }> }>>("/personnel", { params: { keyword, pageSize: 10 } });
  if (!res.data?.success) throw new Error(res.data?.message || "搜索人员失败");
  return (res.data.data?.list ?? []).map((p) => ({ id: p.id, name: p.name ?? String(p.id) }));
}
