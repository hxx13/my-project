import { authHttp } from "@/api/core/authHttp";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──

export interface AgvSpatialElement {
  id?: number;
  name: string;
  mapName?: string;
  elementType: "STATION_ZONE" | "POLYGON_ZONE" | "POI" | "STATION_PATTERN";
  stationPattern?: string;
  polygonJson?: string; // JSON string: [{x,y},...]
  poiX?: number; poiY?: number; poiRadiusM?: number;
  semanticTags?: string; // JSON string: ["充电","作业"]
  color?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgvActivityRule {
  id?: number;
  name: string;
  activityType: string;
  spatialCond?: string;
  primitiveCond?: string;
  stateCond?: string;
  minDurationSec?: number;
  maxDurationSec?: number;
  priority: number;
  confidenceBase: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgvActivitySegment {
  id: number;
  robotIp: string;
  startTime: string; endTime: string;
  activityType: string;
  zoneId?: number;
  startX?: number; startY?: number; endX?: number; endY?: number;
  avgX?: number; avgY?: number;
  distanceM?: number; batteryDelta?: number;
  source: "AUTO" | "MANUAL" | "CORRECTED";
  confidence: number;
  ruleId?: number; correctionId?: number;
  metadataJson?: string;
  createdAt?: string;
}

export interface AgvCorrection {
  id: number;
  segmentId: number;
  originalType: string;
  correctedType: string;
  correctedBy: string;
  correctionNote?: string;
  coordinateSnapshot?: string;
  feedbackApplied: boolean;
  appliedRuleId?: number;
  correctedAt: string;
}

export interface AnalysisRequest {
  robotIp: string;
  from: string; // ISO datetime
  to: string;
}

export interface CorrectSegmentResult {
  correction: AgvCorrection;
  suggestNewRule: boolean;
}

// ── API functions ──

export async function fetchSegments(ip: string, from: string, to: string, type?: string): Promise<AgvActivitySegment[]> {
  let url = `/v1/agv/analysis/segments/${ip}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  if (type) url += `&type=${encodeURIComponent(type)}`;
  const res = await authHttp.get<{ data: AgvActivitySegment[] }>(url);
  return res.data.data;
}

export async function runAnalysis(req: AnalysisRequest): Promise<AgvActivitySegment[]> {
  const res = await authHttp.post<{ data: AgvActivitySegment[] }>("/v1/agv/analysis/run", req);
  return res.data.data;
}

export async function correctSegment(id: number, correctedType: string, note?: string): Promise<CorrectSegmentResult> {
  const params = new URLSearchParams({ correctedType });
  if (note) params.set("note", note);
  const res = await authHttp.put<{ data: CorrectSegmentResult }>(
    `/v1/agv/analysis/segments/${id}/correct?${params}`
  );
  return res.data.data;
}

export async function fetchSpatialElements(): Promise<AgvSpatialElement[]> {
  const res = await authHttp.get<{ data: AgvSpatialElement[] }>("/v1/agv/analysis/spatial-elements");
  return res.data.data;
}

export async function saveSpatialElement(e: AgvSpatialElement): Promise<AgvSpatialElement> {
  const res = await authHttp.post<{ data: AgvSpatialElement }>("/v1/agv/analysis/spatial-elements", e);
  return res.data.data;
}

export async function deleteSpatialElement(id: number): Promise<void> {
  await authHttp.delete(`/v1/agv/analysis/spatial-elements/${id}`);
}

export async function autoGenerateZones(mapName?: string): Promise<AgvSpatialElement[]> {
  const params = mapName ? `?mapName=${encodeURIComponent(mapName)}` : "";
  const res = await authHttp.post<{ data: AgvSpatialElement[] }>(
    `/v1/agv/analysis/spatial-elements/auto-generate${params}`
  );
  return res.data.data;
}

export async function fetchRules(): Promise<AgvActivityRule[]> {
  const res = await authHttp.get<{ data: AgvActivityRule[] }>("/v1/agv/analysis/rules");
  return res.data.data;
}

export async function saveRule(r: AgvActivityRule): Promise<AgvActivityRule> {
  const res = await authHttp.post<{ data: AgvActivityRule }>("/v1/agv/analysis/rules", r);
  return res.data.data;
}

export async function toggleRule(id: number, enabled: number): Promise<void> {
  await authHttp.put(`/v1/agv/analysis/rules/${id}/toggle?enabled=${enabled}`);
}

// ── React Query hooks ──

export function useSegments(ip: string, from: string, to: string, type?: string) {
  return useQuery({
    queryKey: ["agvSegments", ip, from, to, type],
    queryFn: () => fetchSegments(ip, from, to, type),
    enabled: !!ip && !!from && !!to,
    staleTime: 30_000,
  });
}

export function useAnalysisRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runAnalysis,
    onSuccess: (data, vars) => {
      qc.setQueryData(["agvSegments", vars.robotIp, vars.from, vars.to], data);
    },
    onError: (e: Error) => { console.error("分析失败:", e.message); },
  });
}

export function useCorrectSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type, note }: { id: number; type: string; note?: string }) =>
      correctSegment(id, type, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agvSegments"] }); },
    onError: (e: Error) => { console.error("纠正失败:", e.message); },
  });
}

export function useSpatialElements() {
  return useQuery({ queryKey: ["agvSpatialElements"], queryFn: fetchSpatialElements, staleTime: 60_000 });
}

export function useSaveSpatialElement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSpatialElement,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agvSpatialElements"] }),
    onError: (e: Error) => { console.error("保存区域失败:", e.message); },
  });
}

export function useDeleteSpatialElement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSpatialElement,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agvSpatialElements"] }),
    onError: (e: Error) => { console.error("删除区域失败:", e.message); },
  });
}

export function useAutoGenerateZones() {
  return useMutation({
    mutationFn: autoGenerateZones,
    onError: (e: Error) => { console.error("自动生成区域失败:", e.message); },
  });
}

export function useRules() {
  return useQuery({ queryKey: ["agvRules"], queryFn: fetchRules, staleTime: 60_000 });
}

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agvRules"] }),
    onError: (e: Error) => { console.error("保存规则失败:", e.message); },
  });
}

export function useToggleRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: number }) => toggleRule(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agvRules"] }),
    onError: (e: Error) => { console.error("切换规则失败:", e.message); },
  });
}

// ── Activity color map ──

export const ACTIVITY_COLORS: Record<string, string> = {
  CHARGING: "#22c55e",
  CHARGING_COMPLETE: "#16a34a",
  STATION_WORK: "#f59e0b",
  TRANSPORT: "#3b82f6",
  PATH_WAIT: "#9ca3af",
  FORK_OPERATION: "#8b5cf6",
  REVERSE_MANEUVER: "#ec4899",
  RELOC_EVENT: "#6b7280",
  EMERGENCY_STOP: "#ef4444",
  BLOCKED_WAIT: "#f97316",
  UNKNOWN_IDLE: "#d1d5db",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  CHARGING: "充电",
  CHARGING_COMPLETE: "充电完成",
  STATION_WORK: "站点作业",
  TRANSPORT: "运输",
  PATH_WAIT: "路径等待",
  FORK_OPERATION: "货叉操作",
  REVERSE_MANEUVER: "倒车调头",
  RELOC_EVENT: "重定位",
  EMERGENCY_STOP: "急停",
  BLOCKED_WAIT: "受阻等待",
  UNKNOWN_IDLE: "未知停靠",
};
