import { useQuery } from "@tanstack/react-query";
import { fetchViolations } from "../api/student.api";
import type { FetchViolationsParams, ViolationData } from "../api/student.api";

/**
 * 获取违规记录列表
 *
 * 支持按时间范围筛选和分页。
 * staleTime 设为 5 分钟。
 */
export function useStudentViolations(params: FetchViolationsParams = {}) {
  return useQuery<{ data: ViolationData[]; total: number }>({
    queryKey: ["student", "violations", params],
    queryFn: () => fetchViolations(params),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
