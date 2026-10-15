import { adminHttp } from "@/api/core/adminHttp";

/**
 * 安维迪（云组态）饮水流量监测。
 * 后端前缀 /api/admin/avidity，本文件路径均为相对写法。角色要求：ADMIN+。
 *
 * 数据是后端定时从厂平台拉回落库的，本页只读我们的库 —— 对方站点抖动不会把页面拖白。
 */

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

// ---------------------------------------------------------------- 类型

export interface AvidityChannel {
  id: number;
  channelId: number;
  channelName: string;
  sortIndex: number;
  virtualDeviceId: number;
  deviceName: string | null;
  /** 厂平台组态画面 ID，对应后端 resources/avidity/<ID>.json 那份平面图 */
  configureViewId: number | null;
  syncedAt: string;
}

export interface AvidityAlarmCurrent {
  id: number;
  alarmId: string;
  virtualDeviceId: number;
  deviceName: string | null;
  alarmName: string | null;
  message: string | null;
  state: number | null;
  alarmLevel: number | null;
  alarmGroupName: string | null;
  triggeredTime: string | null;
  syncedAt: string;
}

export interface AvidityAlarmStat {
  id: number;
  statDate: string;
  virtualDeviceId: number;
  deviceName: string | null;
  alarmName: string;
  alarmContent: string | null;
  alarmCount: number;
  syncedAt: string;
}

export interface FloorPlanPoint {
  /** 点位号（同一条笼架内唯一，跨笼架会重复） */
  no: number;
  /** 格左上角坐标 —— 取自原图指示灯元件的精确 location，不要自己排版 */
  x: number;
  y: number;
  /** 格的宽高 —— 原图是 14×14（少数 15/17 是因为数字更长） */
  w: number;
  h: number;
  /**
   * 画面图元上绑定的变量名。**实时状态、实时长连接都按它索引**，别改成报警名。
   */
  var: string;
  /**
   * 厂平台报警表里的名字，**只有两者不同名时才出现**（B1 的 E11C-B106 少了 `RM_` 前缀）。
   * 「今日报过」的次数要按它查；没有就说明和 var 一样。
   */
  alarm?: string;
}

export interface FloorPlanRack {
  /** 内间标识，如 205-A。**这不是笼架，是套间里的内间** ——
   *  205 是该套间的前室，205-A/205-B 是要从前室进去才能到的小房间，
   *  厂平台告警名 RM205_A_SLV_13 就是「205 套间 · A 内间 · 13 号点位」。
   *  （B1 那套画面结构不同：E11A 是区、E11A-B105 是笼架盒，字段沿用同一形状。） */
  rack: string;
  /** 画布上显示的短名；名称过长时省掉了与区名重复的前缀（E11A-B105 → B105） */
  display?: string;
  /** [x, y, w, h] 内间框 —— 由原图房间内部的分隔线围出来，闭合矩形 */
  box?: [number, number, number, number] | null;
  label: [number, number];
  points: FloorPlanPoint[];
}

export interface FloorPlanRoom {
  /** 前室号（2F 是 201..217）或分区名（B1 是 E11A/B/C）。2F 里它是「前室」，
   *  其下的 racks[] 是同套间里从前室进入的内间。 */
  room: string;
  label: [number, number] | null;
  /** [x, y, w, h] 房间矩形 —— 原图轮廓线围出来的，统一大小、成列对齐 */
  box: [number, number, number, number] | null;
  racks: FloorPlanRack[];
}

/** 一段几何：SVG path 的 d，外加它自己的变换矩阵 [a,b,c,d,e,f]。原样用，几何零失真。 */
export interface FloorPlanShape {
  d: string;
  m: [number, number, number, number, number, number];
}

/** 管道：main=true 是房间外那根主管，false 是进房间的支管。
 *  rev=true 表示水流方向与路径绘制方向相反（取自原图每根管道的 flowDirection）。 */
