import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgeStats } from "@/api/domains/knowledge.api";

export function useKnowledgeStats() {
  return useQuery({
    queryKey: ["knowledge", "stats"],
    queryFn: fetchKnowledgeStats,
    staleTime: 1000 * 60 * 2,
  });
}
