import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  fetchRefDataList,
  fetchRefDataDetail,
  createRefData,
  updateRefData,
  deleteRefData,
  fetchRefDataOptions,
  fetchSpecTemplates,
  createSpecTemplate,
  updateSpecTemplate,
  deleteSpecTemplate,
  fetchCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  markCartPackageReady,
  withdrawCartPackage,
  fetchOrders,
  submitOrder,
  fetchOrderDetail,
  fetchOrderLogs,
  fetchAllOrders,
  updateOrderStatus,
  fetchApprovedAups,
} from "@/api/domains/referenceData.api";
import { toast } from "react-hot-toast";

// ── Read hooks ──

export function useRefDataList(typeKey: string, parentId?: number) {
  return useQuery({
    queryKey: queryKeys.referenceData.list(typeKey, parentId),
    queryFn: () => fetchRefDataList(typeKey, { parentId }),
    enabled: !!typeKey,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRefDataDetail(typeKey: string, id: number) {
  return useQuery({
    queryKey: queryKeys.referenceData.detail(typeKey, id),
    queryFn: () => fetchRefDataDetail(typeKey, id),
    enabled: !!typeKey && !!id,
  });
}

export function useRefDataOptions(typeKey: string) {
  return useQuery({
    queryKey: queryKeys.referenceData.options(typeKey),
    queryFn: () => fetchRefDataOptions(typeKey),
    enabled: !!typeKey,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSpecTemplates() {
  return useQuery({
    queryKey: queryKeys.referenceData.specTemplates,
    queryFn: fetchSpecTemplates,
    staleTime: 10 * 60 * 1000,
  });
}

export function useRefCart(groupId: string) {
  return useQuery({
    queryKey: queryKeys.referenceData.cart(groupId),
    queryFn: () => fetchCart(groupId),
    enabled: !!groupId,
    refetchInterval: 15_000,
  });
}

export function useOrders(groupId: string) {
  return useQuery({
    queryKey: queryKeys.referenceData.orders({ groupId } as Record<string, unknown>),
    queryFn: () => fetchOrders(groupId),
    enabled: !!groupId,
    placeholderData: (prev) => prev,
  });
}

export function useOrderDetail(id: number) {
  return useQuery({
    queryKey: queryKeys.referenceData.orderDetail(id),
    queryFn: () => fetchOrderDetail(id),
    enabled: !!id,
  });
}

export function useOrderLogs(id: number) {
  return useQuery({
    queryKey: queryKeys.referenceData.orderLogs(id),
    queryFn: () => fetchOrderLogs(id),
    enabled: !!id,
  });
}

export function useAllOrders(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: queryKeys.referenceData.allOrders(page, pageSize),
    queryFn: () => fetchAllOrders(page, pageSize),
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateOrderStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.referenceData.all });
      toast.success("订单状态已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

// ── Mutation hooks ──

export function useCreateRefData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ typeKey, body }: { typeKey: string; body: Record<string, unknown> }) =>
      createRefData(typeKey, body),
    onSuccess: (_data, { typeKey }) => {
      qc.invalidateQueries({ queryKey: queryKeys.referenceData.all });
      toast.success("数据已创建");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useUpdateRefData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ typeKey, id, body }: { typeKey: string; id: number; body: Record<string, unknown> }) =>
      updateRefData(typeKey, id, body),
    onSuccess: (_data, { typeKey, id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.referenceData.all });
      qc.invalidateQueries({ queryKey: queryKeys.referenceData.detail(typeKey, id) });
      toast.success("数据已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteRefData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ typeKey, id }: { typeKey: string; id: number }) =>
      deleteRefData(typeKey, id),
    onSuccess: (_data, { typeKey }) => {
      qc.invalidateQueries({ queryKey: queryKeys.referenceData.all });
      toast.success("数据已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useCreateSpecTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSpecTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.referenceData.specTemplates });
      toast.success("规格模板已创建");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useUpdateSpecTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      updateSpecTemplate(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.referenceData.specTemplates });
      toast.success("规格模板已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteSpecTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSpecTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.referenceData.specTemplates });
      toast.success("规格模板已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, groupId }: { body: Parameters<typeof addToCart>[0]; groupId: string }) => addToCart(body, groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referenceData", "cart"] });
    },
    onError: (e: Error) => toast.error(e.message || "加入购物车失败"),
  });
}

export function useUpdateCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: { quantity?: number; specSelections?: Record<string, string> } }) =>
      updateCartItem(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referenceData", "cart"] });
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useRemoveCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeCartItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referenceData", "cart"] });
      toast.success("已移除");
    },
    onError: (e: Error) => toast.error(e.message || "移除失败"),
  });
}

export function useClearCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => clearCart(groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referenceData", "cart"] });
      toast.success("购物车已清空");
    },
    onError: (e: Error) => toast.error(e.message || "清空失败"),
  });
}

export function useMarkCartPackageReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, body }: { groupId: string; body?: { cartIds?: number[]; packageRemark?: string } }) =>
      markCartPackageReady(groupId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referenceData", "cart"] });
      toast.success("已提交给 PI");
    },
    onError: (e: Error) => toast.error(e.message || "提交订单包失败"),
  });
}

export function useWithdrawCartPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, body }: { groupId: string; body?: { cartIds?: number[] } }) =>
      withdrawCartPackage(groupId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referenceData", "cart"] });
      toast.success("已撤回订单包");
    },
    onError: (e: Error) => toast.error(e.message || "撤回失败"),
  });
}

export function useSubmitOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: submitOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.referenceData.all });
      toast.success("订单已提交");
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });
}

/** 拉取本课题组已批准 AUP（下单必选 AUP 下拉） */
export function useApprovedAups(projectGroupName?: string) {
  return useQuery({
    queryKey: ["approved-aups", projectGroupName],
    queryFn: () => fetchApprovedAups(projectGroupName),
    enabled: !!projectGroupName,
    staleTime: 5 * 60 * 1000,
  });
}
