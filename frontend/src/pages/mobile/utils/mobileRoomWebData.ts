/**
 * 手机版房间页数据 — 与小程序 pages/room 同源：
 * wechat-overview + scan/analyze + roomDashboard.buildCampusFloorTree
 */
import { fetchMobileRoomDashboard, type MobileRoomAnalyzeDto } from "@/api/domains/mobileStudent.api";
import { fetchStudentMobileRoomDashboard } from "@/api/domains/studentMobile.api";
import {
  buildCampusFloorTree,
  type CampusTreeNode,
  type OverviewRoomRaw,
} from "./roomDashboard";
import { withRoomPreviewMeta, type RoomPreviewMeta } from "./roomPreviewMeta";
import { normalizeRoom } from "./roomDashboard";
import { mergeMyRooms, type ScanAnalyzeDto } from "./twinScanAnalyze";
import {
  normalizeMobileScanAnalyze,
  type NormalizedMobileScanAnalyze,
} from "./mobileScanRoomAccess";

export interface MobileOverviewIndex {
  byRoomId: Map<string, OverviewRoomRaw>;
  byRoomName: Map<string, OverviewRoomRaw>;
}

export interface MobileRoomsPageBundle {
  /** 与小程序 parsed.rows / allRooms 一致 */
  overviewRows: OverviewRoomRaw[];
  overviewIndex: MobileOverviewIndex;
  campusTree: CampusTreeNode[];
  totalCount: number;
  /** 与小程序 myMeta 一致 */
  myRoomPreviews: RoomPreviewMeta[];
  analyze: MobileRoomAnalyzeDto;
  scanAnalyze: NormalizedMobileScanAnalyze | null;
  userId?: string;
}

export function buildOverviewIndex(rows: OverviewRoomRaw[]): MobileOverviewIndex {
  const byRoomId = new Map<string, OverviewRoomRaw>();
  const byRoomName = new Map<string, OverviewRoomRaw>();
  for (const row of rows ?? []) {
    if (row.roomId != null && String(row.roomId).trim()) {
      byRoomId.set(String(row.roomId).trim(), row);
    }
    const name = row.roomName?.trim();
    if (name) byRoomName.set(name, row);
  }
  return { byRoomId, byRoomName };
}

export function overviewToPreviewMeta(row: OverviewRoomRaw): RoomPreviewMeta {
  return withRoomPreviewMeta(normalizeRoom(row));
}

export function previewMetaToAccessItem(room: RoomPreviewMeta) {
  const used = Math.max(0, Number(room.campusUserCount || 0) + Number(room.borrowedCardCount || 0));
  return {
    roomId: String(room.roomId),
    roomName: room.roomName,
    zone: room.campus,
    floor: room.floor,
    occupantCount: used,
    campusUserCount: room.campusUserCount,
    borrowedCardCount: room.borrowedCardCount,
    capacity: room.totalCapacity,
    occupancyRate: 0,
    status: "idle",
    isPinned: false,
  };
}

export async function fetchMobileRoomsPageBundle(token: string): Promise<MobileRoomsPageBundle> {
  const dashboard = await fetchMobileRoomDashboard(token);
  const overviewRows = (dashboard.overview ?? []) as OverviewRoomRaw[];
  const analyze = dashboard.analyze ?? {};
  const scanAnalyze = normalizeMobileScanAnalyze(analyze as Record<string, unknown>);

  const dtoForMerge: ScanAnalyzeDto | null =
    analyze.success === true ? (analyze as ScanAnalyzeDto) : null;
  const myRaw = mergeMyRooms(overviewRows, dtoForMerge);
  const myRoomPreviews = myRaw.map((r) => overviewToPreviewMeta(r));

  return {
    overviewRows,
    overviewIndex: buildOverviewIndex(overviewRows),
    campusTree: buildCampusFloorTree(overviewRows),
    totalCount: overviewRows.length,
    myRoomPreviews,
    analyze,
    scanAnalyze,
    userId: dashboard.userId,
  };
}

/** JWT 模式：通过 authHttp 获取房间页数据（无需 token） */
export async function fetchStudentMobileRoomsPageBundle(): Promise<MobileRoomsPageBundle> {
  const dashboard = await fetchStudentMobileRoomDashboard();
  const overviewRows = (dashboard.overview ?? []) as OverviewRoomRaw[];
  const analyze = dashboard.analyze ?? {};
  const scanAnalyze = normalizeMobileScanAnalyze(analyze as Record<string, unknown>);

  const dtoForMerge: ScanAnalyzeDto | null =
    analyze.success === true ? (analyze as ScanAnalyzeDto) : null;
  const myRaw = mergeMyRooms(overviewRows, dtoForMerge);
  const myRoomPreviews = myRaw.map((r) => overviewToPreviewMeta(r));

  return {
    overviewRows,
    overviewIndex: buildOverviewIndex(overviewRows),
    campusTree: buildCampusFloorTree(overviewRows),
    totalCount: overviewRows.length,
    myRoomPreviews,
    analyze,
    scanAnalyze,
    userId: dashboard.userId,
  };
}
