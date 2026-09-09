import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFullTree, fetchShelfCellsBatch, type CageShelfCell } from "@/api/domains/cageShelf.api";
import { snapshotCellToShelfCell } from "@/features/cage-shelf/components/ShelfGrid";
import { rackMatchesGroup } from "./groupMatch";

export interface FloorPlanRack {
  shelveId: string;
  shelveName: string;
  cells: CageShelfCell[];
  isMine: boolean;
}

export interface RoomFloorPlanData {
  racks: FloorPlanRack[];
  mineCount: number;
}

/**
 * 按房间取笼架平面图数据。
 * @param roomId   笼架房间 ID（口径见设计文档 D2b / Task 0 结论）
 * @param roomName 房间名（ID 口径不一致时用于回退匹配）
 * @param myGroup  刷卡人的课题组字段（project_group_name，可能为多课题组分隔串）
 */
export function useRoomFloorPlan(
  roomId: string | number | null | undefined,
  roomName: string | null | undefined,
  myGroup: string | null | undefined,
) {
  const treeQuery = useQuery({
    queryKey: ["cage-full-tree"],
    queryFn: fetchFullTree,
    staleTime: 10 * 60 * 1000,
  });

  const shelves = useMemo(() => {
    const rows = treeQuery.data ?? [];
    if (!rows.length) return [];
    const byId = roomId != null && String(roomId) !== ""
      ? rows.filter((r) => String(r.roomId) === String(roomId))
      : [];
    if (byId.length) return byId;
    // ID 口径不一致时回退按房间名匹配
    if (roomName && roomName.trim()) {
      const target = roomName.trim();
      return rows.filter((r) => (r.roomName || "").trim() === target);
    }
    return [];
  }, [treeQuery.data, roomId, roomName]);

  const pairs = useMemo(
    () => shelves.map((s) => `${s.roomId}:${s.shelveId}`),
    [shelves],
  );

  const cellsQuery = useQuery({
    queryKey: ["room-floor-plan-cells", pairs.join(",")],
    queryFn: () => fetchShelfCellsBatch(pairs),
    enabled: pairs.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const data = useMemo((): RoomFloorPlanData => {
    const byKey = new Map<string, CageShelfCell[]>();
    for (const entry of cellsQuery.data ?? []) {
      byKey.set(entry.key, (entry.cells ?? []).map(snapshotCellToShelfCell));
    }
    const racks: FloorPlanRack[] = shelves.map((s) => {
      const cells = byKey.get(`${s.roomId}:${s.shelveId}`) ?? [];
      return {
        shelveId: String(s.shelveId),
        shelveName: s.shelveName || String(s.shelveId),
        cells,
        isMine: rackMatchesGroup(cells, myGroup),
      };
    });
    return { racks, mineCount: racks.filter((r) => r.isMine).length };
  }, [shelves, cellsQuery.data, myGroup]);

  return {
    data,
    isLoading: treeQuery.isLoading || (pairs.length > 0 && cellsQuery.isLoading),
    isError: treeQuery.isError || cellsQuery.isError,
  };
}
