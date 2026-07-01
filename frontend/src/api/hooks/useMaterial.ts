import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMaterialCategories, fetchMaterialItems, fetchMaterialCart, saveMaterialCart,
  createMaterialRequest, fetchMyMaterialRequests, fetchMaterialRequestDetail,
  withdrawMaterialRequest, confirmMaterialReceive, fetchMyMaterialStats,
  fetchAdminMaterialCategories, createAdminMaterialCategory, updateAdminMaterialCategory, deleteAdminMaterialCategory,
  fetchAdminMaterialItems, createAdminMaterialItem,
  updateAdminMaterialItem, deleteAdminMaterialItem, fetchAdminMaterialRecycle,
  restoreAdminMaterialRecycle, purgeAdminMaterialRecycle, purgeAdminMaterialRecycleByIds,
  purgeAllAdminMaterialRecycle, adjustMaterialStock, inboundMaterialItem, fetchPendingMaterialRequests,
  fetchAllMaterialRequests,
  fetchFinishedMaterialRequests, approveMaterialRequest, rejectMaterialRequest, revokeMaterialRequest, deleteMaterialRequest,
  fulfillMaterialRequest, fetchMaterialStatsOverview, fetchMaterialAuditTrail,
} from "@/api/domains/material.api";
import { materialQueryKeys } from "@/api/hooks/queryKeys";
import { studentReviewPendingQueryOptions } from "@/features/student-review/studentReviewPoll";
import {
  MATERIAL_REVIEW_FINISHED_PAGE,
  mergeMaterialReviewAfterApprove,
  mergeMaterialReviewAfterReject,
  mergeMaterialReviewAfterRevoke,
  removeMaterialReviewRequestFromCaches,
} from "@/features/student-review/materialReviewCache";

// student hooks
export function useMaterialCategories() {
  return useQuery({ queryKey: materialQueryKeys.categories(), queryFn: fetchMaterialCategories });
}
export function useMaterialItems(categoryId?: number) {
  return useQuery({ queryKey: materialQueryKeys.items(categoryId), queryFn: () => fetchMaterialItems(categoryId) });
}
export function useMaterialCart() {
  return useQuery({ queryKey: materialQueryKeys.cart(), queryFn: fetchMaterialCart });
}
export function useSaveMaterialCart() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: saveMaterialCart, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.cart() }) });
}
export function useCreateMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { lines: { itemId: number; qty: number; specSnapshot?: string }[]; applicantGroup?: string }) =>
      createMaterialRequest(params.lines, params.applicantGroup),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: materialQueryKeys.requests() });
      qc.invalidateQueries({ queryKey: materialQueryKeys.cart() });
      const count = Array.isArray(data) ? data.length : 1;
      return count;
    },
  });
}
export function useMyMaterialRequests(params: { page: number; size: number; status?: string }) {
  return useQuery({ queryKey: materialQueryKeys.myRequests(params), queryFn: () => fetchMyMaterialRequests(params) });
}
export function useMaterialRequestDetail(id: string) {
  return useQuery({ queryKey: materialQueryKeys.requestDetail(id), queryFn: () => fetchMaterialRequestDetail(id), enabled: !!id });
}
export function useWithdrawMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: withdrawMaterialRequest, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }) });
}
export function useConfirmMaterialReceive() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: confirmMaterialReceive, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }) });
}
export function useMyMaterialStats() {
  return useQuery({ queryKey: materialQueryKeys.myStats(), queryFn: fetchMyMaterialStats });
}

