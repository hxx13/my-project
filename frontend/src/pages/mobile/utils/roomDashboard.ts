/** 与小程序 utils/roomDashboard.js 同源：校区/楼层树与人数统计 */

export interface OverviewRoomRaw {
  roomId?: number | string;
  campus?: string;
  roomName?: string;
  totalCapacity?: number;
  remainingCards?: number;
  campusUserCount?: number;
  borrowedCardCount?: number;
  followingCount?: number;
  occupants?: OverviewOccupantRaw[];
  floor?: string;
  /** 与 room_config.capacity_bind_room_id 一致（扫码 allowedRooms 绑定） */
  capacityBindRoomId?: string | null;
}

export interface OverviewOccupantRaw {
  userName?: string;
  projectGroup?: string;
  entryTime?: string;
  entryType?: string;
}

export interface NormalizedOverviewRoom extends OverviewRoomRaw {
  roomId: number | string;
  campus: string;
  roomName: string;
  totalCapacity: number;
  remainingCards: number;
  campusUserCount: number;
  borrowedCardCount: number;
  followingCount: number;
  occupants: OverviewOccupantRaw[];
  floor: string;
}

export interface FloorGroup {
  floor: string;
  rooms: NormalizedOverviewRoom[];
  floorPersonCount: number;
}

export interface CampusTreeNode {
  campus: string;
  floors: FloorGroup[];
}

export interface CampusDisplayItem {
  campus: string;
  expanded: boolean;
  floors: FloorGroup[];
}

/** 与小程序 aroapp/miniprogram/utils/roomDashboard.js floorPrefix 一致 */
export function floorPrefix(roomName: string | null | undefined): string {
  const raw = roomName == null ? "" : String(roomName).trim();
  if (!raw) return "UNKNOWN";
  const idx = raw.indexOf("-");
  if (idx >= 0) {
    const first = raw.slice(0, idx).trim();
    if (first) return first;
  }
  const m = raw.match(/B\d+F|\d+F/i);
  if (m) return m[0].toUpperCase();
  return "其它";
}

function floorSortKey(prefix: string): number {
  const p = String(prefix || "").trim().toUpperCase();
  const g = p.match(/^(\d+)F$/);
  if (g) return Number(g[1]);
  const b = p.match(/^B(\d+)F$/);
  if (b) return -Number(b[1]);
  return -9999;
}

function sortFloorNamesDesc(a: string, b: string): number {
  const sa = floorSortKey(a);
  const sb = floorSortKey(b);
  if (sa !== sb) return sb - sa;
  return String(a).localeCompare(String(b), "zh-CN");
}

export function normalizeRoom(room: OverviewRoomRaw | null | undefined): NormalizedOverviewRoom {
  const r = room && typeof room === "object" ? room : {};
  const totalCapacity = Number(r.totalCapacity || 0);
  const remainingCards = Number(r.remainingCards || 0);
  const campusUserCount = Number(r.campusUserCount || 0);
  const borrowedCardCount = Number(r.borrowedCardCount || 0);
  const followingCount = Number(r.followingCount || 0);
  return {
    ...r,
    roomId: r.roomId ?? "",
    campus: r.campus ? String(r.campus) : "未知校区",
    roomName: r.roomName ? String(r.roomName) : "未知房间",
    totalCapacity,
    remainingCards,
    campusUserCount,
    borrowedCardCount,
    followingCount,
    occupants: Array.isArray(r.occupants) ? r.occupants : [],
    floor: floorPrefix(r.roomName),
  };
}

export function roomPersonCount(room: NormalizedOverviewRoom | OverviewRoomRaw): number {
  const occ = Array.isArray(room.occupants) ? room.occupants.length : 0;
  if (occ > 0) return occ;
  const total = Math.max(0, Number(room.totalCapacity || 0));
  const remaining = Math.max(0, Number(room.remainingCards || 0));
  return Math.max(0, total - remaining);
}

export function buildCampusFloorTree(rooms: OverviewRoomRaw[]): CampusTreeNode[] {
  const list = Array.isArray(rooms) ? rooms.map(normalizeRoom) : [];
  const campusMap: Record<string, Record<string, NormalizedOverviewRoom[]>> = {};

  for (const room of list) {
    const campus = room.campus || "未知校区";
    if (!campusMap[campus]) campusMap[campus] = {};
    const floor = room.floor;
    if (!campusMap[campus][floor]) campusMap[campus][floor] = [];
    campusMap[campus][floor].push(room);
  }

  return Object.keys(campusMap)
    .sort((a, b) => String(a).localeCompare(String(b), "zh-CN"))
    .map((campus) => {
      const floorMap = campusMap[campus];
      const floors = Object.keys(floorMap)
        .sort(sortFloorNamesDesc)
        .map((floor) => {
          const roomsOnFloor = floorMap[floor]
            .slice()
            .sort((x, y) => String(x.roomName).localeCompare(String(y.roomName), "zh-CN"));
          return {
            floor,
            rooms: roomsOnFloor,
            floorPersonCount: roomsOnFloor.reduce((sum, room) => sum + roomPersonCount(room), 0),
          };
        });
      return { campus, floors };
    });
}

export function pickRoomsByCampusFloor(
  rooms: OverviewRoomRaw[],
  campus: string,
  floor: string,
): NormalizedOverviewRoom[] {
  const list = Array.isArray(rooms) ? rooms.map(normalizeRoom) : [];
  return list
    .filter((r) => r.campus === campus && r.floor === floor)
    .sort((a, b) => String(a.roomName).localeCompare(String(b.roomName), "zh-CN"));
}

/** 固定「浦东」「浦西」顺序，其余校区按树中顺序接在后面 */
export function buildCampusDisplayList(
  campusTree: CampusTreeNode[],
  expandedMap: Record<string, boolean>,
): CampusDisplayItem[] {
  const fixed = ["浦东", "浦西"];
  const others = campusTree.map((item) => item.campus).filter((c) => !fixed.includes(c));
  const allCampuses = fixed.concat(others);
  return allCampuses.map((campus) => {
    const node = campusTree.find((i) => i.campus === campus) || { campus, floors: [] };
    return {
      campus,
      expanded: !!expandedMap[campus],
      floors: node.floors || [],
    };
  });
}

export function resolveDefaultCampusFloor(campusTree: CampusTreeNode[]): { campus: string; floor: string } {
  const preferCampus = ["浦东", "浦西"];
  for (const c of preferCampus) {
    const node = campusTree.find((x) => x.campus === c);
    if (node?.floors?.length) {
      return { campus: c, floor: node.floors[0].floor };
    }
  }
  if (campusTree.length && campusTree[0].floors.length) {
    return { campus: campusTree[0].campus, floor: campusTree[0].floors[0].floor };
  }
  return { campus: "浦东", floor: "" };
}
