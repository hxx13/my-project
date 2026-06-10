import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchKnowledgeHistory, rollbackKnowledgePage } from "@/api/domains/knowledge.api";

export function useKnowledgeHistory(pageId: number | null) {
  return useQuery({
    queryKey: ['knowledge', 'history', pageId],
    queryFn: () => fetchKnowledgeHistory(pageId!),
    enabled: pageId != null && pageId > 0,
    staleTime: 1000 * 60 * 2,
  });
}

export function useKnowledgeRollback(pageId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (version: number) => rollbackKnowledgePage(pageId, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'page', pageId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'history', pageId] });
    },
  });
}
