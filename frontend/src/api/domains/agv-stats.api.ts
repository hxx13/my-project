import { authHttp } from "@/api/core/authHttp";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──

export interface StatsConfig {
  id?: number;
  name: string;
  configType: "STATION_GROUP" | "METRIC_PIPE" | "BUNDLE";
  definitionJson: string; // JSON string
  pipelineSlug?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StatsSnapshot {
  configId: number;
  metricKey: string;
  currentValue: number;
  trend: "up" | "down" | "flat";
  lastValue?: number;
  isRunning?: boolean;
  startedAt?: string;
}

export interface MetricCard {
  key: string;
  label: string;
  value: number;
  trend: "up" | "down" | "flat";
  isRunning?: boolean;
  format: "number" | "duration" | "decimal";
}

export interface StatsHistoryPoint {
  metricKey: string;
  value: number;
  recordedAt: string;
}

// ── API functions ──

/** MyBatis Map 返回 snake_case 列名 → 前端 camelCase 映射 */
function mapConfig(row: any): StatsConfig {
  return {
    id: row.id,
    name: row.name,
    configType: row.config_type ?? row.configType,
    definitionJson: typeof row.definition_json === 'string' ? row.definition_json
      : (row.definition_json ? JSON.stringify(row.definition_json) : (row.definitionJson ?? '{}')),
    pipelineSlug: row.pipeline_slug ?? row.pipelineSlug,
    isActive: row.is_active !== undefined ? (row.is_active === 1 || row.is_active === true) : row.isActive,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function mapSnapshot(row: any): StatsSnapshot {
  return {
    configId: row.config_id ?? row.configId,
    metricKey: row.metric_key ?? row.metricKey,
    currentValue: row.current_value ?? row.currentValue ?? 0,
    trend: row.trend ?? 'flat',
    lastValue: row.last_value ?? row.lastValue,
    isRunning: row.is_running !== undefined ? (row.is_running === 1 || row.is_running === true) : row.isRunning,
    startedAt: row.started_at ?? row.startedAt,
  };
}

export async function fetchConfigs(type?: string): Promise<StatsConfig[]> {
  const params = type ? `?type=${encodeURIComponent(type)}` : "";
  const res = await authHttp.get<{ data: any[] }>(`/v1/agv/stats/config${params}`);
  return (res.data.data || []).map(mapConfig);
}

export async function createConfig(c: Omit<StatsConfig, "id" | "createdAt" | "updatedAt">): Promise<StatsConfig> {
  const res = await authHttp.post<{ data: any }>("/v1/agv/stats/config", c);
  return mapConfig(res.data.data);
}

export async function updateConfig(id: number, c: Partial<StatsConfig>): Promise<StatsConfig> {
  const res = await authHttp.put<{ data: any }>(`/v1/agv/stats/config/${id}`, c);
  return mapConfig(res.data.data);
}

export async function deleteConfig(id: number): Promise<void> {
  await authHttp.delete(`/v1/agv/stats/config/${id}`);
}

export async function toggleConfig(id: number, active: number): Promise<void> {
  await authHttp.put(`/v1/agv/stats/config/${id}/toggle?active=${active}`);
}

export async function fetchAvailableStations(): Promise<string[]> {
  const res = await authHttp.get<{ data: string[] }>("/v1/agv/stats/config/stations");
  return res.data.data;
}

export async function fetchSnapshot(slug: string): Promise<StatsSnapshot[]> {
  const res = await authHttp.get<{ data: any[] }>(`/v1/agv/stats/pipe/${encodeURIComponent(slug)}/snapshot`);
  return (res.data.data || []).map(mapSnapshot);
}

export async function fetchHistory(slug: string, from?: string, to?: string, hours?: number): Promise<StatsHistoryPoint[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (hours != null) params.set("hours", String(hours));
  const qs = params.toString();
  const res = await authHttp.get<{ data: StatsHistoryPoint[] }>(
    `/v1/agv/stats/pipe/${encodeURIComponent(slug)}/history${qs ? `?${qs}` : ""}`
  );
  return res.data.data;
}

export async function fetchSseSnapshot(slug: string, from?: string, to?: string): Promise<StatsSnapshot[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const res = await authHttp.get<{ data: any[] }>(
    `/v1/agv/stats/pipe/${encodeURIComponent(slug)}/snapshot${qs ? `?${qs}` : ""}`
  );
  return (res.data.data || []).map(mapSnapshot);
}

// ── React Query hooks ──

export function useConfigs(type?: string) {
  return useQuery({
    queryKey: type ? ["agvStatsConfigs", type] : ["agvStatsConfigs"],
    queryFn: () => fetchConfigs(type),
    staleTime: 60_000,
  });
}

export function useSnapshot(slug: string, enabled?: boolean) {
  return useQuery({
    queryKey: ["agvStatsSnapshot", slug],
    queryFn: () => fetchSnapshot(slug),
    enabled: enabled !== false && !!slug,
    staleTime: 5_000, // short-lived cache for real-time data
  });
}

export function useHistory(slug: string, from?: string, to?: string, hours?: number) {
  return useQuery({
    queryKey: ["agvStatsHistory", slug, from, to, hours],
    queryFn: () => fetchHistory(slug, from, to, hours),
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useStations() {
  return useQuery({
    queryKey: ["agvStatsStations"],
    queryFn: fetchAvailableStations,
    staleTime: 5 * 60_000,
  });
}

export function useCreateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agvStatsConfigs"] });
    },
    onError: (e: Error) => { console.error("创建统计配置失败:", e.message); },
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<StatsConfig> }) => updateConfig(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agvStatsConfigs"] });
      qc.invalidateQueries({ queryKey: ["agvStatsSnapshot"] });
    },
    onError: (e: Error) => { console.error("更新统计配置失败:", e.message); },
  });
}

export function useDeleteConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agvStatsConfigs"] });
    },
    onError: (e: Error) => { console.error("删除统计配置失败:", e.message); },
  });
}

export function useToggleConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: number }) => toggleConfig(id, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agvStatsConfigs"] });
    },
    onError: (e: Error) => { console.error("切换配置状态失败:", e.message); },
  });
}

// ── Metric label helpers ──

export const METRIC_LABELS: Record<string, string> = {
  total_transport_tasks: "运输任务总数",
  active_transport_tasks: "进行中运输任务",
  completed_tasks: "已完成任务",
  avg_task_duration_sec: "平均任务耗时",
  total_distance_m: "累计里程",
  charging_sessions: "充电次数",
  avg_charging_duration_sec: "平均充电耗时",
  idle_time_sec: "空闲时间",
  station_work_count: "作业站工作次数",
  error_count: "异常次数",
  uptime_pct: "运行率",
  battery_cycles: "电池循环",
};

export const METRIC_FORMATS: Record<string, MetricCard["format"]> = {
  avg_task_duration_sec: "duration",
  avg_charging_duration_sec: "duration",
  idle_time_sec: "duration",
  uptime_pct: "decimal",
  total_distance_m: "decimal",
};

export function getMetricFormat(key: string): MetricCard["format"] {
  return METRIC_FORMATS[key] || "number";
}

export function getMetricLabel(key: string): string {
  return METRIC_LABELS[key] || key;
}
