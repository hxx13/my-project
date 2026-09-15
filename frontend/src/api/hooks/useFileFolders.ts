import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  fetchFileFolderTree,
  createFileFolder,
  updateFileFolder,
  deleteFileFolder,
} from "@/api/domains/fileFolders.api";
import { toast } from "react-hot-toast";

export function useFileFolderTree() {
  return useQuery({
    queryKey: queryKeys.fileFolder.tree(),
    queryFn: fetchFileFolderTree,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.fileFolder.all });
}

export function useCreateFileFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createFileFolder,
    onSuccess: () => {
      invalidate(qc);
      toast.success("文件夹已新增");
    },
    onError: (e: Error) => toast.error(e.message || "新增失败"),
  });
}

export function useUpdateFileFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateFileFolder>[1] }) =>
      updateFileFolder(id, payload),
    onSuccess: () => {
      invalidate(qc);
      toast.success("文件夹已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteFileFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteFileFolder,
    onSuccess: () => {
      invalidate(qc);
      toast.success("文件夹已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}
