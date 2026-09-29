import { CAMPUS_ORDER } from "@/utils/cageCellDetailHelpers";

/** 校区优先级：浦东 0、浦西 1；不在表内的校区与未知值排最后。 */
export function campusRank(campus: string | null | undefined): number {
  const i = (CAMPUS_ORDER as readonly string[]).indexOf((campus ?? "").trim());
  return i < 0 ? CAMPUS_ORDER.length : i;
}

/**
 * 房间默认排序：浦东优先、浦西次之，同校区保持后端原顺序（房号序）。
 *
 * 后端 `/group-rooms` 只下发 roomId/roomName 且按 roomId 升序 —— 浦西房间 id 恰好都小于
 * 浦东，不排序就恒显示浦西。校区从笼架全量树按 roomId 反查（树与平面图共用缓存，不额外发请求）。
 */
export function sortRoomsByCampusPreference<T extends { roomId: string }>(
  rooms: T[],
  tree: { roomId?: string | number | null; campusName?: string | null }[],
): T[] {
  const campusByRoom = new Map<string, string>();
  for (const row of tree) {
    if (row.roomId === null || row.roomId === undefined || String(row.roomId) === "") continue;
    if (!campusByRoom.has(String(row.roomId))) campusByRoom.set(String(row.roomId), row.campusName ?? "");
  }
  return [...rooms].sort(
    (a, b) =>
      campusRank(campusByRoom.get(String(a.roomId))) - campusRank(campusByRoom.get(String(b.roomId))),
  );
}