// admin hooks
export function useAdminMaterialCategories() {
  return useQuery({ queryKey: materialQueryKeys.adminCategories(), queryFn: () => fetchAdminMaterialCategories() });
}
export function useCreateAdminMaterialCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createAdminMaterialCategory, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminCategories() }) });
}
export function useUpdateAdminMaterialCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<{ name: string; sortOrder: number; status: number }> }) => updateAdminMaterialCategory(id, body), onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminCategories() }) });
}
export function useDeleteAdminMaterialCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: deleteAdminMaterialCategory, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminCategories() }) });
}
export function useAdminMaterialItems(categoryId?: number) {
  return useQuery({ queryKey: materialQueryKeys.adminItems(categoryId), queryFn: () => fetchAdminMaterialItems(categoryId) });
}
export function useCreateAdminMaterialItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createAdminMaterialItem, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}
export function useUpdateAdminMaterialItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Record<string, unknown>> }) => updateAdminMaterialItem(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }),
  });
}
export function useDeleteAdminMaterialItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: deleteAdminMaterialItem, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}
export function useAdminMaterialRecycle(params: { page: number; size: number }) {
  return useQuery({ queryKey: [...materialQueryKeys.adminItems(), "recycle", params], queryFn: () => fetchAdminMaterialRecycle(params) });
}
export function useRestoreAdminMaterialRecycle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: restoreAdminMaterialRecycle, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}
export function usePurgeAdminMaterialRecycle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (ids: number[]) => purgeAdminMaterialRecycleByIds(ids), onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}
export function usePurgeAllAdminMaterialRecycle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: purgeAllAdminMaterialRecycle, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}
export function useAdjustMaterialStock() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, newQty }: { id: number; newQty: number }) => adjustMaterialStock(id, newQty), onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}
export function useInboundMaterialItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: inboundMaterialItem, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}
export function usePendingMaterialRequests() {
  return useQuery({
    queryKey: materialQueryKeys.pendingRequests(),
    queryFn: fetchPendingMaterialRequests,
    ...studentReviewPendingQueryOptions,
  });
}
export function useAllMaterialRequests(params: { page: number; size: number; status?: string }) {
  return useQuery({ queryKey: materialQueryKeys.allRequests(params), queryFn: () => fetchAllMaterialRequests(params) });
}
export function useFinishedMaterialRequests(params: { page: number; size: number }) {
  return useQuery({ queryKey: materialQueryKeys.finishedRequests(params), queryFn: () => fetchFinishedMaterialRequests(params) });
}
export function useApproveMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: approveMaterialRequest,
    onSuccess: (updated) => {
      mergeMaterialReviewAfterApprove(qc, updated, MATERIAL_REVIEW_FINISHED_PAGE);
      window.dispatchEvent(new Event("aro-admin-refresh-pending-badges"));
    },
  });
}
export function useRejectMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rejectMaterialRequest,
    onSuccess: (_data, id) => {
      mergeMaterialReviewAfterReject(qc, id, MATERIAL_REVIEW_FINISHED_PAGE);
      window.dispatchEvent(new Event("aro-admin-refresh-pending-badges"));
    },
  });
}
export function useRevokeMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokeMaterialRequest,
    onSuccess: (_data, id) => {
      mergeMaterialReviewAfterRevoke(qc, id, MATERIAL_REVIEW_FINISHED_PAGE);
      window.dispatchEvent(new Event("aro-admin-refresh-pending-badges"));
    },
  });
}
export function useDeleteMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteMaterialRequest,
    onSuccess: (_data, id) => {
      removeMaterialReviewRequestFromCaches(qc, id, MATERIAL_REVIEW_FINISHED_PAGE);
    },
  });
}
export function useFulfillMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lines }: { id: string; lines: { lineId: number; grant: boolean; fulfillQty?: number }[] }) => fulfillMaterialRequest(id, lines),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }),
  });
}
export function useMaterialStatsOverview(from?: string, to?: string) {
  return useQuery({ queryKey: materialQueryKeys.statsOverview(from, to), queryFn: () => fetchMaterialStatsOverview(from, to) });
}
export function useMaterialAuditTrail(params: { from?: string; to?: string; categoryId?: number; groupId?: string; page: number; size: number }) {
  return useQuery({ queryKey: materialQueryKeys.auditTrail(params), queryFn: () => fetchMaterialAuditTrail(params) });
}
