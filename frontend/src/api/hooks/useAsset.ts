import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  fetchAssetRecords,
  searchAssets,
  createAssetRecord,
  patchAssetRecord,
  deleteAssetRecord,
  submitTransferRequest,
  fetchTransferRecords,
  completeTransferRequest,
  withdrawTransferRequest,
  deleteTransferRecordAdmin,
  fetchAssetRecycle,
  restoreRecycleAsset,
  purgeRecycleAsset,
  importAssetExcel,
  lockAsset,
} from "@/api/domains/asset.api";
import { toast } from "react-hot-toast";

export function useAssetList(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.asset.list(params),
    queryFn: () => fetchAssetRecords(params as Parameters<typeof fetchAssetRecords>[0]),
    placeholderData: (prev) => prev,
  });
}

export function useAssetSearch(keyword: string, limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.asset.all, "search", keyword, limit] as const,
    queryFn: () => searchAssets(keyword, limit),
    enabled: keyword.length > 0,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAssetRecord,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("资产已创建");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof patchAssetRecord>[1] }) =>
      patchAssetRecord(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("资产已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAssetRecord,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("资产已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useLockAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: lockAsset,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("资产已锁定");
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}

export function useImportAssetExcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importAssetExcel,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success(`导入完成：新增 ${data.created}，更新 ${data.updated}`);
    },
    onError: (e: Error) => toast.error(e.message || "导入失败"),
  });
}

export function useCreateAssetTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: submitTransferRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("调拨申请已提交");
    },
    onError: (e: Error) => toast.error(e.message || "申请失败"),
  });
}

export function useAssetTransfers(params: Record<string, unknown>) {
  return useQuery({
    queryKey: [...queryKeys.asset.all, "transfers", params] as const,
    queryFn: () => fetchTransferRecords(params as Parameters<typeof fetchTransferRecords>[0]),
    placeholderData: (prev) => prev,
  });
}

export function useCompleteAssetTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: completeTransferRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("调拨已完成");
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}

export function useWithdrawAssetTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: withdrawTransferRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("已撤回");
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}

export function useDeleteAssetTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTransferRecordAdmin,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useAssetRecycle(params: { page: number; size: number; keyword?: string }) {
  return useQuery({
    queryKey: [...queryKeys.asset.all, "recycle", params] as const,
    queryFn: () => fetchAssetRecycle(params),
    placeholderData: (prev) => prev,
  });
}

export function useRestoreAssetRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreRecycleAsset,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("已恢复");
    },
    onError: (e: Error) => toast.error(e.message || "恢复失败"),
  });
}

export function usePurgeAssetRecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeRecycleAsset,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("已永久清除");
    },
    onError: (e: Error) => toast.error(e.message || "清除失败"),
  });
}
