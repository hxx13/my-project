import { authHttp } from "@/api/core/authHttp";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAgvRobotsByZone } from "@/features/agv-tracker/agvRobotConfig";

// ── Types ──

export interface AgvSpatialElement {
  id?: number;
  name: string;
  mapName?: string;
  elementType: "STATION_ZONE" | "POLYGON_ZONE" | "POI" | "STATION_PATTERN";
  stationPattern?: string;
  polygonJson?: string; // JSON string: [[x,y],...]
  poiX?: number; poiY?: number; poiRadiusM?: number;
  semanticTags?: string; // JSON string: ["充电","作业"]
  color?: string;
  isActive?: boolean;
  confidence?: number;  // 行为确认置信度 0~1
  hitCount?: number;    // 被分析命中的总次数
  source?: string;      // AUTO | BEHAVIOR | MANUAL | TOPOLOGY
  robotIp?: string;     // 所属小车 IP，null = 共享区域
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
  const res = await authHttp.post<{ data: AgvActivitySegment[] }>("/v1/agv/analysis/run", req, { timeout: 120_000 });
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
    // 去掉末尾 undefined，保证 key 与 mutation 的 setQueryData 一致
    queryKey: type != null ? ["agvSegments", ip, from, to, type] : ["agvSegments", ip, from, to],
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
      // key 现在一致：["agvSegments", ip, from, to]，精准写入缓存
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

export async function discoverZones(): Promise<{ segmentsAnalyzed: number; zonesCreatedOrUpdated: number; window: string }> {
  const res = await authHttp.post<{ data: { segmentsAnalyzed: number; zonesCreatedOrUpdated: number; window: string } }>("/v1/agv/analysis/spatial-elements/discover");
  return res.data.data;
}

export function useDiscoverZones() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: discoverZones,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agvSpatialElements"] }),
    onError: (e: Error) => { console.error("行为区域发现失败:", e.message); },
  });
}

/** 路线拓扑 → 区域生成（复用路线标签和频次，质量远超旧算法） */
export async function generateZonesFromTopology(): Promise<{ zonesCreated: number; source: string }> {
  const res = await authHttp.post<{ data: { zonesCreated: number; source: string } }>(
    "/v1/agv/analysis/spatial-elements/generate-from-topology"
  );
  return res.data.data;
}

export function useGenerateZonesFromTopology() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: generateZonesFromTopology,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agvSpatialElements"] }),
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
  STATION_WORK: "#f59e0b",
  TRANSPORT: "#3b82f6",
  NAVIGATING: "#60a5fa",
  REST_STATION: "#14b8a6",
};

// ── Routes (固定路线拓扑，非算法动态发现) ──

export interface RouteTopologyStation {
  x: number;
  y: number;
  observations: number;
}

export interface RouteTopologyEdge {
  from: string;
  to: string;
  distance_m: number;
  angle_deg: number;
  reverse_angle_deg: number;
  forward_count: number;
  reverse_count: number;
  total_count: number;
  is_one_way: boolean;
  one_way_direction: string | null;
  confidence: "high" | "medium";
  robot_ips?: string[];  // 经过此路段的 AGV IP 列表
  path_json?: string;    // 实际轨迹路径 [[x,y],...] 含转角节点
}

export interface RouteTopologyZone {
  stations: Record<string, RouteTopologyStation>;
  edges: RouteTopologyEdge[];
  station_count: number;
  edge_count: number;
  agvs?: string[];
}

export interface RouteTopologyResponse {
  description: string;
  method: string;
  hard_constraints_applied?: Record<string, string>;
  zones: Record<string, RouteTopologyZone>;
}

/**
 * 将拓扑边转换为前端路线 overlay 格式。
 * 每条边 = 一段直连路线，pathJson = 两站坐标的线段。
 */
