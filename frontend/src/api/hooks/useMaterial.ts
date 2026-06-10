import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMaterialCategories, fetchMaterialItems, fetchMaterialCart, saveMaterialCart,
  createMaterialRequest, fetchMyMaterialRequests, fetchMaterialRequestDetail,
  withdrawMaterialRequest, confirmMaterialReceive, fetchMyMaterialStats,
  fetchAdminMaterialCategories, fetchAdminMaterialItems, createAdminMaterialItem,
  updateAdminMaterialItem, inboundMaterialItem, fetchPendingMaterialRequests,
  fetchAllMaterialRequests, approveMaterialRequest, rejectMaterialRequest,
  fulfillMaterialRequest, fetchMaterialStatsOverview, fetchMaterialAuditTrail,
} from "@/api/domains/material.api";
import { materialQueryKeys } from "@/api/hooks/queryKeys";

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
    mutationFn: createMaterialRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }); qc.invalidateQueries({ queryKey: materialQueryKeys.cart() }); },
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
  return useQuery({ queryKey: materialQueryKeys.adminCategories(), queryFn: fetchAdminMaterialCategories });
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
export function useInboundMaterialItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: inboundMaterialItem, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}
export function usePendingMaterialRequests() {
  return useQuery({ queryKey: materialQueryKeys.pendingRequests(), queryFn: fetchPendingMaterialRequests });
}
export function useAllMaterialRequests(params: { page: number; size: number; status?: string }) {
  return useQuery({ queryKey: materialQueryKeys.allRequests(params), queryFn: () => fetchAllMaterialRequests(params) });
}
export function useApproveMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: approveMaterialRequest, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }) });
}
export function useRejectMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: rejectMaterialRequest, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }) });
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
