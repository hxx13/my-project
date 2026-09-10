import { describe, expect, it } from "vitest";
import { scopeAupsByRoom } from "../allocationAupScope";

/**
 * 回归：预约模式给房间绑定的 AUP，必须能在分配模式的下拉里出现。
 * 这个过滤口径曾经只认「网格上已用的 AUP」，把刚预约保存的 AUP 藏掉了。
 */

const aup = (registerNo: string) => ({ registerNo });

const ALL = [aup("AUP-1"), aup("AUP-2"), aup("AUP-3")];

describe("scopeAupsByRoom", () => {
  it("预约刚绑定、还没分配到笼位的 AUP 也能进下拉（本次修复的回归点）", () => {
    const got = scopeAupsByRoom(ALL, /* grid */ ["AUP-1"], /* booked */ ["AUP-3"]);
    expect(got.map((a) => a.registerNo)).toEqual(["AUP-1", "AUP-3"]);
  });

  it("两边都为空时返回全量（房间还没有任何 AUP，不该把用户堵死）", () => {
    expect(scopeAupsByRoom(ALL, [], [])).toBe(ALL);
  });

  it("只有预约绑定时也正常出结果", () => {
    const got = scopeAupsByRoom(ALL, [], ["AUP-2"]);
    expect(got.map((a) => a.registerNo)).toEqual(["AUP-2"]);
  });

  it("不在范围内的 AUP 依然被挡掉（不误放宽）", () => {
    const got = scopeAupsByRoom(ALL, ["AUP-1"], ["AUP-2"]);
    expect(got.map((a) => a.registerNo)).not.toContain("AUP-3");
  });

  it("忽略空串 registerNo，不会把无关项混进来", () => {
    const got = scopeAupsByRoom(ALL, [""], ["AUP-1"]);
    expect(got.map((a) => a.registerNo)).toEqual(["AUP-1"]);
  });
});