function topologyToRouteOverlays(
  topology: RouteTopologyResponse,
): Array<{ id: number; pathJson: string; color: string; name: string; routeType: string; robotIp: string }> {
  const results: Array<{ id: number; pathJson: string; color: string; name: string; routeType: string; robotIp: string }> = [];
  // robot_ips 缺失时的 zone 级 fallback
  const zoneAgvMap: Record<string, string[]> = {
    zone1: getAgvRobotsByZone("zone1").map(r => r.ip),
    zone2: getAgvRobotsByZone("zone2").map(r => r.ip),
  };
  let idCounter = 1;

  for (const [zoneKey, zone] of Object.entries(topology.zones)) {
    const stations = zone.stations;
    if (!zone.edges?.length) continue;

    for (const edge of zone.edges) {
      const a = stations[edge.from];
      const b = stations[edge.to];

      // 优先使用后端提供的实际轨迹路径（含转角节点），fallback 到站点锚点直线
      let pathJson: string;
      if (edge.path_json && edge.path_json !== "[]") {
        pathJson = edge.path_json;
      } else if (a && b) {
        pathJson = JSON.stringify([[a.x, a.y], [b.x, b.y]]);
      } else {
        continue;
      }

      // 根据站点类型推断路线用途（与 AGV 行为分析任务编号对应）
      const fromType = edge.from.startsWith("CP") ? "CP" : edge.from.startsWith("AP") ? "AP" : "LM";
      const toType = edge.to.startsWith("CP") ? "CP" : edge.to.startsWith("AP") ? "AP" : "LM";

      let color: string, routeType: string;
      if (fromType === "CP" || toType === "CP") {
        color = "#22c55e"; routeType = "REST";           // 充电 → 绿色
      } else if (fromType === "AP" || toType === "AP") {
        color = "#f59e0b"; routeType = "STATION_WORK";   // 作业站 → 橙色
      } else if (fromType === "LM" || toType === "LM") {
        color = "#6b7280"; routeType = "NAVIGATING";     // 路径点 → 灰色
      } else if (edge.confidence === "high") {
        color = "#3b82f6"; routeType = "TRANSPORT";      // 高频 → 蓝色
      } else {
        color = "#3b82f6"; routeType = "TRANSPORT";      // 默认 → 运输
      }
      const name = (edge.total_count ?? 0) >= 15 ? `${edge.from}-${edge.to}` : "";

      // 按 robot_ips 分配路线：每台车只看自己走过的路段
      // 静态 JSON fallback 没有 robot_ips → 回退到 zone 级分配
      const agvIps = edge.robot_ips?.length ? edge.robot_ips
        : zoneAgvMap[zoneKey] || [];
      for (const agvIp of agvIps) {
        results.push({ id: idCounter++, pathJson, color, name, routeType, robotIp: agvIp });
      }
    }
  }
  return results;
}

export async function fetchRouteTopology(): Promise<RouteTopologyResponse> {
  const res = await authHttp.get<{ data: RouteTopologyResponse }>("/v1/agv/routes/topology/generated");
  return res.data.data;
}

export function useRouteTopology() {
  return useQuery({
    queryKey: ["agvRouteTopology"],
    queryFn: fetchRouteTopology,
    staleTime: 5 * 60_000, // 5分钟缓存，允许生成后刷新
    gcTime: 30 * 60_000,
  });
}

/** 路线模型2 — 生成摘要返回类型 */
export interface TopologyGenerateResult {
  algorithmVersion: string;
  noiseThreshold: number;
  windowHours: number;
  generatedAt: string;
  zones: Array<{
    zone: string;
    agvs: string[];
    stationCount: number;
    edgeCount: number;
    rawSegments: number;
    noiseRemoved: number;
    constraintRemoved: number;
  }>;
  totalStations: number;
  totalEdges: number;
  totalRawSegments: number;
  totalNoiseRemoved: number;
  totalConstraintRemoved: number;
  success: boolean;
}

/** 路线模型2 — 触发拓扑重新生成 */
export async function generateRouteTopology(): Promise<TopologyGenerateResult> {
  const res = await authHttp.post<{ data: TopologyGenerateResult }>("/v1/agv/routes/topology/generate");
  return res.data.data;
}