export interface FloorPlanPipe extends FloorPlanShape {
  main: boolean;
  rev?: boolean;
}

export interface FloorPlan {
  size: [number, number];
  /** [x, y, w, h] —— 按内容实际范围裁过，不是原图的 1280x720（那样四周全是空白，图会偏小偏心） */
  viewBox: [number, number, number, number];
  rooms: FloorPlanRoom[];
  regulators: { name: string; x: number; y: number }[];
  /** 房间/区域轮廓线（原图量下来的真实线段，所以各房间天然对齐） */
  outlines: FloorPlanShape[];
  /** 管道网络：主管 → 分支 → 进房间 */
  pipes: FloorPlanPipe[];
}

export interface AvidityAlarmRule {
  id: number;
  ruleCode: "NEW_ALARM" | "DAILY_COUNT" | string;
  ruleName: string;
  enabled: boolean;
  thresholdCount: number | null;
  updatedAt: string;
}

export interface AvidityNotifyLogRow {
  id: number;
  notifyKey: string;
  ruleCode: string;
  deviceName: string | null;
  alarmName: string | null;
  message: string | null;
  notifiedAt: string;
}

export interface AviditySyncSummary {
  channels: number;
  alarmStats: number;
  currentAlarms: number;
  message: string;
}

// ---------------------------------------------------------------- 接口

export async function listChannels(): Promise<AvidityChannel[]> {
  const res = await adminHttp.get<Result<AvidityChannel[]>>("/avidity/channels");
  return (res.data?.data as AvidityChannel[]) ?? [];
}

export async function getFloorPlan(channelId: number): Promise<FloorPlan> {
  const res = await adminHttp.get<Result<FloorPlan>>("/avidity/floorplan", { params: { channelId } });
  return res.data?.data as FloorPlan;
}

/** 我们自己记的一条报警事件：这个点位这一轮从几点开始报、几点恢复。 */
export interface AvidityAlarmEventNode {
  id: number;
  /** 点位标识（图元绑定的变量名） */
  alarmName: string;
  pointNo: number | null;
  virtualDeviceId: number;
  startedAt: string | null;
  /** 为空 = 还在报 */
  endedAt: string | null;
  ongoing: boolean;
  durationSec?: number;
}

export interface AvidityAlarmRackNode {
  /** 内间名，如 E11A-B106 */
  rack: string;
  count: number;
  items: AvidityAlarmEventNode[];
}

export interface AvidityAlarmRoomNode {
  /** 分区 / 前室号，如 E11A、201 */
  room: string;
  count: number;
  racks: AvidityAlarmRackNode[];
}

/** 按平面图房间归好档的事件树：分区 → 内间 → 事件。 */
export interface AvidityAlarmFolderTree {
  since?: string;
  count: number;
  rooms: AvidityAlarmRoomNode[];
}

/** 此刻正在报警的点位（按房间归档）。 */
export async function getOpenAlarms(channelId?: number): Promise<AvidityAlarmFolderTree> {
  const res = await adminHttp.get<Result<AvidityAlarmFolderTree>>("/avidity/alarm-current", {
    params: { channelId },
  });
  return (res.data?.data as AvidityAlarmFolderTree) ?? { count: 0, rooms: [] };
}

/** 报警历史（我们自己记的起止时间）。alarmName 给了就只看那一个点位。 */
export async function getAlarmEvents(
  days = 7,
  channelId?: number,
  alarmName?: string
): Promise<AvidityAlarmFolderTree> {
  const res = await adminHttp.get<Result<AvidityAlarmFolderTree>>("/avidity/alarm-events", {
    params: { days, channelId, alarmName },
  });
  return (res.data?.data as AvidityAlarmFolderTree) ?? { count: 0, rooms: [] };
}

