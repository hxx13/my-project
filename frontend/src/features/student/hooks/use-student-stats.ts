import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "../api/student.api";
import type { StatsData } from "../api/student.api";

/**
 * 获取学生统计面板数据
 *
 * 默认查询近 30 天的出入统计，可通过 period 参数切换时间范围。
 * staleTime 设为 5 分钟，统计数据变化较慢无需频繁刷新。
 */
export function useStudentStats(period: string = "30d") {
  return useQuery<StatsData>({
    queryKey: ["student", "stats", period],
    queryFn: () => fetchStats(period),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
