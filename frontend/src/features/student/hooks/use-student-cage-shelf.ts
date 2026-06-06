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
 * staleTime: 30 分钟 — 快照数据不频繁变
 *
 * 注意：不使用 keepPreviousData。
 * 当 shelveId 变化时（切换笼架或收藏/筛选切换），上一个 shelveId 的网格数据
 * 不应短暂显示在新笼架的位置，否则会造成"张冠李戴"的混淆。
 * 骨架屏（GridSkeleton）已通过 isLoading 守卫提供平稳的加载过渡。
 */
export function useStudentCageShelfDetail(shelveId: string | null) {
  return useQuery({
    queryKey: ["student", "cage-shelf", "detail", shelveId],
    queryFn: () => fetchStudentCageShelfDetail(shelveId!),
    enabled: !!shelveId,
    staleTime: 30 * 60 * 1000,
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
