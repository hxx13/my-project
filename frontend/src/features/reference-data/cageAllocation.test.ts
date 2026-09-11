import { describe, it, expect } from "vitest";
import { allocateInOrder, allocatedTotal, keepAllocated } from "./cageAllocation";

const C = ["c1", "c2", "c3"];

describe("allocateInOrder", () => {
  it("按顺序 5 只/笼铺满，最后一个拿余数", () => {
    const { alloc, overflow } = allocateInOrder(12, C, 5);
    expect(alloc).toEqual({ c1: 5, c2: 5, c3: 2 });
    expect(overflow).toBe(0);
    expect(allocatedTotal(alloc)).toBe(12);
  });

  it("总数小于单笼上限时只占第一个笼位", () => {
    const { alloc } = allocateInOrder(3, C, 5);
    expect(alloc).toEqual({ c1: 3, c2: 0, c3: 0 });
  });

  it("总数刚好铺满前几个笼位时，后面的笼位是 0", () => {
    const { alloc } = allocateInOrder(10, C, 5);
    expect(alloc).toEqual({ c1: 5, c2: 5, c3: 0 });
  });

  it("容量不够时放满并报 overflow", () => {
    const { alloc, overflow } = allocateInOrder(20, C, 5);
    expect(alloc).toEqual({ c1: 5, c2: 5, c3: 5 });
    expect(overflow).toBe(5);
  });

  it("没选笼位时全部算 overflow", () => {
    const { alloc, overflow } = allocateInOrder(4, [], 5);
    expect(alloc).toEqual({});
    expect(overflow).toBe(4);
  });

  it("手动改小某笼 → 余数按顺序补给后面的笼位，Σ 仍等于总数", () => {
    // 总数 12，把 c2 手动改成 1：c1 拿满 5，c3 拿满 5，剩 1 回头补给还有空位的 c2
    const { alloc, overflow } = allocateInOrder(12, C, 5, { c2: 1 });
    expect(allocatedTotal(alloc)).toBe(12);
    expect(overflow).toBe(0);
    expect(alloc.c2).toBeGreaterThanOrEqual(1);
    expect(alloc.c1).toBe(5);
  });

  it("手动改某笼为 0 → 该笼不分配，其余按顺序吃下全部", () => {
    const { alloc, overflow } = allocateInOrder(10, C, 5, { c1: 0 });
    expect(alloc.c1).toBe(0);
    expect(alloc.c2).toBe(5);
    expect(alloc.c3).toBe(5);
    expect(overflow).toBe(0);
  });

  it("手动值超过单笼上限时被夹到上限", () => {
    const { alloc } = allocateInOrder(10, C, 5, { c1: 99 });
    expect(alloc.c1).toBe(5);
    expect(allocatedTotal(alloc)).toBe(10);
  });

  it("上限为 0（配置异常）时不吞掉总数，报 overflow", () => {
    const { overflow } = allocateInOrder(3, C, 0);
    expect(overflow).toBe(3);
  });
});

describe("keepAllocated", () => {
  it("丢掉分配为 0 的笼位并保持顺序（提交时自动取消空盒子）", () => {
    const cages = [{ animalCageId: "c1" }, { animalCageId: "c2" }, { animalCageId: "c3" }];
    const kept = keepAllocated(cages, { c1: 5, c2: 0, c3: 2 });
    expect(kept.map((c) => c.animalCageId)).toEqual(["c1", "c3"]);
  });
});
