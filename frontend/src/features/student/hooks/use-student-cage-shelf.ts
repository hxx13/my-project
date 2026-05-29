import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  fetchStudentCageShelfFilterOptions,
  fetchStudentCageShelfDetail,
  refreshStudentCageShelf,
  type CageShelfFilterOptionsParams,
} from "../api/student.api";

/**
 * 笼架筛选选项（级联），支持按已选上级节点缩小范围
 * staleTime: 1 小时 — 基础结构不常变
 * placeholderData: keepPreviousData — 切换筛选时不闪骨架屏
 */
export function useStudentCageShelfFilterOptions(params: CageShelfFilterOptionsParams = {}) {
  return useQuery({
    queryKey: ["student", "cage-shelf", "filter-options", params],
    queryFn: () => fetchStudentCageShelfFilterOptions(params),
    staleTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * 单个笼架详情（含 8x10 网格）
 * shelveId 为 null 时不发起请求
 * staleTime: 5 分钟 — 快照数据不频繁变
 * placeholderData: keepPreviousData — 切换笼架时不闪骨架屏
 */
export function useStudentCageShelfDetail(shelveId: string | null) {
  return useQuery({
    queryKey: ["student", "cage-shelf", "detail", shelveId],
    queryFn: () => fetchStudentCageShelfDetail(shelveId!),
    enabled: !!shelveId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * 触发快照刷新，成功后失效所有笼架相关缓存
 */
export function useRefreshCageShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: refreshStudentCageShelf,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", "cage-shelf"] });
    },
  });
}
