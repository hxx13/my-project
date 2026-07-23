import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  createRepairOrder,
  fetchRepairOrders,
  fetchRepairOrderDetail,
  startRepairOrder,
  completeRepairOrder,
  withdrawRepairOrder,
  deleteRepairOrder,
  fetchRepairRecycle,
  purgeRepairRecycleByIds,
  purgeAllRepairRecycle,
  restoreRepairRecycle,
} from "@/api/domains/repair.api";
import { toast } from "react-hot-toast";

export function useRepairList(params: {
  page: number;
  size: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  includePrivate?: boolean;
  onlyMine?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.repair.list(params),
    queryFn: () => fetchRepairOrders(params),
    placeholderData: (prev) => prev,
  });
}

export function useRepairDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.repair.detail(id),
    queryFn: () => fetchRepairOrderDetail(id),
    enabled: !!id,
  });
}

export function useRepairRecycle(params: { page: number; size: number }) {
  return useQuery({
    queryKey: queryKeys.repair.recycle(params),
    queryFn: () => fetchRepairRecycle(params),
    placeholderData: (prev) => prev,
  });
}

export function useCreateRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRepairOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success("报修申请已提交");
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });
}

export function useStartRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startRepairOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success("已开始处理");
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}

export function useCompleteRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { resultRemark: string; resultImages: string[] } }) =>
      completeRepairOrder(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success("已标记完成");
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}

export function useWithdrawRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: withdrawRepairOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success("已撤回");
    },
    onError: (e: Error) => toast.error(e.message || "撤回失败"),
  });
}

export function useDeleteRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRepairOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success("已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function usePurgeRepairRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeRepairRecycleByIds,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success(`已清除 ${data?.deleted ?? 0} 条`);
    },
    onError: (e: Error) => toast.error(e.message || "清除失败"),
  });
}

export function usePurgeAllRepairRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeAllRepairRecycle,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success(`已全部清除 ${data?.deleted ?? 0} 条`);
    },
    onError: (e: Error) => toast.error(e.message || "清除失败"),
  });
}

export function useRestoreRepairRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreRepairRecycle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.repair.all });
      toast.success("已恢复");
    },
    onError: (e: Error) => toast.error(e.message || "恢复失败"),
  });
}
