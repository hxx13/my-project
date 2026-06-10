import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createKnowledgePage, updateKnowledgePage, type KnowledgePageSaveRequest } from "@/api/domains/knowledge.api";

export function useKnowledgeSave(pageId?: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: KnowledgePageSaveRequest) =>
      pageId ? updateKnowledgePage(pageId, data) : createKnowledgePage(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'tree'] });
      if (pageId) {
        queryClient.invalidateQueries({ queryKey: ['knowledge', 'page', pageId] });
        queryClient.invalidateQueries({ queryKey: ['knowledge', 'history', pageId] });
      }
    },
  });
}
