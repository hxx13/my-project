import { authHttp } from "@/api/core/authHttp";

/* ------------------------------------------------------------------ */
/*  Types (mirrors backend TelemetryAlarmConfigTreeDto)                */
/* ------------------------------------------------------------------ */

export interface TagNode {
  tagId: number;
  variableName: string;
  /** 展示映射名 */
  displayLabel: string;
  roomCanonical: string;
  roomDisplay: string;
  metricKindCode: string;
  metricKindLabel: string | null;
  /** METRIC | SETPOINT | SWITCH */
  kindRole: string;
  /** 是否为报警指标（TEMP/HUM/PRESSURE） */
  isAlarmMetric: boolean;
  /** null=继承, false=禁用, true=启用 */
  alarmEnabled: boolean | null;
  alarmOverrideMin: string | null;
  alarmOverrideMax: string | null;
  effectiveMinValue: string | null;
  effectiveMaxValue: string | null;
}

export interface RoomNode {
  roomCanonical: string;
  roomDisplay: string;
  variableCount: number;
  hasAlarmMetrics: boolean;
  tags: TagNode[];
}

export interface SuiteNode {
  configId: number | null;
  suiteNorm: string;
  floorCode: string;
  enabled: boolean | null;
  tempMin: string | null;
  tempMax: string | null;
  humMin: string | null;
  humMax: string | null;
  pressureMin: string | null;
  pressureMax: string | null;
  hasCustomThresholds: boolean;
  variableCount: number;
  roomCount: number;
  rooms: RoomNode[];
}

export interface FloorNode {
  configId: number | null;
  floorCode: string;
  enabled: boolean;
  cooldownMinutes: number;
  notifyOnRecovery: boolean;
  variableCount: number;
  suiteCount: number;
  suites: SuiteNode[];
}

export interface AlarmConfigTree {
  floors: FloorNode[];
  totalFloors: number;
  totalSuites: number;
  totalRooms: number;
  totalVariables: number;
}

/* ------------------------------------------------------------------ */
/*  API calls                                                          */
/* ------------------------------------------------------------------ */

const BASE = "/v1/telemetry/alarm-config";

export async function fetchAlarmConfigTree(): Promise<AlarmConfigTree> {
  const res = await authHttp.get(`${BASE}/full-tree`);
  return res.data.data;
}

export async function saveFloorConfig(floor: {
  id?: number;
  floorCode: string;
  enabled: boolean;
  cooldownMinutes: number;
  notifyOnRecovery: boolean;
}): Promise<unknown> {
  const body = {
    id: floor.id ?? null,
    floorCode: floor.floorCode,
    enabled: floor.enabled ? 1 : 0,
    cooldownMinutes: floor.cooldownMinutes,
    notifyOnRecovery: floor.notifyOnRecovery ? 1 : 0,
  };
  const res = await authHttp.put(`${BASE}/floors`, body);
  return res.data.data;
}

export async function setFloorEnabled(id: number, enabled: boolean): Promise<void> {
  await authHttp.put(`${BASE}/floors/${id}/enabled?enabled=${enabled}`);
}

export async function saveSuiteConfig(suite: {
  id?: number;
  floorCode: string;
  suiteNorm: string;
  enabled: boolean | null;
  tempMin: string | null;
  tempMax: string | null;
  humMin: string | null;
  humMax: string | null;
  pressureMin: string | null;
  pressureMax: string | null;
}): Promise<unknown> {
  const body: Record<string, unknown> = {
    id: suite.id ?? null,
    floorCode: suite.floorCode,
    suiteNorm: suite.suiteNorm,
    enabled: suite.enabled === null ? null : (suite.enabled ? 1 : 0),
    tempMin: suite.tempMin || null,
    tempMax: suite.tempMax || null,
    humMin: suite.humMin || null,
    humMax: suite.humMax || null,
    pressureMin: suite.pressureMin || null,
    pressureMax: suite.pressureMax || null,
  };
  const res = await authHttp.put(`${BASE}/suites`, body);
  return res.data.data;
}

export async function setSuiteEnabled(id: number, enabled: boolean): Promise<void> {
  await authHttp.put(`${BASE}/suites/${id}/enabled?enabled=${enabled}`);
}

export async function setTagAlarmEnabled(tagId: number, enabled: boolean | null): Promise<void> {
  const params = enabled === null ? "" : `?enabled=${enabled}`;
  await authHttp.patch(`${BASE}/tags/${tagId}/alarm-enabled${params}`);
}