export function useGenerateRouteTopology() {
  const qc = useQueryClient();
  return useMutation<TopologyGenerateResult, Error, void>({
    mutationFn: generateRouteTopology,
    onSuccess: () => {
      // 生成成功后刷新路线拓扑数据
      qc.invalidateQueries({ queryKey: ["agvRouteTopology"] });
    },
  });
}

/** 将 RouteTopologyResponse 转为前端可直接渲染的 routeOverlays */
export function buildTopologyOverlays(
  topology: RouteTopologyResponse | undefined,
): Array<{ id: number; pathJson: string; color: string; name: string; routeType: string; robotIp: string }> {
  if (!topology?.zones) return [];
  return topologyToRouteOverlays(topology);
}

// ═══════════════════════════════════════════════════════════════
// DEPRECATED — 旧版路线 v1 API（保留仅供编译兼容，路由模式已停用）
// ═══════════════════════════════════════════════════════════════
// 替代方案:
//   fetchRoutes / useRoutes → 请改用 useRouteTopology()
//   discoverRoutes / useDiscoverRoutes → 已彻底废弃，直接返回空结果
//   AgvRoute 类型 → 对应新类型 RouteTopologyStation/Edge/Zone/Response
// ═══════════════════════════════════════════════════════════════

/** @deprecated 路线模式已改用固定拓扑数据（RouteTopologyResponse），此类型仅保留以兼容分析弹窗历史引用 */
export interface AgvRoute {
  id: number;
  robotIp: string;
  name: string;
  routeType: string;
  pathJson: string;
  color: string;
  fromStation?: string;
  toStation?: string;
  frequency: number;
  enabled: boolean;
}

/** @deprecated 路线模式已改用 useRouteTopology()（v2 拓扑），此 v1 API 不再使用 */
export async function fetchRoutes(robotIp?: string): Promise<AgvRoute[]> {
  const params = robotIp ? `?robotIp=${encodeURIComponent(robotIp)}` : "";
  const res = await authHttp.get<{ data: AgvRoute[] }>(`/v1/agv/analysis/routes${params}`);
  return res.data.data;
}

/** @deprecated 路线模式已改用 useRouteTopology()（v2 拓扑），此 v1 hook 不再使用 */
export function useRoutes(robotIp?: string) {
  return useQuery({
    queryKey: ["agvRoutes", robotIp],
    queryFn: () => fetchRoutes(robotIp),
    staleTime: 60_000,
  });
}

/** @deprecated 路线发现算法 v1 已彻底废弃（v2 改用 generateRouteTopology()），此函数为 no-op 桩 */
export async function discoverRoutes(_force = false): Promise<{ routesDiscovered: number; force: boolean }> {
  return { routesDiscovered: 0, force: false };
}

/** @deprecated 路线发现算法 v1 已彻底废弃（v2 改用 useGenerateRouteTopology()），此 hook 为 no-op 桩 */
export function useDiscoverRoutes() {
  const qc = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof discoverRoutes>>, Error, boolean | undefined>({
    mutationFn: (_force = false) => Promise.resolve({ routesDiscovered: 0, force: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agvRoutes"] }),
  });
}

export const ROUTE_COLORS: Record<string, string> = {
  TRANSPORT: "#3fb950",
  REVERSE: "#f85149",
  REST: "#14b8a6",
  NAVIGATING: "#d29922",
};

export const ROUTE_LABELS: Record<string, string> = {
  TRANSPORT: "主干路线",
  REVERSE: "单行路线",
  REST: "休息路线",
  NAVIGATING: "支线路线",
};

// ── Activity labels ──

export const ACTIVITY_LABELS: Record<string, string> = {
  CHARGING: "充电",
  STATION_WORK: "载货",
  TRANSPORT: "运输",
  NAVIGATING: "寻路",
  REST_STATION: "休息",
};
