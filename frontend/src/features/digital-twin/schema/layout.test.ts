import { describe, expect, it } from "vitest";
import { gridLayout } from "./layout";
import type { TwinNode } from "./types";

function makeNode(id: string, lane: string, x: number): TwinNode {
  return {
    id,
    kind: "room",
    lane,
    x,
    y: 0,
    title: id,
    bindings: [],
    alarmRules: [],
  };
}

describe("gridLayout", () => {
  it("同一 lane 的节点 y 相同，且按 x 升序以固定间距排布", () => {
    const nodes = [makeNode("b", "房间", 500), makeNode("a", "房间", 100), makeNode("c", "房间", 300)];
    const result = gridLayout(nodes, ["房间"]);

    expect(result.map((n) => n.id)).toEqual(["a", "c", "b"]);
    expect(result.map((n) => n.y)).toEqual([120, 120, 120]);
    expect(result.map((n) => n.x)).toEqual([120, 300, 480]);
  });

  it("不同 lane 分行，y 间隔 200", () => {
    const nodes = [
      makeNode("e1", "设备", 0),
      makeNode("e2", "设备", 0),
      makeNode("r1", "房间", 0),
    ];
    const result = gridLayout(nodes, ["设备", "房间"]);

    const equipment = result.filter((n) => n.lane === "设备");
    const room = result.filter((n) => n.lane === "房间");
    expect(equipment.length).toBe(2);
    expect(room.length).toBe(1);
    expect(equipment.every((n) => n.y === 120)).toBe(true);
    expect(room.every((n) => n.y === 320)).toBe(true);
  });

  it("不修改输入数组（深比较）", () => {
    const nodes = [makeNode("a", "房间", 300), makeNode("b", "房间", 100)];
    const snapshot = JSON.parse(JSON.stringify(nodes)) as TwinNode[];
    const snapshotOrder = nodes.map((n) => n.id);

    gridLayout(nodes, ["房间"]);

    expect(nodes).toEqual(snapshot);
    expect(nodes.map((n) => n.id)).toEqual(snapshotOrder);
  });
});
