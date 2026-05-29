import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  listDahuaSwingTasks,
  createDahuaSwingTask,
  updateDahuaSwingTask,
  deleteDahuaSwingTask,
} from "@/api/domains/dahuaSwing.api";
import type { DahuaSwingTask } from "@/api/domains/dahuaSwing.api";
import { toast } from "react-hot-toast";

export function useDahuaSwingTasks() {
  return useQuery({
    queryKey: queryKeys.dahuaSwing.tasks(),
    queryFn: listDahuaSwingTasks,
    placeholderData: (prev) => prev,
  });
}

export function useCreateDahuaSwingTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDahuaSwingTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dahuaSwing.all });
      toast.success("任务已创建");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useUpdateDahuaSwingTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<DahuaSwingTask> }) =>
      updateDahuaSwingTask(id, body as DahuaSwingTask),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dahuaSwing.all });
      toast.success("任务已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteDahuaSwingTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDahuaSwingTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dahuaSwing.all });
      toast.success("任务已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}
