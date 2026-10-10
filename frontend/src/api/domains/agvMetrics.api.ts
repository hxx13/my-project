import { authHttp } from "@/api/core/authHttp";

/** 曲线上的一个点。笼盒曲线的 at 是时刻/日期，里程曲线的是日期 */
export interface MetricPoint {
  at: string;
  cages?: number;
  meters?: number;
}

/** 今日实时里程：每台车 + 合计（后端扫当天到此刻的轨迹现算，不等次日封存） */
export interface AgvTodayLive {
  odoByRobot: Record<string, number>;
  odoTotal: number;
}

export interface AgvMetricsOverview {
  cageWashTotal: number;
  odoTotal: number;
  /** 六台车各自的历史累计里程（米），键是车 IP */
  odoTotalByRobot?: Record<string, number>;
  cagesPerStroke: number;
  robotCount: number;
  cageWashTodayLive: number;
  todayLive?: AgvTodayLive;
  todayFrozen: Array<Record<string, unknown>>;
}

export async function fetchAgvMetricsOverview(): Promise<AgvMetricsOverview> {
  const res = await authHttp.get<{ data: AgvMetricsOverview }>("/v1/agv/metrics/today");
  return res.data.data;
}

/** range=today 今日 5 分钟桶累计；range=days 近 N 天日值（缺数据的天不出点） */
export async function fetchCageWashCurve(range: "today" | "days", days = 30): Promise<MetricPoint[]> {
  const res = await authHttp.get<{ data: { points: MetricPoint[] } }>(
    `/v1/agv/metrics/cage-wash?range=${range}&days=${days}`
  );
  return res.data.data.points ?? [];
}

export interface DistanceSeries {
  key: string;
  points: MetricPoint[];
}

export async function fetchDistanceCurve(days = 30): Promise<DistanceSeries[]> {
  const res = await authHttp.get<{ data: { series: DistanceSeries[] } }>(
    `/v1/agv/metrics/distance?days=${days}`
  );
  return res.data.data.series ?? [];
}
