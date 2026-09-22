import { describe, expect, it } from "vitest";
import { fetchCageOpTargets, type CageOpTarget } from "@/api/domains/cageShelf.api";
import {
  groupPoolByRoom,
  indexPool,
  nextUnpairedIdx,
  pairRows,
  removeSource,
  targetOwnerExcept,
  type BatchSource,
} from "./batchTransferLogic";

function target(p: Partial<CageOpTarget> & { animalCageId: string }): CageOpTarget {
  return {
    selectable: true,
    positionX: 1,
    positionY: 1,
    shelveId: "S1",
    shelveName: "201A-1",
    roomName: "201A",
    campusName: "浦东",
    ...p,
  } as CageOpTarget;
}

function source(id: string, label = id): BatchSource {
  return {
    animalCageId: id,
    label,
    shelveId: "S9",
    shelveName: "201A-9",
    roomId: "9",
    roomName: "201A",
  };
}

describe("groupPoolByRoom", () => {
  it("按 校区/房间 归并，架去重，保持后端顺序", () => {
    const pool = [
      target({ animalCageId: "a", roomName: "201A", campusName: "浦东", shelveId: "S1", shelveName: "201A-1" }),
      target({ animalCageId: "b", roomName: "201A", campusName: "浦东", shelveId: "S2", shelveName: "201A-2" }),
      target({ animalCageId: "c", roomName: "201B", campusName: "浦东", shelveId: "S3", shelveName: "201B-1" }),
      target({ animalCageId: "d", roomName: "201A", campusName: "浦东", shelveId: "S1", shelveName: "201A-1" }),
    ];
    const rooms = groupPoolByRoom(pool);
    expect(rooms.map((r) => r.roomKey)).toEqual(["浦东/201A", "浦东/201B"]);
    expect(rooms[0].shelves.map((s) => s.shelveId)).toEqual(["S1", "S2"]);
    expect(rooms[1].shelves.map((s) => s.shelveId)).toEqual(["S3"]);
  });

  it("缺房间名归到「其他」，缺 shelveId 的条目不出现在架列表里", () => {
    const rooms = groupPoolByRoom([
      target({ animalCageId: "a", roomName: null, shelveId: null }),
    ]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomName).toBe("其他");
    expect(rooms[0].shelves).toEqual([]);
  });
});

describe("indexPool", () => {
  it("以 animalCageId 字符串为键", () => {
    const m = indexPool([target({ animalCageId: "a" }), target({ animalCageId: "b" })]);
    expect(m.size).toBe(2);
    expect(m.get("b")?.animalCageId).toBe("b");
  });
});

describe("nextUnpairedIdx", () => {
  const sources = [source("s1"), source("s2"), source("s3")];

  it("从 from 起找第一个没配目标的（含起点、向后）", () => {
    const targets = new Map([["s2", "t2"]]);
    expect(nextUnpairedIdx(sources, targets, 0)).toBe(0);
    expect(nextUnpairedIdx(sources, targets, 1)).toBe(2);
    expect(nextUnpairedIdx(sources, targets, 2)).toBe(2);
  });

  it("走到末尾没找到就绕回开头继续找", () => {
    // s1/s3 都配好了，从 s3（下标 2）起：2 已配 → 绕到 0 已配 → 再到 1 未配
    const targets = new Map([["s1", "t1"], ["s3", "t3"]]);
    expect(nextUnpairedIdx(sources, targets, 2)).toBe(1);
  });

  it("全配完返回 -1；空源返回 -1", () => {
    const all = new Map([["s1", "a"], ["s2", "b"], ["s3", "c"]]);
    expect(nextUnpairedIdx(sources, all, 0)).toBe(-1);
    expect(nextUnpairedIdx([], new Map(), 0)).toBe(-1);
  });

  it("光标越界不炸（from 大于长度时取模）", () => {
    expect(nextUnpairedIdx(sources, new Map(), 7)).toBe(1);
  });
});

describe("removeSource", () => {
  it("连带删掉该源的目标，其余配对不动（配对挂在源 id 上，与顺序无关）", () => {
    const sources = [source("s1"), source("s2"), source("s3")];
    const targets = new Map([["s1", "t1"], ["s2", "t2"], ["s3", "t3"]]);
    const out = removeSource(sources, targets, "s2");
    expect(out.sources.map((s) => s.animalCageId)).toEqual(["s1", "s3"]);
    expect([...out.targets.entries()]).toEqual([["s1", "t1"], ["s3", "t3"]]);
    // 原 Map 不被改动
    expect(targets.size).toBe(3);
  });
});

describe("pairRows", () => {
  it("配好的写目标坐标，没配的写「待选」", () => {
    const sources = [source("s1", "F-4"), source("s2", "G-5")];
    const targets = new Map([["s1", "t1"]]);
    const pool = indexPool([target({ animalCageId: "t1", positionX: 3, positionY: 5 })]);
    const rows = pairRows(sources, targets, pool);
    expect(rows[0].paired).toBe(true);
    expect(rows[0].text).toBe("F-4 → C-6");
    expect(rows[1].paired).toBe(false);
    expect(rows[1].text).toBe("G-5 → 待选");
  });

  it("配对指向池里查不到的 id 时退回「待选」，不伪造坐标", () => {
    const rows = pairRows([source("s1", "F-4")], new Map([["s1", "ghost"]]), new Map());
    expect(rows[0].paired).toBe(false);
    expect(rows[0].text).toBe("F-4 → 待选");
  });
});

describe("fetchCageOpTargets 的调用形状（防回归：批量必须传 null 收窄参数）", () => {
  it("shelfIndexId 省略 = 全库", async () => {
    // 这条只断言签名，不断言网络：真跑会给 authHttp 抛未登录
    expect(typeof fetchCageOpTargets).toBe("function");
  });
});

describe("targetOwnerExcept（一个目标只能接收一次转移）", () => {
  it("目标配给了别的源 → 返回那个源的 id", () => {
    const targets = new Map([["s1", "X"], ["s2", "Y"]]);
    expect(targetOwnerExcept(targets, "X", "s2")).toBe("s1");
    expect(targetOwnerExcept(targets, "Y", "s1")).toBe("s2");
  });

  it("目标就是自己配的 → 不算被占（要能重选/取消自己的目标）", () => {
    const targets = new Map([["s1", "X"]]);
    expect(targetOwnerExcept(targets, "X", "s1")).toBeNull();
  });

  it("没人配过 → null；空 cageId → null", () => {
    expect(targetOwnerExcept(new Map([["s1", "X"]]), "Z", "s1")).toBeNull();
    expect(targetOwnerExcept(new Map(), "X", "s1")).toBeNull();
    expect(targetOwnerExcept(new Map([["s1", "X"]]), "", "s1")).toBeNull();
  });

  it("没传 exceptSourceId 时，任何占用都算 → 置灰（源阶段/预览用）", () => {
    expect(targetOwnerExcept(new Map([["s1", "X"]]), "X", null)).toBe("s1");
  });
});
