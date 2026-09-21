import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fetchRoomBookmarkIds, toggleRoomBookmarkApi } from "@/api/domains/cageShelf.api";

/**
 * **房间级收藏**（笼架信息页左侧树：房间名后面那枚星标）。
 *
 * 2026-09-19 口径：收藏粒度从「笼架」改到「房间」——收藏某个笼架实用性不强。老表
 * `cage_shelf_bookmark` 保留只读、界面不再写；这里只跟 `cage_shelf_room_bookmark` 打交道。
 *
 * 切换走**乐观更新**：收藏是高频小动作，等一个来回才变色像卡住；失败再翻回来并提示。
 */
export function useRoomBookmarks() {
  const [rooms, setRooms] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchRoomBookmarkIds()
      .then((ids) => { if (!cancelled) setRooms(new Set(ids)); })
      // 读不到就当没有收藏（后端没部署到这一版时也一样降级，不弹错）
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const flip = useCallback((roomId: string, on: boolean) => {
    setRooms((prev) => {
      const n = new Set(prev);
      if (on) n.add(roomId); else n.delete(roomId);
      return n;
    });
  }, []);

  const toggleRoom = useCallback(async (roomId: string) => {
    const next = !rooms.has(roomId);
    flip(roomId, next);
    try {
      await toggleRoomBookmarkApi(roomId);
    } catch {
      flip(roomId, !next);
      toast.error("收藏操作失败，请重试");
    }
  }, [rooms, flip]);

  return { rooms, toggleRoom };
}
