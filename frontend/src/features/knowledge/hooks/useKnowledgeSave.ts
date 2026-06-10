import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createKnowledgePage, updateKnowledgePage } from "@/api/domains/knowledge.api";
import type { KnowledgePageSaveRequest } from "@/features/knowledge/types";

export function useKnowledgeSave(pageId?: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: KnowledgePageSaveRequest) =>
      pageId ? updateKnowledgePage(pageId, data) : createKnowledgePage(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}
