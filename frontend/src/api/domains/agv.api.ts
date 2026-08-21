import { authHttp } from "@/api/core/authHttp";

// ---- types ----

export interface AgvRobotStatus {
  ret_code: number; current_ip: string; vehicle_id: string;
  battery_level: number; charging: boolean; blocked: boolean; emergency: boolean;
  task_status: number;
  x: number; y: number; angle: number; confidence: number;
  current_map: string; current_station: string;
  odo: number; reloc_status: number; loadmap_status: number;
  rssi: number; ssid: string;
  driver_emc: boolean;
  fork_height: number; fork_height_in_place: boolean;
  jack_enable: boolean; jack_state: number; jack_isFull: boolean;
  jack_mode: boolean; jack_error_code: number;
  total_time: number; robot_note: string;
  errors: string[]; fatals: string[]; warnings: string[]; notices: string[];
  DI?: { id: number; source: string; status: boolean; valid: boolean }[];
}

export interface AgvRecentResponse {
  [ip: string]: { x: number; y: number; angle: number; battery: number; charging: number; task_status: number; station: string; map_name: string; recorded_at: string }[];
}

export async function fetchAgvRecent(seconds = 2): Promise<AgvRecentResponse> {
  const res = await authHttp.get<{ data: AgvRecentResponse }>(`/v1/agv/recent?seconds=${seconds}`);
  return res.data.data;
}

export interface AgvCurrentResponse {
  robots: Record<string, { status: AgvRobotStatus; last_polled_at: string }>;
  count: number; server_time: string;
}

export interface AgvConfigEntry {
  jobKey: string; enabled: boolean;
  scheduleStartTime: string; scheduleEndTime: string; weekDays: string;
  pollIntervalSeconds: number; lastRunAt: string | null; lastStatus: string | null;
}

export interface AgvTrajectoryRow {
  id: number; robot_ip: string; ret_code: number;
  x: number; y: number; angle: number;
  battery: number; task_status: number;
  map_name: string; station: string;
  charging: number; blocked: number; emergency: number;
  confidence: number; odo: number; vehicle_id: string;
  reloc_status: number; loadmap_status: number;
  rssi: number; ssid: string; driver_emc: number;
  fork_height: number;
  jack_enable: number; jack_error_code: number;
  jack_isFull: number; jack_mode: number; jack_state: number;
  total_time: number; robot_note: string;
  errors_json: string; fatals_json: string; warnings_json: string;
  notices_json: string; di_json: string;
  create_on_agv: string; recorded_at: string;
}

export interface AgvAnalyticsResult {
  overview: {
    transportTrips: number;
    totalDistanceKm: number;
    totalTimeHr: number;
    avgSpeedMps: number;
    avgBattery: number;
    totalSamples: number;
    utilization: number;
    pathEfficiency?: number;
  };
  timeDistribution: { category: string; totalSec: number; percent: number }[];
  stationRanking: { station: string; stationName?: string; count: number; totalSec: number; avgSec: number }[];
  anomalies: {
    emergencyCount: number;
    blockedCount: number;
    relocCount: number;
    totalAnomalies: number;
  };
  speedHistogram?: { label: string; count: number }[];
}

// ---- API functions ----

export async function fetchAgvCurrent(): Promise<AgvCurrentResponse> {
  const res = await authHttp.get<{ data: AgvCurrentResponse }>("/v1/agv/current");
  return res.data.data;
}

export async function fetchAgvStatus(ip: string): Promise<AgvRobotStatus> {
  const res = await authHttp.get<{ data: AgvRobotStatus }>(`/v1/agv/status/${ip}`);
  return res.data.data;
}

export async function fetchAgvConfig(): Promise<AgvConfigEntry[]> {
  const res = await authHttp.get<{ data: AgvConfigEntry[] }>("/v1/agv/config");
  return res.data.data;
}

export async function updateAgvConfig(jobKey: string, enabled: number): Promise<void> {
  await authHttp.put(`/v1/agv/config/${jobKey}?enabled=${enabled}`);
}

