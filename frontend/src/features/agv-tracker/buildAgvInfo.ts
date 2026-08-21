import type { MutableRefObject } from "react";
import type { AgvRobotStatus } from "@/api/domains/agv.api";
import type { TrailPoint } from "@/features/agv-tracker/agvAnalytics";
import { classifyActivity } from "@/features/agv-tracker/agvActivityClassifier";

// ── AGV info type ──

export interface AgvInfo {
  ip: string;
  label: string;
  online: boolean;
  color: string;
  trail: TrailPoint[];
  x: number | null;
  y: number | null;
  angle: number;
  speed: number;
  avgSpeed: number;
  maxSpeed: number;
  dwellSpots: { x: number; y: number; durationSec: number }[];
  battery: number | null;
  charging: boolean;
  taskStatus: number | null;
  blocked: boolean;
  emergency: boolean;
  station: string;
  mapName: string;
  confidence: number | null;
  relocStatus: number | null;
  loadmapStatus: number | null;
  odo: number;
  rssi: number | null;
  driverEmc: boolean | null;
  forkHeight: number;
  forkInPlace: boolean | null;
  jackEnable: boolean | null;
  jackState: number | null;
  jackIsFull: boolean | null;
  jackMode: boolean | null;
  jackErrorCode: number | null;
  errors: string[] | null;
  warnings: string[] | null;
  diChannels: { id: number; source: string; status: boolean; valid: boolean }[] | null;
  coordRotationDeg: number;
  coordOffsetX: number;
  coordOffsetY: number;
  coordScale: number;
  currentActivity: string | undefined;
}

// ── helpers ──

/** Derive activity type from raw telemetry — delegated to configurable rule engine */
export function deriveActivity(s: AgvRobotStatus | null): string | undefined {
  if (!s) return undefined;
  return classifyActivity({
    task_status: s.task_status ?? null,
    charging: s.charging ?? null,
    fork_height: s.fork_height ?? null,
  });
}

/** Build an AgvInfo object from raw data sources (shared by both single and merged views) */
export function buildAgvInfo(
  r: { ip: string; label: string; color: string },
  getStatus: (ip: string) => AgvRobotStatus | null,
  getLastPolled: (ip: string) => string | null,
  robotAnalytics: Record<
    string,
    { speed: number | null; avgSpeed: number | null; maxSpeed: number | null }
  >,
  dwellByIp: Record<string, { x: number; y: number; durationSec: number }[]>,
  getTrail: (ip: string) => TrailPoint[],
  coordConfigs: Record<string, any> | undefined,
  lastKnownRef: MutableRefObject<Record<string, Record<string, unknown>>>,
): AgvInfo {
  const s = getStatus(r.ip);
  const lp = getLastPolled(r.ip);
  const online = lp != null && Date.now() - new Date(lp).getTime() < 10_000;
  const a = robotAnalytics[r.ip];
  const last = (lastKnownRef.current[r.ip] ?? {}) as Record<string, any>;
  const trail = getTrail(r.ip);
  const lastTrail = trail.length > 0 ? trail[trail.length - 1] : null;

  // 构建兜底值：实时数据优先，离线用缓存，再不行用轨迹最后点
  const battery = s?.battery_level ?? last.battery ?? null;
  const angle = s?.angle ?? lastTrail?.angle ?? last.angle ?? 0;
  const station = s?.current_station ?? last.station ?? "—";
  const mapName = s?.current_map ?? last.mapName ?? "—";
  const speed = a.speed ?? 0;
  const odo = s?.odo ?? last.odo ?? 0;
  const rssi = s?.rssi ?? last.rssi ?? null;
  const forkHeight = s?.fork_height ?? last.forkHeight ?? 0;
  const taskStatus = s?.task_status ?? last.taskStatus ?? null;
  const charging = s?.charging ?? last.charging ?? false;
  const coordFrame = coordConfigs?.[r.ip];
  const coordRotationDeg = coordFrame?.rotationDeg ?? last.coordRotationDeg ?? 0;
  const coordOffsetX = coordFrame?.offsetX ?? last.coordOffsetX ?? 0;
  const coordOffsetY = coordFrame?.offsetY ?? last.coordOffsetY ?? 0;
  const coordScale = coordFrame?.scale ?? last.coordScale ?? 1;

  const info: AgvInfo = {
    ip: r.ip,
    label: r.label,
    online,
    color: r.color,
    trail,
    x: s?.x ?? null,
    y: s?.y ?? null,
    angle,
    speed,
    avgSpeed: a.avgSpeed ?? 0,
    maxSpeed: a.maxSpeed ?? 0,
    dwellSpots: dwellByIp[r.ip],
    battery,
    charging,
    taskStatus,
    blocked: s?.blocked ?? false,
    emergency: s?.emergency ?? false,
    station,
    mapName,
    confidence: s?.confidence ?? last.confidence ?? null,
    relocStatus: s?.reloc_status ?? last.relocStatus ?? null,
    loadmapStatus: s?.loadmap_status ?? last.loadmapStatus ?? null,
    odo,
    rssi,
    driverEmc: s?.driver_emc ?? last.driverEmc ?? null,
    forkHeight,
    forkInPlace: s?.fork_height_in_place ?? null,
    jackEnable: s?.jack_enable ?? last.jackEnable ?? null,
    jackState: s?.jack_state ?? last.jackState ?? null,
    jackIsFull: s?.jack_isFull ?? last.jackIsFull ?? null,
    jackMode: s?.jack_mode ?? last.jackMode ?? null,
    jackErrorCode: s?.jack_error_code ?? last.jackErrorCode ?? null,
    errors: s?.errors ?? null,
    warnings: s?.warnings ?? null,
    diChannels: s?.DI ?? last.diChannels ?? null,
    coordRotationDeg,
    coordOffsetX,
    coordOffsetY,
    coordScale,
    currentActivity: deriveActivity(s),
  };

  // 只缓存有效值，不覆盖已有缓存为 null
  const cache = lastKnownRef.current;
  const prev = cache[r.ip] ?? {};
  for (const [k, v] of Object.entries(info)) {
    if (v != null) (prev as any)[k] = v;
  }
  cache[r.ip] = prev;
  return info;
}
