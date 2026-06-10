import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createKnowledgeCategory,
  updateKnowledgeCategory,
  deleteKnowledgeCategory,
  updateCategoriesSort,
} from "@/api/domains/knowledge.api";

export function useKnowledgeCategoryManager() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['knowledge', 'tree'] });

  const createMutation = useMutation({
    mutationFn: createKnowledgeCategory,
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; slug?: string; icon?: string; description?: string; sortOrder?: number }) =>
      updateKnowledgeCategory(id, data),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKnowledgeCategory,
    onSuccess: invalidate,
  });

  const sortMutation = useMutation({
    mutationFn: updateCategoriesSort,
    onSuccess: invalidate,
  });

  return { createMutation, updateMutation, deleteMutation, sortMutation };
}
