/** 与小程序 pages/room/index.js withRoomPreviewMeta 同源：容量圆点、短名、字号 */

import { roomPersonCount, type NormalizedOverviewRoom } from "./roomDashboard";

export interface CapacityDot {
  used: boolean;
  level: number;
}

export interface RoomPreviewMeta extends NormalizedOverviewRoom {
  shortName: string;
  dotList: CapacityDot[];
  nameFontPx: number;
  nameScale: number;
  dotGapPx: number;
  usedCount: number;
  capacityTotal: number;
}

function occupancyLevel(used: number, total: number): number {
  if (total <= 0 || used <= 0) return 1;
  const r = used / total;
  if (r <= 0.2) return 1;
  if (r <= 0.4) return 2;
  if (r <= 0.6) return 3;
  if (r <= 0.8) return 4;
  return 5;
}

const DOT_COLORS: Record<number, string> = {
  1: "#07c160",
  2: "#2fc27d",
  3: "#ff976a",
  4: "#ff6b35",
  5: "#ee0a24",
};

export function dotColor(level: number, used: boolean): string {
  if (!used) return "#e1e3e6";
  return DOT_COLORS[level] ?? DOT_COLORS[1];
}

export function withRoomPreviewMeta(room: NormalizedOverviewRoom): RoomPreviewMeta {
  const total = Math.max(0, Number(room.totalCapacity || 0));
  const used = Math.max(0, Math.min(total, roomPersonCount(room)));
  const maxDots = 12;
  const shown = total > 0 ? Math.min(total, maxDots) : 0;
  const lit =
    total <= 0 || shown <= 0
      ? 0
      : Math.min(shown, Math.max(0, Math.round((used * shown) / total)));
  const lev = occupancyLevel(used, total);
  const dotList: CapacityDot[] = [];
  for (let i = 0; i < shown; i += 1) {
    dotList.push({ used: i < lit, level: lev });
  }

  const roomName = String(room.roomName || "");
  const splitIdx = roomName.indexOf("-");
  const shortName = splitIdx >= 0 ? roomName.slice(splitIdx + 1) : roomName;
  const label = shortName || roomName || "未知房间";
  const len = label.length;
  let nameFontPx = Math.max(11, Math.min(14, Math.floor(124 / Math.max(len * 0.9, 3))));
  const estNameWidth = len * nameFontPx * 0.88;
  const nameBudgetPx = 124;
  let nameScale = 1;
  if (estNameWidth > nameBudgetPx) {
    nameScale = Math.max(0.55, nameBudgetPx / estNameWidth);
    nameScale = Math.round(nameScale * 1000) / 1000;
  }
  const dotGapPx = shown > 10 ? 3 : shown > 7 ? 3.5 : 4;

  return {
    ...room,
    shortName: label,
    dotList,
    nameFontPx,
    nameScale,
    dotGapPx,
    usedCount: used,
    capacityTotal: total,
  };
}

export function entryTypeLabel(type: string | null | undefined): string {
  const t = String(type || "").toUpperCase();
  if (t === "OWN_CARD") return "自带卡";
  return "公用卡";
}

export interface DetailOccupantRow {
  userName: string;
  projectGroup: string;
  entryTime: string;
  entryTypeLabel: string;
}

export interface DetailRoom {
  roomId: string | number;
  roomName: string;
  totalCapacity: number;
  currentRoomCount: number;
  occupantRows: DetailOccupantRow[];
}

export function buildDetailRoom(room: RoomPreviewMeta): DetailRoom {
  const total = Math.max(0, Number(room.totalCapacity || 0));
  const remaining = Math.max(0, Number(room.remainingCards || 0));
  const occ = Array.isArray(room.occupants) ? room.occupants : [];
  const fallback = total > 0 ? Math.max(0, Math.min(total, total - remaining)) : 0;
  const currentRoomCount = occ.length > 0 ? occ.length : fallback;
  const occupantRows: DetailOccupantRow[] = occ.map((o) => ({
    userName: o.userName || "未知",
    projectGroup: o.projectGroup || "",
    entryTime: o.entryTime || "—",
    entryTypeLabel: entryTypeLabel(o.entryType),
  }));
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    totalCapacity: total,
    currentRoomCount,
    occupantRows,
  };
}
