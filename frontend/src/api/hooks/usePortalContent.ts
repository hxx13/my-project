import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { portalContentQueryKeys } from "./queryKeys";
import {
  fetchPublicContents,
  fetchPublicContent,
  fetchPublicCategories,
  fetchAdminContents,
  fetchAdminContent,
  createContent,
  updateContent,
  deleteContent,
  fetchRecycleContents,
  restoreContent,
  purgeContent,
  type ContentType,
  type ContentStatus,
  type ContentPriority,
  type AdminContentSort,
  type PortalContentUpsertRequest,
} from "@/api/domains/portalContent.api";

/* ── 公开查询 ── */

export function usePublicContents(params: {
  type?: ContentType;
  categoryId?: number;
  search?: string;
  sort?: string;
  page?: number;
  size?: number;
}) {
  return useQuery({
    queryKey: portalContentQueryKeys.publicList(params),
    queryFn: () => fetchPublicContents(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicContent(id: number) {
  return useQuery({
    queryKey: portalContentQueryKeys.publicDetail(id),
    queryFn: () => fetchPublicContent(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicCategories(scope?: ContentType) {
  return useQuery({
    queryKey: portalContentQueryKeys.categories(scope),
    queryFn: () => fetchPublicCategories(scope),
    staleTime: 10 * 60 * 1000,
  });
}

/* ── 管理查询 ── */

export function useAdminContents(params: {
  type?: ContentType;
  status?: ContentStatus;
  search?: string;
  priority?: ContentPriority;
  categoryId?: number;
  sort?: AdminContentSort;
  page?: number;
  size?: number;
}) {
  return useQuery({
    queryKey: portalContentQueryKeys.adminList(params),
    queryFn: () => fetchAdminContents(params),
    placeholderData: (prev) => prev,
  });
}

export function useAdminContent(id: number) {
  return useQuery({
    queryKey: portalContentQueryKeys.adminDetail(id),
    queryFn: () => fetchAdminContent(id),
    enabled: !!id,
    /**
     * 编辑页单独开「聚焦时重取」—— 全局是关的（staleTime 5 分钟）。
     *
     * <p>原因：这条记录可能在**别处**被改过（另一个页签把它下线了、球球替它改了状态），
     * 全局策略下页签之间互相不知道，编辑页会一直显示旧状态 —— 用户盯着「已发布」一点保存，
     * 就把那次下线悄悄撤销了。配合编辑页「同一条重取时只同步状态」那条分支，聚焦回来即自愈。
     * 只查一条，代价很小。
     *
     * <p>同时把 staleTime 归零：{@code refetchOnWindowFocus} 只对**过期**的查询生效，
     * 而全局 staleTime 是 5 分钟 —— 不归零的话「刚打开不到 5 分钟」时聚焦它根本不重取，
     * 自愈等于没做（真机实测：改完代码聚焦仍是旧值，就是这个原因）。
     */
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

export function useRecycleContents(params: { page?: number; size?: number }) {
  return useQuery({
    queryKey: portalContentQueryKeys.recycle(params),
    queryFn: () => fetchRecycleContents(params),
  });
}

/* ── 管理变更 ── */

export function useCreateContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PortalContentUpsertRequest) => createContent(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portalContentQueryKeys.all });
      toast.success("创建成功");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useUpdateContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<PortalContentUpsertRequest> }) =>
      updateContent(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portalContentQueryKeys.all });
      toast.success("保存成功");
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
}

export function useDeleteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteContent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portalContentQueryKeys.all });
      toast.success("已移入回收站");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useRestoreContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => restoreContent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portalContentQueryKeys.all });
      toast.success("已恢复");
    },
    onError: (e: Error) => toast.error(e.message || "恢复失败"),
  });
}

export function usePurgeContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => purgeContent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: portalContentQueryKeys.all });
      toast.success("已彻底删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}
