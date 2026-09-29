import { describe, it, expect } from "vitest";
import { campusRank, sortRoomsByCampusPreference } from "./roomOrder";

// 真实口径：浦西 snowflake id(1.37e18) < 浦东(1.95e18)，后端升序返回 → 浦西天然在前
const tree = [
  { roomId: "1374909123426246657", campusName: "浦西" },
  { roomId: "1951192920673513474", campusName: "浦东" },
];

describe("campusRank", () => {
  it("浦东 0 / 浦西 1 / 其他与空值排最后", () => {
    expect(campusRank("浦东")).toBe(0);
    expect(campusRank("浦西")).toBe(1);
    expect(campusRank("张江")).toBe(2);
    expect(campusRank("")).toBe(2);
    expect(campusRank(null)).toBe(2);
  });
});

describe("sortRoomsByCampusPreference", () => {
  it("浦东房间提到首位（修复「默认恒显示浦西」）", () => {
    const rooms = [
      { roomId: "1374909123426246657", roomName: "601" },
      { roomId: "1951192920673513474", roomName: "201C" },
    ];
    expect(sortRoomsByCampusPreference(rooms, tree).map((r) => r.roomName)).toEqual(["201C", "601"]);
  });

  it("同校区保持后端原顺序（稳定排序）", () => {
    const rooms = [{ roomId: "b" }, { roomId: "a" }];
    const t = [
      { roomId: "a", campusName: "浦西" },
      { roomId: "b", campusName: "浦西" },
    ];
    expect(sortRoomsByCampusPreference(rooms, t).map((r) => r.roomId)).toEqual(["b", "a"]);
  });

  it("树里查不到的房间排到已知校区之后", () => {
    const rooms = [{ roomId: "ghost" }, { roomId: "1374909123426246657" }];
    expect(sortRoomsByCampusPreference(rooms, tree).map((r) => r.roomId)).toEqual([
      "1374909123426246657",
      "ghost",
    ]);
  });

  it("树的 roomId 是数字时也能对上字符串 roomId", () => {
    const rooms = [{ roomId: "2" }, { roomId: "1" }];
    const t = [
      { roomId: 1, campusName: "浦东" },
      { roomId: 2, campusName: "浦西" },
    ];
    expect(sortRoomsByCampusPreference(rooms, t).map((r) => r.roomId)).toEqual(["1", "2"]);
  });

  it("树未加载（空）时不改顺序", () => {
    const rooms = [{ roomId: "b" }, { roomId: "a" }];
    expect(sortRoomsByCampusPreference(rooms, []).map((r) => r.roomId)).toEqual(["b", "a"]);
  });
});
