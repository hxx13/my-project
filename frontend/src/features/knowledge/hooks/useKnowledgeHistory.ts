import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgeHistory } from "@/api/domains/knowledge.api";

export function useKnowledgeHistory(pageId: number | null) {
  return useQuery({
    queryKey: ["knowledge", "history", pageId],
    queryFn: () => fetchKnowledgeHistory(pageId!),
    enabled: !!pageId,
    staleTime: 1000 * 60 * 2,
  });
}
