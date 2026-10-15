import { adminHttp } from "@/api/core/adminHttp";

/**
 * 网络广播（DSPPA 平台接入）。
 * 后端前缀 /api/admin/broadcast，本文件路径均为相对写法。
 * 角色要求：ADMIN+（后台管理接口）。
 */

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

// ---------------------------------------------------------------- 类型

export interface BroadcastStatus {
  connected: boolean;
  loggedIn: boolean;
  sessionId: string | null;
  wsUrl: string;
  httpBase: string;
  username: string;
  /** 调度基准时间（本机墙钟） */
  scheduleTime: string;
  /** 平台钟 - 墙钟，毫秒；负数表示平台慢。仅诊断用 */
  platformClockOffsetMs: number;
  lastError: string | null;
  lastSuccessAt: string | null;
  lastInboundAt: string | null;
  consecutiveFailures: number;
  pendingRequests: number;
}

export interface ZoneView {
  id: number | null;
  name: string;
  ip: string;
  mac: string;
  volume: number | null;
  playStatus: number | null;
  playStatusText: string;
  currentSong: string;
  playing: boolean;
}

export interface ZoneListResult {
  connected: boolean;
  loggedIn: boolean;
  zones: ZoneView[];
}

export interface SongView {
  pathName: string;
  fileName: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
}

export interface SongListView {
  id: string;
  name: string;
  songCount: number;
  songs: SongView[];
}

