import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  fetchAssetLocationTree,
  createAssetLocation,
  updateAssetLocation,
  deleteAssetLocation,
} from "@/api/domains/assetLocation.api";
import { moveAssetLocation, batchMoveAssetLocation } from "@/api/domains/asset.api";
import { toast } from "react-hot-toast";

export function useAssetLocationTree() {
  return useQuery({
    queryKey: [...queryKeys.asset.all, "location-tree"] as const,
    queryFn: fetchAssetLocationTree,
  });
}

export function useCreateAssetLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAssetLocation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("地点已新增");
    },
    onError: (e: Error) => toast.error(e.message || "新增失败"),
  });
}

export function useUpdateAssetLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateAssetLocation>[1] }) =>
      updateAssetLocation(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("地点已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteAssetLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAssetLocation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("地点已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useMoveAssetLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, nodeId }: { assetId: string; nodeId: number }) =>
      moveAssetLocation(assetId, nodeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      toast.success("资产已移动到新地点");
    },
    onError: (e: Error) => toast.error(e.message || "移动失败"),
  });
}

export function useBatchMoveAssetLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: batchMoveAssetLocation,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      const failed = data.failed?.length ?? 0;
      if (failed > 0) {
        toast.error(`已移动 ${data.moved} 条，${failed} 条失败`);
      } else {
        toast.success(`已移动 ${data.moved} 条资产`);
      }
    },
    onError: (e: Error) => toast.error(e.message || "批量移动失败"),
  });
}
