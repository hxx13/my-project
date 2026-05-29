import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  createPurchaseOrder,
  fetchPurchaseOrders,
  fetchPurchaseOrderDetail,
  startPurchaseOrder,
  completePurchaseOrder,
  withdrawPurchaseOrder,
  deletePurchaseOrder,
  fetchPurchaseRecycle,
  purgePurchaseRecycleByIds,
  purgeAllPurchaseRecycle,
  restorePurchaseRecycle,
} from "@/api/domains/purchase.api";
import { toast } from "react-hot-toast";

export function usePurchaseList(params: {
  page: number;
  size: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  includePrivate?: boolean;
  onlyMine?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.purchase.list(params),
    queryFn: () => fetchPurchaseOrders(params),
    placeholderData: (prev) => prev,
  });
}

export function usePurchaseDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.purchase.detail(id),
    queryFn: () => fetchPurchaseOrderDetail(id),
    enabled: !!id,
  });
}

export function usePurchaseRecycle(params: { page: number; size: number }) {
  return useQuery({
    queryKey: queryKeys.purchase.recycle(params),
    queryFn: () => fetchPurchaseRecycle(params),
    placeholderData: (prev) => prev,
  });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchase.all });
      toast.success("申购申请已提交");
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });
}

export function useStartPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startPurchaseOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchase.all });
      toast.success("已开始处理");
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}

export function useCompletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { resultRemark: string; resultImages: string[] } }) =>
      completePurchaseOrder(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchase.all });
      toast.success("已标记完成");
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}

export function useWithdrawPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: withdrawPurchaseOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchase.all });
      toast.success("已撤回");
    },
    onError: (e: Error) => toast.error(e.message || "撤回失败"),
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePurchaseOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchase.all });
      toast.success("已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function usePurgePurchaseRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgePurchaseRecycleByIds,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.purchase.all });
      toast.success(`已清除 ${data?.deleted ?? 0} 条`);
    },
    onError: (e: Error) => toast.error(e.message || "清除失败"),
  });
}

export function usePurgeAllPurchaseRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeAllPurchaseRecycle,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.purchase.all });
      toast.success(`已全部清除 ${data?.deleted ?? 0} 条`);
    },
    onError: (e: Error) => toast.error(e.message || "清除失败"),
  });
}

export function useRestorePurchaseRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restorePurchaseRecycle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchase.all });
      toast.success("已恢复");
    },
    onError: (e: Error) => toast.error(e.message || "恢复失败"),
  });
}
