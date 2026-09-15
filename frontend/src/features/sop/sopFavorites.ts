import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addSopFavorite, fetchSopFavorites, removeSopFavorite } from "@/api/domains/sop.api";

/**
 * SOP 文档收藏，**存后端**（`sop_favorite` 表，按人存）。
 *
 * 不用 localStorage：收藏是数据不是界面偏好，换台机器/换个浏览器就该还在，
 * 同一台共用机上一个账号也该看到自己的那份。
 *
 * 只收藏文档、不收藏分类：分类在树里点两下就到，真正省事的是常用文档。
 */
export const sopFavoritesQueryKey = ["sop", "favorites"] as const;

export function useSopFavorites() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: sopFavoritesQueryKey,
    queryFn: fetchSopFavorites,
    staleTime: 60_000,
  });
  const favorites = data ?? [];

  /**
   * 乐观更新：点星标要立刻变色，等一个来回再翻状态会像「没点上」。
   * 失败回滚到快照，成功后再以服务端为准（`invalidateQueries`）。
   */
  const toggleMutation = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: boolean }) => {
      if (next) await addSopFavorite(id);
      else await removeSopFavorite(id);
    },
    onMutate: async ({ id, next }) => {
      await qc.cancelQueries({ queryKey: sopFavoritesQueryKey });
      const prev = qc.getQueryData<number[]>(sopFavoritesQueryKey) ?? [];
      qc.setQueryData<number[]>(
        sopFavoritesQueryKey,
        next ? [id, ...prev.filter((x) => x !== id)] : prev.filter((x) => x !== id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(sopFavoritesQueryKey, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: sopFavoritesQueryKey }),
  });

  return {
    favorites,
    isFavorite: (id: number) => favorites.includes(id),
    toggle: (id: number) => toggleMutation.mutate({ id, next: !favorites.includes(id) }),
  };
}
