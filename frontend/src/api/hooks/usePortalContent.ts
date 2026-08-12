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
  page?: number;
  size?: number;
}) {
  return useQuery({
    queryKey: portalContentQueryKeys.adminList(params),
    queryFn: () => fetchAdminContents(params),
  });
}

export function useAdminContent(id: number) {
  return useQuery({
    queryKey: portalContentQueryKeys.adminDetail(id),
    queryFn: () => fetchAdminContent(id),
    enabled: !!id,
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
