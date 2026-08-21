import { describe, it, expect } from "vitest";
import { gridColumnStarts } from "../FieldGrid";

describe("gridColumnStarts — 12 列栅格列起点使用约定", () => {
  it("1200px 容器 / 16px gutter 返回 4 个列起点", () => {
    expect(gridColumnStarts(1200, 16)).toHaveLength(4);
  });

  it("首列起点为 0", () => {
    expect(gridColumnStarts(1200, 16)[0]).toBe(0);
  });

  it("第 5 列起点 = 4 × (colWidth + gutter)", () => {
    const colWidth = (1200 - 11 * 16) / 12;
    expect(gridColumnStarts(1200, 16)[1]).toBe(4 * (colWidth + 16));
  });

  it("完整列起点数组与手工期望值一致", () => {
    // 1332px / 12px gutter：11×12=132px 给 gutter，1200px 给 12 列 → 每列 100px，列距 112px
    expect(gridColumnStarts(1332, 12)).toEqual([0, 448, 672, 896]);
  });

  it("gutter=0 时列起点退化为纯列宽累加", () => {
    expect(gridColumnStarts(1200, 0)).toEqual([0, 400, 600, 800]);
  });

  it("containerWidth=0 返回全 0，不产生负偏移", () => {
    expect(gridColumnStarts(0, 16)).toEqual([0, 0, 0, 0]);
    expect(gridColumnStarts(100, 16)).toEqual([0, 0, 0, 0]);
  });
});
