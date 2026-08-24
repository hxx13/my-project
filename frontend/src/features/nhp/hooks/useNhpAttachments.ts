import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  deleteNhpAttachment,
  downloadNhpAttachment,
  fetchNhpAttachments,
  uploadNhpAttachment,
} from "../api/nhpAttachment.api";

export const nhpAttachmentKeys = {
  list: (recordId: number) => ["nhp", "attachments", recordId] as const,
};

export function useNhpAttachments(recordId?: number | null, operatorId?: string) {
  const qc = useQueryClient();
  const id = recordId ?? 0;

  const listQuery = useQuery({
    queryKey: nhpAttachmentKeys.list(id),
    queryFn: () => fetchNhpAttachments(id),
    enabled: !!recordId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      if (!recordId) throw new Error("缺少表单实例 id");
      return uploadNhpAttachment(recordId, file, operatorId);
    },
    onSuccess: () => {
      if (recordId) qc.invalidateQueries({ queryKey: nhpAttachmentKeys.list(recordId) });
    },
    onError: (e: Error) => toast.error(e.message || "上传失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => {
      if (!recordId) throw new Error("缺少表单实例 id");
      return deleteNhpAttachment(recordId, fileId);
    },
    onSuccess: () => {
      if (recordId) qc.invalidateQueries({ queryKey: nhpAttachmentKeys.list(recordId) });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const download = useCallback((fileId: number) => downloadNhpAttachment(fileId), []);

  return { listQuery, uploadMutation, deleteMutation, download };
}
