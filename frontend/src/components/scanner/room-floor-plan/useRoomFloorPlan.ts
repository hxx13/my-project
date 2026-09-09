import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchFullTree,
  fetchShelfCellsBatch,
  type CageShelfCell,
} from "@/api/domains/cageShelf.api";
import { snapshotCellToShelfCell } from "@/features/cage-shelf/components/ShelfGrid";
import { rackMatchesGroup } from "./groupMatch";

export interface FloorPlanRack {
  shelveId: string;
  shelveName: string;
  cells: CageShelfCell[];
  /**
   * 批量接口是否为该架返回了条目。
   * false = 后端没有该架的笼位快照数据（与「有架但格子全空」不同），
   * 后端 groupByShelf 只对有数据的架输出条目。
   */
  hasData: boolean;
  isMine: boolean;
}

export interface RoomFloorPlanData {
  racks: FloorPlanRack[];
  mineCount: number;
}

/**
 * 后端 `cells/batch` 返回的是 `SELECT *` 的原始列名（snake_case），
 * 而 `snapshotCellToShelfCell` 按 camelCase 读——这里补一层归一化。
 */
function normalizeSnapshotCell(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    roomId: raw.roomId ?? raw.room_id,
    shelveId: raw.shelveId ?? raw.shelve_id,
    positionX: raw.positionX ?? raw.position_x,
    positionY: raw.positionY ?? raw.position_y,
    positionLabel: raw.positionLabel ?? raw.position_label,
    animalCageType: raw.animalCageType ?? raw.animal_cage_type,
    cageBoxJson: raw.cageBoxJson ?? raw.cage_box_json,
    specialStatusesJson: raw.specialStatusesJson ?? raw.special_statuses_json,
  };
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

  // key 必须与后端 groupByShelf 的回显格式严格一致（roomId:shelveId）
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
    // 不信任 entry.key：后端 groupByShelf 按 camelCase 取 snake_case 行的字段，key 恒为 "null:null"。
    // 改为按每个 cell 自己的 roomId/shelveId 重新分组。
    const byKey = new Map<string, CageShelfCell[]>();
    for (const entry of cellsQuery.data ?? []) {
      for (const raw of entry.cells ?? []) {
        const normalized = normalizeSnapshotCell(raw as unknown as Record<string, unknown>);
        const k = `${String(normalized.roomId)}:${String(normalized.shelveId)}`;
        const cell = snapshotCellToShelfCell(normalized);
        const list = byKey.get(k);
        if (list) list.push(cell);
        else byKey.set(k, [cell]);
      }
    }
    const racks: FloorPlanRack[] = shelves.map((s) => {
      const cells = byKey.get(`${s.roomId}:${s.shelveId}`) ?? [];
      return {
        shelveId: String(s.shelveId),
        shelveName: s.shelveName || String(s.shelveId),
        cells,
        hasData: cells.length > 0,
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
