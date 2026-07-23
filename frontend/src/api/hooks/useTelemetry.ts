import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  fetchTelemetryArchivePurgeConfig,
  saveTelemetryArchivePurgeConfig,
  fetchTelemetryArchiveStorageStats,
} from "@/api/domains/telemetryArchive.api";
import { toast } from "react-hot-toast";

export function useTelemetryPurgeConfig() {
  return useQuery({
    queryKey: [...queryKeys.telemetry.all, "purgeConfig"] as const,
    queryFn: fetchTelemetryArchivePurgeConfig,
  });
}

export function useSaveTelemetryPurgeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveTelemetryArchivePurgeConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...queryKeys.telemetry.all, "purgeConfig"] });
      toast.success("配置已保存");
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
}

export function useTelemetryStorageStats() {
  return useQuery({
    queryKey: [...queryKeys.telemetry.all, "storageStats"] as const,
    queryFn: fetchTelemetryArchiveStorageStats,
  });
}
