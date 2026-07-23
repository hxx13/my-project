import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  fetchCageShelfFilterOptions,
  fetchCageShelfDetail,
  fetchCageShelfIndexes,
  importCageShelfCsv,
} from "@/api/domains/cageShelf.api";
import { toast } from "react-hot-toast";

export function useCageShelfFilterOptions(params?: {
  campusId?: number;
  areaId?: string;
  floorId?: string;
  roomId?: string;
}) {
  return useQuery({
    queryKey: queryKeys.cageShelf.filterOptions(params),
    queryFn: () => fetchCageShelfFilterOptions(params ?? {}),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCageShelfDetail(shelveId: string) {
  return useQuery({
    queryKey: queryKeys.cageShelf.shelfGrid(shelveId),
    queryFn: () => fetchCageShelfDetail(shelveId),
    enabled: !!shelveId,
  });
}

export function useCageShelfIndexes(params: {
  campusId?: number;
  areaId?: string;
  floorId?: string;
  roomId?: string;
  page?: number;
  size?: number;
}) {
  return useQuery({
    queryKey: [...queryKeys.cageShelf.all, "indexes", params] as const,
    queryFn: () => fetchCageShelfIndexes(params),
    placeholderData: (prev) => prev,
  });
}

export function useImportCageShelfCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importCageShelfCsv,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.cageShelf.all });
      toast.success(`导入完成：新增 ${data.created}，更新 ${data.updated}`);
    },
    onError: (e: Error) => toast.error(e.message || "导入失败"),
  });
}
