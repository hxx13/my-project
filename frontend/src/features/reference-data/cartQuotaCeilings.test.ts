import { describe, expect, it } from "vitest";
import { planCartQuota } from "./cartQuotaCeilings";

/**
 * 回归点：
 * 1. 加购**不消耗**额度 —— 自己往车里加东西不该把自己的行削掉；
 * 2. 收敛只发生在「别人下单吃掉了额度」之后，且只削超出部分、永不为负。
 */

const row = (id: number, qty: number, editable = true) => ({ id, qty, editable });

describe("planCartQuota", () => {
  it("加购不占额度：车里放满上限，自己也不该被削", () => {
    // 上限 3、还没人下单 → available = 3
    const p = planCartQuota([row(1, 3)], 3);
    expect(p.converge).toEqual([]);
    expect(p.ceilings.get(1)).toBe(3); // 天花板 = 现在的 3，加不动了
  });

  it("超过剩余额度时只削超出部分，且不为负", () => {
    // 上限 3、车里 5 → 削到 3
    const p = planCartQuota([row(1, 5)], 3);
    expect(p.converge).toEqual([{ id: 1, qty: 3 }]);
  });

  it("别人下单把额度吃光后，才收敛本车超额的行", () => {
    // 上限 3 已被订单占满 → available = 0，车里还留着 3
    const p = planCartQuota([row(1, 3)], 0);
    expect(p.converge).toEqual([{ id: 1, qty: 0 }]);
  });

  it("还有余量时天花板 = 现有量 + 余量", () => {
    const p = planCartQuota([row(1, 1)], 3);
    expect(p.converge).toEqual([]);
    expect(p.ceilings.get(1)).toBe(3);
  });

  it("同一 (物品, 规格, 周期) 多行时全组一起算，前占后削", () => {
    const p = planCartQuota([row(1, 3), row(2, 3)], 3); // 车上限 3、全组 6
    expect(p.converge).toEqual([{ id: 2, qty: 0 }]);
  });

  it("不可改的行照样占额度，但不被改写、也不给天花板", () => {
    const p = planCartQuota([row(1, 3, false), row(2, 2)], 3);
    expect(p.ceilings.has(1)).toBe(false);
    expect(p.converge).toEqual([{ id: 2, qty: 0 }]);
  });

  it("额度被吃成负数（上限调小/订单超额）时最多削到 0，不会更负", () => {
    const p = planCartQuota([row(1, 1)], -2);
    expect(p.converge).toEqual([{ id: 1, qty: 0 }]);
  });
});
