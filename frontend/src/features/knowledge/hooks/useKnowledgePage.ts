import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgePage } from "@/api/domains/knowledge.api";

export function useKnowledgePage(pageId: number | null) {
  return useQuery({
    queryKey: ["knowledge", "page", pageId],
    queryFn: () => fetchKnowledgePage(pageId!),
    enabled: !!pageId,
    staleTime: 1000 * 60 * 5,
  });
}