export interface BroadcastPlan {
  id: number;
  planName: string;
  enabled: boolean;
  /** 0 按周循环 / 1 按日期区间 */
  timeMode: number;
  weekDays: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string;
  volume: number | null;
  zoneMacs: string | null;
  songPaths: string | null;
  songListId: string | null;
  /** 循环播放：true 窗口内列表循环 / false 播完即停 */
  loopPlay: boolean;
  /** IDLE 未运行 / RUNNING 执行中 / PAUSED 已人工暂停 */
  runState: string;
  runStartedAt: string | null;
  lastFiredDate: string | null;
  lastFiredAt: string | null;
  lastStopDate: string | null;
  lastResult: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlanUpsert {
  planName: string;
  enabled: boolean;
  timeMode: number;
  weekDays: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string;
  volume: number | null;
  zoneMacs: string[];
  songPaths: string[];
  songListId: string | null;
  loopPlay: boolean;
}

export interface BroadcastPlayLog {
  id: number;
  planId: number | null;
  planName: string | null;
  /** SCHEDULE 定时 / CATCHUP 补播 / MANUAL 手动 */
  source: string;
  /** PLAY / STOP */
  action: string;
  firedAt: string;
  success: boolean;
  message: string | null;
  operator: string | null;
}

export interface UploadOutcome {
  fileName: string;
  size: number;
  path?: string;
  success: boolean;
  message?: string;
}

// ---------------------------------------------------------------- 连接

export async function getStatus(): Promise<BroadcastStatus> {
  const res = await adminHttp.get<Result<BroadcastStatus>>("/broadcast/status");
  return res.data?.data as BroadcastStatus;
}

export async function reconnect(): Promise<BroadcastStatus> {
  const res = await adminHttp.post<Result<BroadcastStatus>>("/broadcast/reconnect");
  return res.data?.data as BroadcastStatus;
}

export async function relogin(): Promise<BroadcastStatus> {
  const res = await adminHttp.post<Result<BroadcastStatus>>("/broadcast/relogin");
  return res.data?.data as BroadcastStatus;
}

// ---------------------------------------------------------------- 分区与播放

export async function listZones(): Promise<ZoneListResult> {
  const res = await adminHttp.get<Result<ZoneListResult>>("/broadcast/zones");
  return (res.data?.data as ZoneListResult) ?? { connected: false, loggedIn: false, zones: [] };
}

export async function setVolume(macs: string[], volume: number): Promise<ZoneView[]> {
  const res = await adminHttp.put<Result<ZoneView[]>>("/broadcast/zones/volume", { macs, volume });
  return res.data?.data ?? [];
}

export async function play(macs: string[], songPath: string, volume?: number | null): Promise<void> {
  await adminHttp.post<Result<null>>("/broadcast/play", { macs, songPath, volume: volume ?? null });
}

export async function stop(macs: string[]): Promise<void> {
  await adminHttp.post<Result<null>>("/broadcast/stop", { macs });
}

// ---------------------------------------------------------------- 分区级独立控制
//
// 定时方案只是「批量启动器」：到点把若干分区带起来之后，每一路就是独立的播放单元。
// 下面这几个接口**只作用于指定的那几路**，不会波及其它分区。

export async function pauseZones(macs: string[]): Promise<void> {
  await adminHttp.post<Result<null>>("/broadcast/zones/pause", { macs });
}

/**
 * 恢复这几路。`songPath` 传当前选中的曲目最稳妥 ——
 * 停止时走的是「置空闲」，平台会把该路的曲名清掉，不带曲目就可能无曲可放。
 */
export async function resumeZones(macs: string[], songPath?: string | null): Promise<void> {
  await adminHttp.post<Result<null>>("/broadcast/zones/resume", { macs, songPath: songPath ?? null });
}

/** 正在执行的方案与逐分区实时状态。 */
export async function getActive(): Promise<ActiveView> {
  const res = await adminHttp.get<Result<ActiveView>>("/broadcast/active");
  return (res.data?.data as ActiveView) ?? { plans: [] };
}

export interface ActiveZone {
  mac: string;
  name: string;
  /** 被人工停过：方案的循环/兜底不会再把它带起来 */
  paused: boolean;
  playing: boolean;
  playStatus: number;
  currentSong: string;
}

export interface ActivePlan {
  id: number;
  planName: string;
  runState: string;
  loopPlay: boolean;
  startTime: string;
  endTime: string;
  /** 本轮开始的时刻；没跑过为 null */
  runStartedAt: string | null;
  zoneCount: number;
  playingCount: number;
  zones: ActiveZone[];
}

export interface ActiveView {
  plans: ActivePlan[];
}

// ---------------------------------------------------------------- 曲库

export async function listSongLists(): Promise<SongListView[]> {
  const res = await adminHttp.get<Result<SongListView[]>>("/broadcast/song-lists");
  return res.data?.data ?? [];
}

/** 上传音频到指定曲库列表。Content-Type 交给浏览器加（手写会丢 boundary）。 */
export async function uploadSongs(listId: string, files: File[]): Promise<UploadOutcome[]> {
  const form = new FormData();
  form.append("listId", listId);
  files.forEach((f) => form.append("files", f));
  const res = await adminHttp.post<Result<UploadOutcome[]>>("/broadcast/songs/upload", form);
  return res.data?.data ?? [];
}

// ---------------------------------------------------------------- 曲库列表管理
//
// 后端一律**不删音频文件**（只摘列表条目）。平台上那个能连文件一起删的开关，
// 服务端固定传 0 —— 删文件不经本系统。

export async function createSongList(listName: string): Promise<string> {
  const res = await adminHttp.post<Result<string>>("/broadcast/song-lists", { listName });
  return (res.data?.data as string) ?? "";
}

export async function renameSongList(listId: string, listName: string): Promise<void> {
  await adminHttp.put<Result<null>>(`/broadcast/song-lists/${listId}`, { listName });
}

export async function deleteSongList(listId: string): Promise<void> {
  await adminHttp.delete<Result<null>>(`/broadcast/song-lists/${listId}`);
}

export async function addSongToList(listId: string, songPath: string): Promise<void> {
  await adminHttp.post<Result<null>>(`/broadcast/song-lists/${listId}/songs`, null, {
    params: { path: songPath },
  });
}

export async function removeSongFromList(listId: string, songPath: string): Promise<void> {
  await adminHttp.delete<Result<null>>(`/broadcast/song-lists/${listId}/songs`, {
    params: { path: songPath },
  });
}

export async function moveSongToList(fromListId: string, toListId: string, songPath: string): Promise<void> {
  await adminHttp.post<Result<null>>("/broadcast/songs/move", { fromListId, toListId, songPath });
}

// ---------------------------------------------------------------- 定时方案

export async function listPlans(): Promise<BroadcastPlan[]> {
  const res = await adminHttp.get<Result<BroadcastPlan[]>>("/broadcast/plans");
  return res.data?.data ?? [];
}

export async function createPlan(body: PlanUpsert): Promise<BroadcastPlan> {
  const res = await adminHttp.post<Result<BroadcastPlan>>("/broadcast/plans", body);
  return res.data?.data as BroadcastPlan;
}

export async function updatePlan(id: number, body: PlanUpsert): Promise<BroadcastPlan> {
  const res = await adminHttp.put<Result<BroadcastPlan>>(`/broadcast/plans/${id}`, body);
  return res.data?.data as BroadcastPlan;
}

export async function deletePlan(id: number): Promise<void> {
  await adminHttp.delete<Result<null>>(`/broadcast/plans/${id}`);
}

export async function togglePlan(id: number, enabled: boolean): Promise<BroadcastPlan> {
  const res = await adminHttp.post<Result<BroadcastPlan>>(
    `/broadcast/plans/${id}/toggle`,
    null,
    { params: { enabled } },
  );
  return res.data?.data as BroadcastPlan;
}

/** 立刻试跑一次（等同于到点触发，记成手动）。 */
export async function runPlan(id: number): Promise<void> {
  await adminHttp.post<Result<null>>(`/broadcast/plans/${id}/run`);
}

/** 暂停整个方案：调度器不再自动重发，等人工恢复或窗口自然结束。 */
export async function pausePlan(id: number): Promise<void> {
  await adminHttp.post<Result<null>>(`/broadcast/plans/${id}/pause`);
}

/** 恢复整个方案。 */
export async function resumePlan(id: number): Promise<void> {
  await adminHttp.post<Result<null>>(`/broadcast/plans/${id}/resume`);
}

// ---------------------------------------------------------------- 播放记录

export async function listPlayLogs(planId?: number | null, limit = 100): Promise<BroadcastPlayLog[]> {
  const res = await adminHttp.get<Result<BroadcastPlayLog[]>>("/broadcast/play-logs", {
    params: { planId: planId ?? undefined, limit },
  });
  return res.data?.data ?? [];
}
