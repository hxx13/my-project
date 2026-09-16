import { describe, it, expect } from "vitest";
import { buildMyRooms, type ScanAnalyzeDto } from "./twinScanAnalyze";
import type { OverviewRoomRaw } from "./roomDashboard";

/**
 * 回归：房间权限查询。
 * 旧实现把「门禁授权房间」和 wechat-overview 房间按**裸名字子串**求交集，后果：
 *   ① 本地房档对不上名字的授权房（浦西 503A vs 本地 5F-503）整个消失；
 *   ② 本地没有房档的授权房（浦西 604A）也消失；
 *   ③ 浦东 301A 的权限会蹭到浦西同名的 3F-301A。
 */

// 真实回包形状：overview 只有本地房档（浦西房号带楼层前缀），授权房用官方短码
const overview: OverviewRoomRaw[] = [
  { roomId: 56, roomName: "4F-401", campus: "浦东", totalCapacity: 4, capacityBindRoomId: "1951178410424299521" },
  { roomId: 45, roomName: "3F-301", campus: "浦东", totalCapacity: 3, capacityBindRoomId: "1951183182682419201" },
  { roomId: 8, roomName: "5F-503", campus: "浦西", totalCapacity: 2, capacityBindRoomId: null },
  { roomId: 41, roomName: "3F-301A", campus: "浦西", totalCapacity: 2, capacityBindRoomId: null },
];

const dto = (rooms: Array<Record<string, unknown>>): ScanAnalyzeDto => ({
  success: true,
  currentState: "OUTSIDE",
  allowedRooms: rooms as ScanAnalyzeDto["allowedRooms"],
  pendingRooms: [],
});

describe("buildMyRooms：以门禁授权为准出卡", () => {
  it("本地没有房档的授权房也要出卡（浦西 604A）", () => {
    const rooms = buildMyRooms(overview, dto([
      { displayName: "6A - 604A", officialRoomName: "604A", officialRoomId: "9001", campusTag: "浦西" },
    ]));
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomName).toBe("604A");
    expect(String(rooms[0].roomId)).toBe("9001");
  });

  it("浦西短码经「尾段+后缀」桥对上本地房档（503A ↔ 5F-503）", () => {
    const rooms = buildMyRooms(overview, dto([
      { displayName: "浦西 5F - 503A", officialRoomName: "503A", officialRoomId: "9002", campusTag: "浦西" },
    ]));
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomName).toBe("5F-503");
    expect(String(rooms[0].roomId)).toBe("9002");
  });

  it("授权房带官方 id，延迟链路不再靠名字反查", () => {
    const rooms = buildMyRooms(overview, dto([
      { displayName: "浦东 4F - 401", officialRoomName: "401", officialRoomId: "1951178410424299521", campusTag: "浦东" },
    ]));
    expect(String(rooms[0].roomId)).toBe("1951178410424299521");
  });

  it("浦东 301A 不会蹭到浦西同名的 3F-301A", () => {
    const rooms = buildMyRooms(overview, dto([
      { displayName: "浦东 3F - 301A", officialRoomName: "301A", officialRoomId: "9003", campusTag: "浦东" },
    ]));
    expect(rooms[0].roomName).toBe("3F-301");
  });

  it("analyze 失败时不出卡（不能把「查不到」当成「无权限」）", () => {
    expect(buildMyRooms(overview, { success: false })).toHaveLength(0);
    expect(buildMyRooms(overview, null)).toHaveLength(0);
  });
});