/** 点位实时状态（值非 0 = 报警中）。后端挂了一条到厂平台的长连接，这是它缓存的快照。 */
export interface AvidityLiveStates {
  connected: boolean;
  /** 点位标识（图元绑定的变量名）→ 状态 */
  states: Record<string, number>;
  /** 设备 ID（字符串）→ 该设备正在报警的点位数，顶栏角标用 */
  counts: Record<string, number>;
  error?: string;
}

export async function getLiveStates(channelId?: number): Promise<AvidityLiveStates> {
  const res = await adminHttp.get<Result<AvidityLiveStates>>("/avidity/live-states", {
    params: { channelId },
  });
  return (res.data?.data as AvidityLiveStates) ?? { connected: false, states: {}, counts: {} };
}

/** date 省略即今天（后端按北京时区取）。 */
export async function listAlarmStats(date?: string, channelId?: number): Promise<AvidityAlarmStat[]> {
  const res = await adminHttp.get<Result<AvidityAlarmStat[]>>("/avidity/alarm-stats", {
    params: { date, channelId },
  });
  return (res.data?.data as AvidityAlarmStat[]) ?? [];
}

export async function listAlarmRules(): Promise<AvidityAlarmRule[]> {
  const res = await adminHttp.get<Result<AvidityAlarmRule[]>>("/avidity/alarm-rules");
  return (res.data?.data as AvidityAlarmRule[]) ?? [];
}

export async function updateAlarmRule(
  ruleCode: string,
  payload: { enabled: boolean; thresholdCount?: number | null }
): Promise<void> {
  await adminHttp.put(`/avidity/alarm-rules/${ruleCode}`, payload);
}

export async function listNotifyLog(limit = 50): Promise<AvidityNotifyLogRow[]> {
  const res = await adminHttp.get<Result<AvidityNotifyLogRow[]>>("/avidity/notify-log", { params: { limit } });
  return (res.data?.data as AvidityNotifyLogRow[]) ?? [];
}

export interface LayoutPointPayload {
  room: string;
  rack: string;
  no: number;
  x: number;
  y: number;
}

/** 保存手动摆位（拖拽后点保存）。 */
export async function saveLayoutPoints(channelId: number, points: LayoutPointPayload[]): Promise<number> {
  const res = await adminHttp.put<Result<number>>("/avidity/layout-points", points, { params: { channelId } });
  return res.data?.data ?? 0;
}

/** 恢复默认版式（清掉该通道的手动摆位）。 */
export async function resetLayoutPoints(channelId: number): Promise<number> {
  const res = await adminHttp.delete<Result<number>>("/avidity/layout-points", { params: { channelId } });
  return res.data?.data ?? 0;
}

export interface AlarmHistoryRow {
  id: number;
  alarmId: string;
  virtualDeviceId: number;
  deviceName: string | null;
  alarmName: string | null;
  message: string | null;
  state: number | null;
  triggeredTime: string;
}

export interface AlarmHistory {
  alarmName: string;
  items: AlarmHistoryRow[];
  byDay: { d: string; n: number }[];
}

/** 某点位（平面图上的点位标识）的报警历史。 */
export async function listAlarmHistory(alarmName: string, days = 30): Promise<AlarmHistory> {
  const res = await adminHttp.get<Result<AlarmHistory>>("/avidity/alarm-history", {
    params: { alarmName, days },
  });
  return res.data?.data as AlarmHistory;
}

/** 手动拉一轮厂平台数据。 */
export async function syncNow(): Promise<AviditySyncSummary> {
  const res = await adminHttp.post<Result<AviditySyncSummary>>("/avidity/sync");
  return res.data?.data as AviditySyncSummary;
}

/** 手动跑一轮报警判定（不拉数，只按库里现有数据判该不该推）。 */
export async function evaluateAlarms(): Promise<{ newAlarmPushed: number; dailyCountPushed: number; message: string }> {
  const res = await adminHttp.post<Result<{ newAlarmPushed: number; dailyCountPushed: number; message: string }>>(
    "/avidity/alarm-evaluate"
  );
  return res.data?.data;
}