export async function fetchAgvTrajectory(ip: string, from: string, to: string, limit = 2000): Promise<AgvTrajectoryRow[]> {
  const res = await authHttp.get<{ data: AgvTrajectoryRow[] }>(`/v1/agv/trajectory/${ip}?from=${from}&to=${to}&limit=${limit}`);
  return res.data.data;
}

export async function fetchAgvAnalytics(ip: string, from: string, to: string): Promise<AgvAnalyticsResult> {
  const res = await authHttp.get<{ data: AgvAnalyticsResult }>(`/v1/agv/analytics/${ip}?from=${from}&to=${to}`);
  return res.data.data;
}

export interface AgvCoordFrame {
  rotationDeg: number;
  offsetX: number;
  offsetY: number;
  /** 坐标系缩放系数（1=原始尺度）。与 rotation/offset 同为服务端权威值 */
  scale: number;
}

export async function fetchCoordConfigs(): Promise<Record<string, AgvCoordFrame>> {
  const res = await authHttp.get<{ data: Record<string, AgvCoordFrame> }>("/v1/agv/coord-config");
  return res.data.data;
}

/** 更新坐标系配置。scale 省略时服务端保持原值不变，不会被重置为 1 */
export async function updateCoordConfig(ip: string, deg?: number, offsetX?: number, offsetY?: number, scale?: number): Promise<void> {
  const params = new URLSearchParams();
  if (deg !== undefined) params.set("deg", String(deg));
  if (offsetX !== undefined) params.set("offsetX", String(offsetX));
  if (offsetY !== undefined) params.set("offsetY", String(offsetY));
  if (scale !== undefined) params.set("scale", String(scale));
  await authHttp.put(`/v1/agv/coord-config/${ip}?${params.toString()}`);
}

/** 服务端归档的坐标系布局预设（与实时 coord-config 分离） */
export interface AgvCoordPreset {
  exists: boolean;
  savedAt: number | null;
  configs: Record<string, AgvCoordFrame>;
}

export async function fetchCoordPreset(): Promise<AgvCoordPreset> {
  const res = await authHttp.get<{ data: AgvCoordPreset }>("/v1/agv/coord-config/preset");
  const data = res.data.data;
  return {
    exists: !!data?.exists,
    savedAt: data?.savedAt ?? null,
    configs: data?.configs ?? {},
  };
}

/** 将当前布局归档为服务端预设（可传 UI 快照；省略则服务端从实时表快照） */
export async function saveCoordPreset(
  configs?: Record<string, Pick<AgvCoordFrame, "rotationDeg" | "offsetX" | "offsetY" | "scale">>,
): Promise<AgvCoordPreset> {
  const res = await authHttp.put<{ data: AgvCoordPreset }>(
    "/v1/agv/coord-config/preset",
    configs ? { configs } : {},
  );
  const data = res.data.data;
  return {
    exists: !!data?.exists,
    savedAt: data?.savedAt ?? null,
    configs: data?.configs ?? {},
  };
}

/** 将服务端预设写回实时 coord-config，并返回应用后的配置 */
export async function restoreCoordPreset(): Promise<AgvCoordPreset> {
  const res = await authHttp.post<{ data: AgvCoordPreset }>("/v1/agv/coord-config/preset/restore");
  const data = res.data.data;
  return {
    exists: !!data?.exists,
    savedAt: data?.savedAt ?? null,
    configs: data?.configs ?? {},
  };
}

// ── History Playback ──

export interface HistoryPlaybackResponse {
  robotIp: string;
  from: string;
  to: string;
  totalPoints: number;
  trail: AgvTrajectoryRow[];
  segments: {
    id: number;
    robotIp: string;
    startTime: string;
    endTime: string;
    activityType: string;
    zoneId?: number;
    startX?: number; startY?: number; endX?: number; endY?: number;
    avgX?: number; avgY?: number;
    distanceM?: number; batteryDelta?: number;
    source: string;
    confidence: number;
    ruleId?: number; correctionId?: number;
    metadataJson?: string;
  }[];
}

export async function fetchHistoryPlayback(ip: string, from: string, to: string): Promise<HistoryPlaybackResponse> {
  const res = await authHttp.get<{ data: HistoryPlaybackResponse }>(
    `/v1/agv/history-playback/${ip}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  return res.data.data;
}
