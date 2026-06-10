import { useQuery } from "@tanstack/react-query";
import { searchKnowledgePages } from "@/api/domains/knowledge.api";

export function useKnowledgeSearch(q: string, categoryId?: number) {
  return useQuery({
    queryKey: ['knowledge', 'search', q, categoryId],
    queryFn: () => searchKnowledgePages(q, categoryId),
    enabled: q.length > 0,
    staleTime: 0,
  });
}
