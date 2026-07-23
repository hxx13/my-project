import type { RoomInfo } from "@/api/types/scanner";

/** 浦东=0，浦西=1，未识别=2（列表中越靠前越靠上） */
export function resolveCampusSortKey(room: RoomInfo): number {
  const tag = (room.campusTag ?? "").trim();
  if (tag.includes("浦东")) return 0;
  if (tag.includes("浦西")) return 1;
  const label = (room.displayName || room.name || room.regionName || "").trim();
  if (label.includes("浦东")) return 0;
  if (label.includes("浦西")) return 1;
  return 2;
}

/** 扫码弹窗右下角房间按钮：浦东校区排在浦西之上，同校区内按展示名排序 */
export function sortScanRoomsPudongFirst(rooms: RoomInfo[]): RoomInfo[] {
  return [...rooms].sort((a, b) => {
    const byCampus = resolveCampusSortKey(a) - resolveCampusSortKey(b);
    if (byCampus !== 0) return byCampus;
    const na = (a.displayName || a.name || "").trim();
    const nb = (b.displayName || b.name || "").trim();
    return na.localeCompare(nb, "zh-CN");
  });
}
