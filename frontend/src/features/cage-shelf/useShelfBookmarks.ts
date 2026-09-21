import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fetchBookmarks, toggleBookmarkApi } from "@/api/domains/cageShelf.api";

/**
 * **笼架级**收藏（老表 `cage_shelf_bookmark` + 那两个一直在的接口）。
 *
 * 与房间级（{@link useRoomBookmarks}）并存：2026-09-19 口径是「房间级为主」，
 * 但笼架级保留 —— 手机端/小程序的列表里笼架名后面也有一枚星标，
 * 「收藏一架、下次直接点进去」比先展开房间更快。
 *
 * 切换同样走乐观更新、失败回滚并提示。
 */
export function useShelfBookmarks() {
  const [shelves, setShelves] = useState<Set<string>>(new Set());   // shelveId

  useEffect(() => {
    let cancelled = false;
    fetchBookmarks()
      .then((list) => { if (!cancelled) setShelves(new Set(list.map((b) => String(b.shelveId)))); })
      .catch(() => {});   // 读不到就当没收藏（不弹错）
    return () => { cancelled = true; };
  }, []);

  const flip = useCallback((shelveId: string, on: boolean) => {
    setShelves((prev) => {
      const n = new Set(prev);
      if (on) n.add(shelveId); else n.delete(shelveId);
      return n;
    });
  }, []);

  const toggleShelf = useCallback(async (roomId: string, shelveId: string) => {
    const next = !shelves.has(shelveId);
    flip(shelveId, next);
    try {
      await toggleBookmarkApi(roomId, shelveId);
    } catch {
      flip(shelveId, !next);
      toast.error("收藏操作失败，请重试");
    }
  }, [shelves, flip]);

  return { shelves, toggleShelf };
}
