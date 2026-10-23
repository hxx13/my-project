import { authHttp } from "@/api/core/authHttp";

// ── 类型 ──

/** 墙上的物理屏。双屏墙就是两块，各占 50% 宽；窗口坐标是**屏内**百分比 */
export interface WallScreen {
  screenId: string;
  name?: string;
  decodeId?: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TvWall {
  tvWallId: string;
  tvWallName: string;
  orgCode?: string;
  status?: string;
  version?: string;
  /** 墙的物理屏幕布局 XML（画宫格底图用） */
  data?: string;
  /** 从布局 XML 解析出的物理屏列表 */
  screens?: WallScreen[];
}

export interface TvWallTaskItem {
  tvWallId: string;
  taskId: string;
  taskName: string;
  taskDesc?: string;
  /** 预设详情才有：TVWallScheme XML */
  data?: string;
  /** 预设详情才有：按屏还原出的宫格与通道，用于「选中即预览」 */
  screens?: TaskScreen[];
}

/** /current 返回：每个墙当前在播的任务 */
export interface TvWallCurrentTask {
  tvWallId: string;
  taskId?: string;
  taskName?: string;
  planId?: string;
  planName?: string;
  dataType?: string;
}

/** 本地缓存的视频通道 */
export interface VideoChannel {
  /** 缓存行主键；给通道归到分类树节点时要用 */
  id: number;
  channelCode: string;
  channelName: string;
  deviceCode?: string;
  ownerCode?: string;
  unitType?: number;
  isOnline?: number;
  /** 所属监控分类树节点；null = 未分类（与门禁的备注分类无关） */
  videoCategoryId?: number | null;
  /** 设备跳转地址（摄像机自己的管理页），没配则空 */
  linkUrl?: string | null;
}

/** 监控分类树节点（扁平返回，前端自己按 parentId 拼树） */
export interface VideoCategoryNode {
  id: number;
  parentId: number;
  name: string;
  sortOrder?: number;
  /** 直挂在本节点下的通道数（不含子节点） */
  channelCount?: number;
}

/** 一个窗口要放的通道；带矩形时按矩形摆（自定义切分），不带就按宫格均分 */
export interface WallWindowSpec {
  index: number;
  channelCode: string;
  channelName?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

/** 一块屏要下发的内容（整墙一起推时，每块屏一条） */
export interface TaskScreen {
  screenId: string;
  splitNum: number;
  windows: WallWindowSpec[];
}

// ── 查询 ──

export async function fetchTvWalls(): Promise<TvWall[]> {
  const res = await authHttp.get<{ data: TvWall[] }>("/v1/dahua/tvwall/list");
  return res.data.data ?? [];
}

export async function fetchTvWallDetail(tvWallId: string): Promise<TvWall> {
  const res = await authHttp.get<{ data: TvWall }>("/v1/dahua/tvwall/detail", { params: { tvWallId } });
  return res.data.data;
}

export async function fetchCurrentTasks(): Promise<TvWallCurrentTask[]> {
  const res = await authHttp.get<{ data: TvWallCurrentTask[] }>("/v1/dahua/tvwall/current");
  return res.data.data ?? [];
}

export async function fetchVideoChannels(): Promise<VideoChannel[]> {
  const res = await authHttp.get<{ data: VideoChannel[] }>("/v1/dahua/tvwall/channels");
  return res.data.data ?? [];
}

/** 重建监控分类树：按通道名重新分「楼层 → 相机组」 */
export async function rebuildVideoCategories(): Promise<{ nodes?: number; channels?: number }> {
  const res = await authHttp.post<{ data: { nodes?: number; channels?: number } }>(
    "/v1/dahua/tvwall/categories/rebuild",
  );
  return res.data.data ?? {};
}

export async function fetchTvWallTasks(tvWallId: string): Promise<TvWallTaskItem[]> {
  const res = await authHttp.get<{ data: TvWallTaskItem[] }>("/v1/dahua/tvwall/tasks", {
    params: { tvWallId },
  });
  return res.data.data ?? [];
}

export async function fetchTvWallTask(tvWallId: string, taskId: string): Promise<TvWallTaskItem> {
  const res = await authHttp.get<{ data: TvWallTaskItem }>("/v1/dahua/tvwall/task", {
    params: { tvWallId, taskId },
  });
  return res.data.data;
}

// ── 操作 ──

/** 应用已有预设（立即上墙） */
export async function applyTvWallTask(tvWallId: string, taskId: string): Promise<void> {
  await authHttp.post("/v1/dahua/tvwall/apply", { tvWallId, taskId });
}

/** 按屏上墙；未提到的屏会被清空 */
export async function operateTvWallLayout(payload: {
  tvWallId: string;
  screens: TaskScreen[];
}): Promise<void> {
  await authHttp.post("/v1/dahua/tvwall/layout", payload);
}

export async function saveTvWallPreset(payload: {
  tvWallId: string;
  /** 传空为新建 */
  taskId?: string | null;
  taskName: string;
  screens: TaskScreen[];
}): Promise<void> {
  await authHttp.post("/v1/dahua/tvwall/preset/save", payload);
}

/** 重命名预设：保留方案内容，只换名字（后端按同一 taskId 重新保存） */
export async function renameTvWallPreset(tvWallId: string, taskId: string, taskName: string): Promise<void> {
  await authHttp.post("/v1/dahua/tvwall/preset/rename", { tvWallId, taskId, taskName });
}

export async function deleteTvWallPreset(tvWallId: string, taskId: string): Promise<void> {
  await authHttp.post("/v1/dahua/tvwall/preset/delete", { tvWallId, taskId });
}

// ── 监控分类树 ──

export async function fetchVideoCategories(): Promise<VideoCategoryNode[]> {
  const res = await authHttp.get<{ data: VideoCategoryNode[] }>("/v1/dahua/tvwall/categories");
  return res.data.data ?? [];
}

export async function createVideoCategory(payload: {
  parentId?: number | null;
  name: string;
}): Promise<VideoCategoryNode> {
  const res = await authHttp.post<{ data: VideoCategoryNode }>("/v1/dahua/tvwall/categories", payload);
  return res.data.data;
}

export async function renameVideoCategory(id: number, name: string): Promise<void> {
  await authHttp.put(`/v1/dahua/tvwall/categories/${id}`, { name });
}

export async function deleteVideoCategory(id: number): Promise<void> {
  await authHttp.delete(`/v1/dahua/tvwall/categories/${id}`);
}

/** categoryId 传 null = 移出到未分类 */
export async function assignChannelCategory(id: number, categoryId: number | null): Promise<void> {
  await authHttp.patch(`/v1/dahua/tvwall/channels/${id}/category`, { categoryId });
}

/** 空串 = 清除跳转地址；只填 IP 时后端会自动补 http:// */
export async function setChannelLink(id: number, linkUrl: string): Promise<void> {
  await authHttp.patch(`/v1/dahua/tvwall/channels/${id}/link`, { linkUrl });
}

// ── 参观顺序（预设 id 有序，跨端共用一份） ──

/** 这面墙的参观顺序：按顺序排列的预设 taskId */
export async function fetchTvWallTour(tvWallId: string): Promise<string[]> {
  const res = await authHttp.get<{ data: string[] }>("/v1/dahua/tvwall/tour", { params: { tvWallId } });
  return res.data.data ?? [];
}

/** 整队替换参观顺序（数组顺序即切换顺序） */
export async function saveTvWallTour(tvWallId: string, taskIds: string[]): Promise<string[]> {
  const res = await authHttp.put<{ data: string[] }>("/v1/dahua/tvwall/tour", { tvWallId, taskIds });
  return res.data.data ?? [];
}
