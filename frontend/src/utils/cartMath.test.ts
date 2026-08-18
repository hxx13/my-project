import { describe, it, expect } from "vitest";
import { cartAdd, cartSetQty, cartClear, cartTotal, cartIsEmpty, CART_QTY_CAP } from "./cartMath";

describe("cartMath.cartAdd", () => {
  it("同一 tick 多次累加基于最新态（不丢键）", () => {
    let base = cartAdd({}, "13::区域=A区", 1);
    base = cartAdd(base, "13::区域=B区", 1);
    expect(base).toEqual({ "13::区域=A区": 1, "13::区域=B区": 1 });
  });

  it("重复键累加", () => {
    let base = cartAdd({}, "1", 1);
    base = cartAdd(base, "1", 2);
    expect(base["1"]).toBe(3);
  });

  it("clamp 到传入 max", () => {
    const base = cartAdd({}, "1", 5, 3);
    expect(base["1"]).toBe(3);
  });

  it("clamp 到全局 cap", () => {
    const base = cartAdd({}, "1", CART_QTY_CAP + 10);
    expect(base["1"]).toBe(CART_QTY_CAP);
  });

  it("归零删除键，且空删不改引用", () => {
    const base = cartAdd({ a: 1 }, "a", -1);
    expect(base).toEqual({});
    const noop = cartAdd({}, "x", -1);
    expect(noop).toEqual({});
  });
});

describe("cartMath.cartSetQty", () => {
  it("置数", () => {
    expect(cartSetQty({}, "k", 7)).toEqual({ k: 7 });
  });
  it("非法输入归零删除", () => {
    expect(cartSetQty({ k: 1 }, "k", Number.NaN)).toEqual({});
    expect(cartSetQty({ k: 1 }, "k", -3)).toEqual({});
  });
  it("未变化时返回原引用", () => {
    const base = { a: 2 };
    expect(cartSetQty(base, "a", 2)).toBe(base);
    expect(cartSetQty(base, "absent", 0)).toBe(base);
  });
});

describe("cartMath.cartTotal / cartIsEmpty / cartClear", () => {
  it("总数求和并忽略非法值", () => {
    expect(cartTotal({ a: 1, b: 2, c: -1, d: Number.NaN })).toBe(3);
  });
  it("空判定", () => {
    expect(cartIsEmpty({})).toBe(true);
    expect(cartIsEmpty({ a: 0 })).toBe(true);
    expect(cartIsEmpty({ a: 1 })).toBe(false);
  });
  it("清空返回新对象", () => {
    const empty = cartClear();
    expect(empty).toEqual({});
    expect(empty).not.toBe(cartClear());
  });
});
