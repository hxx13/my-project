import { useQuery } from "@tanstack/react-query";
import { fetchDashboard } from "../api/student.api";
import type { DashboardData } from "../api/student.api";

/**
 * 获取学生仪表盘数据
 *
 * 包含档案摘要、统计卡片、置顶房间、最近记录和通知。
 * staleTime 设为 1 分钟，在快速切换页面时减少重复请求。
 */
export function useStudentDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["student", "dashboard"],
    queryFn: fetchDashboard,
    staleTime: 60 * 1000,
    retry: 2,
  });
}
