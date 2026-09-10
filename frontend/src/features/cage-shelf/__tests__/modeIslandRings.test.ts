import { describe, expect, it } from "vitest";
import { layoutRings, ringCapacity, ringSlotOf } from "../components/CageModeIsland";

/**
 * 径向模式岛的分圈：容量由**半径弧长**推算，不是写死的数字。
 * 所以改半径 / 改间距 / 改模式个数，分圈会自动跟着变。
 */

describe("ringCapacity", () => {
  it("半径越大，一圈放得越多（递增的来源）", () => {
    const caps = [82, 144, 206, 268].map(ringCapacity);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]).toBeGreaterThan(caps[i - 1]);
    }
  });

  it("内圈放 3 个", () => {
    expect(ringCapacity(82)).toBe(3);
  });

  it("半径极小也至少留 1 个位，不会算出 0", () => {
    expect(ringCapacity(1)).toBe(1);
  });
});

describe("layoutRings", () => {
  it("8 个模式：内圈填满再往外溢 → 3 + 5", () => {
    expect(layoutRings(8)).toEqual([3, 5]);
  });

  it("7 个模式：3 + 4（内圈少、外圈多）", () => {
    expect(layoutRings(7)).toEqual([3, 4]);
  });

  it("不超过内圈容量时只用一圈", () => {
    expect(layoutRings(2)).toEqual([2]);
    expect(layoutRings(3)).toEqual([3]);
  });

  it("每圈都不超过该圈容量上限", () => {
    const rings = layoutRings(20);
    rings.forEach((count, i) => {
      expect(count).toBeLessThanOrEqual(ringCapacity([82, 144, 206, 268][i]));
    });
  });

  it("总数守恒 —— 不漏模式", () => {
    for (const n of [1, 3, 5, 7, 8, 12, 17]) {
      const sum = layoutRings(n).reduce((a, b) => a + b, 0);
      expect(sum).toBe(n);
    }
  });
});

describe("ringSlotOf", () => {
  const rings = layoutRings(8); // [3, 5]

  it("前几个落在内圈，其余落在外圈", () => {
    expect(ringSlotOf(0, rings).r).toBe(82);
    expect(ringSlotOf(2, rings).r).toBe(82);
    expect(ringSlotOf(3, rings).r).toBe(144);
    expect(ringSlotOf(7, rings).r).toBe(144);
  });

  it("每圈都在 180°→270° 这段可见弧内", () => {
    for (let i = 0; i < 8; i++) {
      const { ang } = ringSlotOf(i, rings);
      expect(ang).toBeGreaterThanOrEqual(180);
      expect(ang).toBeLessThanOrEqual(270);
    }
  });

  it("内圈第一个正好在最左（180°）", () => {
    expect(ringSlotOf(0, rings).ang).toBe(180);
  });

  it("外圈按自身个数均分，不留下空隙", () => {
    const first = ringSlotOf(3, rings).ang;
    const last = ringSlotOf(7, rings).ang;
    expect(first).toBe(180);
    expect(last).toBe(270);
  });

  it("越界索引有兜底，不会返回 undefined", () => {
    expect(ringSlotOf(99, rings)).toEqual({ ang: 180, r: 82 });
  });
});
