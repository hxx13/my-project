import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgePage, fetchKnowledgePageBySlug } from "@/api/domains/knowledge.api";

export function useKnowledgePage(pageId: number | null) {
  return useQuery({
    queryKey: ['knowledge', 'page', pageId],
    queryFn: () => fetchKnowledgePage(pageId!),
    enabled: pageId != null && pageId > 0,
    staleTime: 1000 * 60 * 5,
  });
}

export function useKnowledgePageBySlug(categoryId: number | null, slug: string | null) {
  return useQuery({
    queryKey: ['knowledge', 'page', categoryId, slug],
    queryFn: () => fetchKnowledgePageBySlug(categoryId!, slug!),
    enabled: categoryId != null && slug != null,
    staleTime: 1000 * 60 * 5,
  });
}
