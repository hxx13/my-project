import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchFullTree,
  fetchLocalShelfGridsBatch,
  fetchCageOpMarkers,
  fetchActiveCageStatusAlerts,
  type CageShelfCell,
  type CageShelfDetail,
  type ActiveCageStatusAlert,
} from "@/api/domains/cageShelf.api";
import { fetchActiveCageReservations } from "@/api/domains/animalOrderCage.api";
import { buildCageOpMarks, mergeReservationMarks, mergeAlertMarks } from "@/features/cage-shelf/useCageOpSelect";
import { rackMatchesGroup } from "./groupMatch";

/** /cage-status-alert/active 的 cageIds 一次最多带 2000 个（后端 MAX_CAGE_IDS），超过分批拉 */
const ALERT_CAGE_IDS_LIMIT = 2000;

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
  viewerUserId?: string | null,
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
    queryKey: ["room-floor-plan-grids", viewerUserId ?? "", shelfIndexIds.join(",")],
    queryFn: async (): Promise<{ grids: CageShelfDetail[]; alerts: ActiveCageStatusAlert[] }> => {
      const grids = await fetchLocalShelfGridsBatch(shelfIndexIds, viewerUserId ?? undefined);
      // 收集整间房所有格子的 animalCageId（本地网格里即 cell.id，同一雪花 id）。
      // 带 cageIds 拉活跃告警：弹窗登录人未必 STAFF，不带走全量档会 403；带 cageIds 只需 MEMBER。
      const cageIds: string[] = [];
      for (const detail of grids) {
        for (const cell of detail.grid ?? []) {
          if (cell.id !== null && cell.id !== undefined && String(cell.id) !== "") cageIds.push(String(cell.id));
        }
      }
      const uniq = Array.from(new Set(cageIds));
      const chunks: string[][] = [];
      for (let i = 0; i < uniq.length; i += ALERT_CAGE_IDS_LIMIT) chunks.push(uniq.slice(i, i + ALERT_CAGE_IDS_LIMIT));
      let alerts: ActiveCageStatusAlert[] = [];
      try {
        alerts = chunks.length ? (await Promise.all(chunks.map((ids) => fetchActiveCageStatusAlerts(ids)))).flat() : [];
      } catch {
        // 告警取数失败不拖垮整个平面图：网格照常渲染，只是缺告警标记
      }
      return { grids, alerts };
    },
    enabled: shelfIndexIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // 待审分笼/转移（「分笼审核中」「转移审核中」）+ 活跃笼位预定（「已被 XX 预订」）：
  // 与笼架信息页共用同一套标记与缓存键，两端中间态不会各写各的。
  const markersQuery = useQuery({
    queryKey: ["cage-op", "markers"],
    queryFn: fetchCageOpMarkers,
    staleTime: 60 * 1000,
  });
  const reservationsQuery = useQuery({
    queryKey: ["cage-reservations", "active"],
    queryFn: fetchActiveCageReservations,
    staleTime: 15_000,
  });
  const opMarkByCageId = useMemo(
    () => mergeAlertMarks(
      mergeReservationMarks(buildCageOpMarks(markersQuery.data ?? []), reservationsQuery.data ?? []),
      gridsQuery.data?.alerts ?? [],
    ),
    [markersQuery.data, reservationsQuery.data, gridsQuery.data],
  );

  const data = useMemo((): RoomFloorPlanData => {
    const byShelfIndexId = new Map<string, CageShelfCell[]>();
    for (const detail of gridsQuery.data?.grids ?? []) {
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
