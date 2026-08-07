import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  fetchSupplyCategories,
  fetchSupplyItems,
  fetchSupplyItem,
  fetchSupplyCart,
  saveSupplyCart,
  createSupplyClaim,
  fetchSupplyMine,
  fetchSupplyClaimDetail,
  withdrawSupplyClaim,
  deleteMySupplyClaim,
  fetchMySupplyClaimRecycle,
  restoreMySupplyClaimRecycle,
  deleteAdminSupplyClaim,
  restoreAdminClaimRecycle,
  createOrReuseSupplyClaimPdfLink,
  listSupplyClaimPdfLinks,
  deleteSupplyClaimPdfLink,
  fetchAdminSupplyCategories,
  createAdminSupplyCategory,
  updateAdminSupplyCategory,
  deleteAdminSupplyCategory,
  fetchAdminSupplyItems,
  createAdminSupplyItem,
  updateAdminSupplyItem,
  deleteAdminSupplyItem,
  fetchAdminClaimRecycle,
  purgeAdminClaimRecycleByIds,
  purgeAllAdminClaimRecycle,
  fetchAdminSupplyRecycle,
  restoreAdminSupplyRecycle,
  purgeAdminSupplyRecycle,
  purgeAdminSupplyRecycleByIds,
  purgeAllAdminSupplyRecycle,
  inboundSupplyItem,
  adjustSupplyStock,
  fulfillSupplyClaim,
  fetchSupplyPendingTasks,
  fetchSupplyRecentClosedClaims,
  type SupplyItem,
} from "@/api/domains/supplies.api";
import { toast } from "react-hot-toast";

export function useSupplyCategories() {
  return useQuery({
    queryKey: queryKeys.supplies.categories(),
    queryFn: fetchSupplyCategories,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSupplyItems(categoryId?: number | "all") {
  const resolved = categoryId === "all" ? undefined : categoryId;
  return useQuery({
    queryKey: queryKeys.supplies.items(resolved),
    queryFn: () => fetchSupplyItems(resolved),
  });
}

export function useSupplyItem(id: number) {
  return useQuery({
    queryKey: queryKeys.supplies.itemDetail(id),
    queryFn: () => fetchSupplyItem(id),
    enabled: !!id,
  });
}

export function useSupplyCart() {
  return useQuery({
    queryKey: [...queryKeys.supplies.all, "cart"] as const,
    queryFn: fetchSupplyCart,
  });
}

export function useSaveSupplyCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSupplyCart,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...queryKeys.supplies.all, "cart"] }),
  });
}

export function useCreateSupplyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSupplyClaim,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("领用申请已提交");
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });
}

export function useSupplyMine(params: { page: number; size: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.supplies.claims(params),
    queryFn: () => fetchSupplyMine(params),
    placeholderData: (prev) => prev,
  });
}

export function useSupplyClaimDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.supplies.claimDetail(id),
    queryFn: () => fetchSupplyClaimDetail(id),
    enabled: !!id,
  });
}

export function useWithdrawSupplyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: withdrawSupplyClaim,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("已撤回");
    },
    onError: (e: Error) => toast.error(e.message || "撤回失败"),
  });
}

export function useDeleteMySupplyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteMySupplyClaim,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useMySupplyClaimRecycle(params: { page: number; size: number }) {
  return useQuery({
    queryKey: [...queryKeys.supplies.all, "myRecycle", params] as const,
    queryFn: () => fetchMySupplyClaimRecycle(params),
    placeholderData: (prev) => prev,
  });
}

export function useRestoreMySupplyClaimRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreMySupplyClaimRecycle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("已恢复");
    },
    onError: (e: Error) => toast.error(e.message || "恢复失败"),
  });
}

export function useSupplyPdfLinks(claimId: string) {
  return useQuery({
    queryKey: [...queryKeys.supplies.all, "pdfLinks", claimId] as const,
    queryFn: () => listSupplyClaimPdfLinks(claimId),
    enabled: !!claimId,
  });
}

export function useCreateSupplyPdfLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOrReuseSupplyClaimPdfLink,
    onSuccess: (_data, claimId) => {
      qc.invalidateQueries({ queryKey: [...queryKeys.supplies.all, "pdfLinks", claimId] });
    },
  });
}

export function useDeleteSupplyPdfLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, linkId }: { claimId: string; linkId: string }) =>
      deleteSupplyClaimPdfLink(claimId, linkId),
    onSuccess: (_, { claimId }) => {
      qc.invalidateQueries({ queryKey: [...queryKeys.supplies.all, "pdfLinks", claimId] });
    },
  });
}

