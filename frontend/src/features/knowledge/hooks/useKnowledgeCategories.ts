import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgeTree } from "@/api/domains/knowledge.api";

export function useKnowledgeCategories() {
  return useQuery({
    queryKey: ["knowledge", "tree"],
    queryFn: fetchKnowledgeTree,
    staleTime: 1000 * 60 * 5,
  });
}
