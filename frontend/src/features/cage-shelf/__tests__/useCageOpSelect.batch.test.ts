import { describe, expect, it } from "vitest";
import {
  buildPairColors,
  buildPairs,
  swapItems,
  PAIR_COLORS,
  type CageOpLabel,
} from "../useCageOpSelect";
import type { CageOpTarget } from "@/api/domains/cageShelf.api";

/**
 * 批量转移的核心不变量：**位置即配对**。
 * 第 i 个源配第 i 个目标；重排源会改配对；同色即一对。
 */

const target = (id: string, x?: number, y?: number, room?: string): CageOpTarget =>
  ({
    animalCageId: id,
    positionX: x ?? null,
    positionY: y ?? null,
    roomName: room ?? null,
    selectable: true,
  }) as CageOpTarget;

describe("swapItems", () => {
  it("两个位置互换，其余不动", () => {
    expect(swapItems(["A", "B", "C", "D"], 0, 2)).toEqual(["C", "B", "A", "D"]);
    expect(swapItems(["A", "B", "C", "D"], 3, 1)).toEqual(["A", "D", "C", "B"]);
  });

  it("中间项不会被顺移（这是「交换」而非「插入」的关键）", () => {
    // 插入式实现会把 B、C 整体推一格 → ["C","A","B","D"]，中间两对配对全被打乱
    const got = swapItems(["A", "B", "C", "D"], 3, 0);
    expect(got).toEqual(["D", "B", "C", "A"]);
    expect(got.slice(1, 3)).toEqual(["B", "C"]);
  });

  it("原地或越界时返回原引用（避免无谓重渲染）", () => {
    const list = ["A", "B"];
    expect(swapItems(list, 1, 1)).toBe(list);
    expect(swapItems(list, -1, 0)).toBe(list);
    expect(swapItems(list, 0, 5)).toBe(list);
  });
});

describe("buildPairColors", () => {
  it("源与目标同色，逐对递增", () => {
    const m = buildPairColors(["s1", "s2"], ["t1", "t2"]);
    expect(m.get("s1")).toBe(PAIR_COLORS[0]);
    expect(m.get("t1")).toBe(PAIR_COLORS[0]);
    expect(m.get("s2")).toBe(PAIR_COLORS[1]);
    expect(m.get("t2")).toBe(PAIR_COLORS[1]);
  });

  it("未配目标的源仍有色，但不产生多余的目标色", () => {
    const m = buildPairColors(["s1", "s2", "s3"], ["t1"]);
    expect(m.get("s3")).toBe(PAIR_COLORS[2]);
    expect(m.size).toBe(4); // s1,t1,s2,s3
  });

  it("重排源 → 配对色跟着位置换（这是拖拽重排生效的关键）", () => {
    const before = buildPairColors(["s1", "s2"], ["t1", "t2"]);
    expect(before.get("s2")).toBe(PAIR_COLORS[1]);
    const after = buildPairColors(swapItems(["s1", "s2"], 1, 0), ["t1", "t2"]);
    expect(after.get("s2")).toBe(PAIR_COLORS[0]); // s2 换到第 0 位 → 接第 0 个目标
    expect(after.get("s1")).toBe(PAIR_COLORS[1]);
  });

  it("颜色不会和通用绿池高亮撞色", () => {
    for (const c of PAIR_COLORS) {
      expect(c.toLowerCase()).not.toContain("emerald");
      expect(c).not.toBe("#34d399"); // emerald-400，见 CellButton claimMode 池环
    }
    expect(new Set(PAIR_COLORS).size).toBe(PAIR_COLORS.length);
  });
});

describe("buildPairs", () => {
  const labels = new Map<string, CageOpLabel>([
    ["s1", { position: "A-1", where: "主校区/1F/R101/架1" }],
    ["s2", { position: "A-2", where: "主校区/1F/R101/架1" }],
  ]);

  it("按位置配对，并解析双方位置标签", () => {
    const targets = new Map([["t1", target("t1", 3, 4, "R102")]]);
    const pairs = buildPairs(["s1", "s2"], ["t1"], labels, targets);
    expect(pairs[0].sourceId).toBe("s1");
    expect(pairs[0].targetId).toBe("t1");
    expect(pairs[0].sourceLabel?.position).toBe("A-1");
    expect(pairs[0].targetLabel?.position).toBe("3-4");
    // 第二个源还没配目标
    expect(pairs[1].targetId).toBeNull();
    expect(pairs[1].targetLabel).toBeUndefined();
    expect(pairs[1].color).not.toBe(pairs[0].color);
  });

  it("重排源后配对整体跟着换", () => {
    const targets = new Map([
      ["t1", target("t1", 3, 4)],
      ["t2", target("t2", 5, 6)],
    ]);
    const pairs = buildPairs(swapItems(["s1", "s2"], 1, 0), ["t1", "t2"], labels, targets);
    expect(pairs[0].sourceId).toBe("s2");
    expect(pairs[0].targetId).toBe("t1");
    expect(pairs[1].sourceId).toBe("s1");
    expect(pairs[1].targetId).toBe("t2");
  });

  it("交换两个目标只影响这两对，中间配对原样不动", () => {
    const targets = new Map([
      ["t1", target("t1")], ["t2", target("t2")],
      ["t3", target("t3")], ["t4", target("t4")],
    ]);
    const sources = ["s1", "s2", "s3", "s4"];
    const before = buildPairs(sources, ["t1", "t2", "t3", "t4"], labels, targets);
    const after = buildPairs(sources, swapItems(["t1", "t2", "t3", "t4"], 0, 3), labels, targets);
    // 换的只有第 0 与第 3 对
    expect(after[0].targetId).toBe("t4");
    expect(after[3].targetId).toBe("t1");
    // 中间两对不受影响（插入式实现会把它们顺移，这里必须原样）
    expect(after[1].targetId).toBe(before[1].targetId);
    expect(after[2].targetId).toBe(before[2].targetId);
  });

  it("目标池里查不到的 id 不会伪造标签", () => {
    const pairs = buildPairs(["s1"], ["ghost"], labels, new Map());
    expect(pairs[0].targetId).toBe("ghost");
    expect(pairs[0].targetLabel).toBeUndefined();
  });
});
