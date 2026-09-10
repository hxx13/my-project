import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchFullTree,
  fetchLocalShelfGridsBatch,
  fetchCageOpMarkers,
  type CageShelfCell,
} from "@/api/domains/cageShelf.api";
import { buildCageOpMarks } from "@/features/cage-shelf/useCageOpSelect";
import { rackMatchesGroup } from "./groupMatch";

export interface FloorPlanRack {
  shelveId: string;
  shelveName: string;
  cells: CageShelfCell[];
  /** 该架是否拿到了网格数据（与「有架但格子全空」不同） */
  hasData: boolean;
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
 *
 * 网格数据取**本地表单真相源**（cage_cell_index + cage_cell_detail，状态/课题组/实验员
 * 以 cage_info_value 覆盖），与房间来源同源。
 * 曾用 cage_shelf_cell_snapshot 快照：它是历史扫描批次，且后端 selectLatestByPairs 用
 * MAX(scan_batch_id) 挑批次（字符串比较）会挑到旧批次，课题组/实验员字段为空，
 * 整架被判「非本组」而不渲染——房间能选中、架子却是空的。
 */
export function useRoomFloorPlan(
  roomId: string | number | null | undefined,
  roomName: string | null | undefined,
  myGroup: string | null | undefined,
) {
  const treeQuery = useQuery({
    // 与 student-cage-shelf / AdminCageShelfPage 共用同一缓存键，避免同一份全量树被拉两遍
    queryKey: ["cageShelfFullTree"],
    queryFn: fetchFullTree,
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(roomId) || Boolean(roomName && roomName.trim()),
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

  const shelfIndexIds = useMemo(
    () => shelves.map((s) => s.id).filter((id) => id !== null && id !== undefined),
    [shelves],
  );

  const gridsQuery = useQuery({
    queryKey: ["room-floor-plan-grids", shelfIndexIds.join(",")],
    queryFn: () => fetchLocalShelfGridsBatch(shelfIndexIds),
    enabled: shelfIndexIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // 待审分笼/转移（「分笼审核中」「转移审核中」）：与笼架页共用缓存键
  const markersQuery = useQuery({
    queryKey: ["cage-op", "markers"],
    queryFn: fetchCageOpMarkers,
    staleTime: 60 * 1000,
  });
  const opMarkByCageId = useMemo(
    () => buildCageOpMarks(markersQuery.data ?? []),
    [markersQuery.data],
  );

  const data = useMemo((): RoomFloorPlanData => {
    const byShelfIndexId = new Map<string, CageShelfCell[]>();
    for (const detail of gridsQuery.data ?? []) {
      const key = detail.shelfMeta?.shelfIndexId ?? detail.shelfMeta?.shelveId;
      if (key === null || key === undefined || String(key) === "") continue;
      byShelfIndexId.set(String(key), detail.grid ?? []);
    }
    const racks: FloorPlanRack[] = shelves.map((s) => {
      const cells = byShelfIndexId.get(String(s.id)) ?? [];
      return {
        shelveId: String(s.shelveId),
        shelveName: s.shelveName || String(s.shelveId),
        cells,
        hasData: cells.length > 0,
        isMine: rackMatchesGroup(cells, myGroup),
      };
    });
    return { racks, mineCount: racks.filter((r) => r.isMine).length };
  }, [shelves, gridsQuery.data, myGroup]);

  return {
    data,
    opMarkByCageId,
    isLoading: treeQuery.isLoading || (shelfIndexIds.length > 0 && gridsQuery.isLoading),
    isError: treeQuery.isError || gridsQuery.isError,
  };
}