export function useSupplyPendingTasks() {
  return useQuery({
    queryKey: [...queryKeys.supplies.all, "pendingTasks"] as const,
    queryFn: fetchSupplyPendingTasks,
    refetchInterval: 30_000,
  });
}

export function useSupplyRecentClosed(limit = 40) {
  return useQuery({
    queryKey: [...queryKeys.supplies.all, "recentClosed", limit] as const,
    queryFn: () => fetchSupplyRecentClosedClaims(limit),
  });
}

export function useFulfillSupplyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      lines,
    }: {
      id: string;
      lines: { lineId: number; grant: boolean; fulfillQty?: number }[];
    }) => fulfillSupplyClaim(id, lines),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("出库完成");
    },
    onError: (e: Error) => toast.error(e.message || "出库失败"),
  });
}

export function useDeleteAdminSupplyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminSupplyClaim,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("已移入回收站");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useAdminClaimRecycle(params: { page: number; size: number }) {
  return useQuery({
    queryKey: [...queryKeys.supplies.all, "adminClaimRecycle", params] as const,
    queryFn: () => fetchAdminClaimRecycle(params),
    placeholderData: (prev) => prev,
  });
}

export function useRestoreAdminClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreAdminClaimRecycle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("已恢复");
    },
    onError: (e: Error) => toast.error(e.message || "恢复失败"),
  });
}

export function usePurgeAdminClaimByIds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeAdminClaimRecycleByIds,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success(`已彻底删除 ${data?.deleted ?? 0} 条`);
    },
    onError: (e: Error) => toast.error(e.message || "清除失败"),
  });
}

export function usePurgeAllAdminClaims() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeAllAdminClaimRecycle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("回收站已清空");
    },
    onError: (e: Error) => toast.error(e.message || "清空失败"),
  });
}

export function useAdminSupplyCategories() {
  return useQuery({
    queryKey: [...queryKeys.supplies.all, "adminCategories"] as const,
    queryFn: fetchAdminSupplyCategories,
  });
}

export function useCreateAdminSupplyCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAdminSupplyCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.supplies.all, "adminCategories"] });
      toast.success("分类已创建");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useUpdateAdminSupplyCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<{ name: string; coverUrl: string; sortOrder: number; status: number }> }) =>
      updateAdminSupplyCategory(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.supplies.all, "adminCategories"] });
      toast.success("分类已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteAdminSupplyCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminSupplyCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.supplies.all, "adminCategories"] });
      toast.success("分类已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useAdminSupplyItems(categoryId?: number) {
  return useQuery({
    queryKey: [...queryKeys.supplies.all, "adminItems", categoryId] as const,
    queryFn: () => fetchAdminSupplyItems(categoryId),
  });
}

export function useCreateAdminSupplyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAdminSupplyItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("物品已创建");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useUpdateAdminSupplyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<SupplyItem> }) =>
      updateAdminSupplyItem(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("物品已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteAdminSupplyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminSupplyItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("物品已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useAdminSupplyRecycle(params: { page: number; size: number }) {
  return useQuery({
    queryKey: [...queryKeys.supplies.all, "adminRecycle", params] as const,
    queryFn: () => fetchAdminSupplyRecycle(params),
    placeholderData: (prev) => prev,
  });
}

export function useRestoreAdminSupplyRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreAdminSupplyRecycle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("已恢复");
    },
    onError: (e: Error) => toast.error(e.message || "恢复失败"),
  });
}

export function usePurgeAdminSupplyRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeAdminSupplyRecycleByIds,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success(`已清除 ${data?.deleted ?? 0} 条`);
    },
    onError: (e: Error) => toast.error(e.message || "清除失败"),
  });
}

export function usePurgeAllAdminSupplyRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeAllAdminSupplyRecycle,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success(`回收站已清空（${data?.deleted ?? 0} 条）`);
    },
    onError: (e: Error) => toast.error(e.message || "清空失败"),
  });
}

export function useInboundSupplyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: inboundSupplyItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("入库完成");
    },
    onError: (e: Error) => toast.error(e.message || "入库失败"),
  });
}

export function useAdjustSupplyStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newQty }: { id: number; newQty: number }) => adjustSupplyStock(id, newQty),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supplies.all });
      toast.success("库存已调整");
    },
    onError: (e: Error) => toast.error(e.message || "调整失败"),
  });
}
