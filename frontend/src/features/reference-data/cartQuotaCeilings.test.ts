import { describe, expect, it } from "vitest";
import { planCartQuota } from "./cartQuotaCeilings";

/**
 * 回归点：上限 3 加满 3 被清零、加到 5 变成 -2。
 * 两个都是因为拿 `available`（已含本行）当本行的上限，自己减自己。
 */

const row = (id: number, qty: number, editable = true) => ({ id, qty, editable });

describe("planCartQuota", () => {
  it("加满到上限不算超量，自己不该被削", () => {
    // 上限 3、本行就是那 3 → available = 0
    const p = planCartQuota([row(1, 3)], 0);
    expect(p.converge).toEqual([]);
    expect(p.ceilings.get(1)).toBe(3); // 天花板 = 现在的 3，加不动了
  });

  it("超量只削超出部分，且不为负", () => {
    // 上限 3、行里 5 → available = -2
    const p = planCartQuota([row(1, 5)], -2);
    expect(p.converge).toEqual([{ id: 1, qty: 3 }]);
    expect(p.ceilings.get(1)).toBe(5); // 收敛前先按旧值算，收敛后重算即 3
  });

  it("还有余量时天花板 = 现有量 + 余量", () => {
    const p = planCartQuota([row(1, 1)], 2); // 上限 3、别人没占
    expect(p.converge).toEqual([]);
    expect(p.ceilings.get(1)).toBe(3);
  });

  it("同一 (物品, 规格, 周期) 多行时全组一起算，前占后削", () => {
    const p = planCartQuota([row(1, 3), row(2, 3)], -3); // 上限 3、全组 6 → available = -3
    expect(p.converge).toEqual([{ id: 2, qty: 0 }]);
  });

  it("不可改的行照样占配额，但不被改写、也不给天花板", () => {
    const p = planCartQuota([row(1, 3, false), row(2, 2)], -2);
    expect(p.ceilings.has(1)).toBe(false);
    expect(p.converge).toEqual([{ id: 2, qty: 0 }]);
  });

  it("别人把配额吃到超额时，本行最多削到 0，不会更负", () => {
    // 别人已占 5（上限 3），本行 1 → available = 3 - 6 = -3
    const p = planCartQuota([row(1, 1)], -3);
    expect(p.converge).toEqual([{ id: 1, qty: 0 }]);
  });
});
