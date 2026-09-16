import { describe, expect, it } from "vitest";
import { divisionLabelOf } from "./constants";

/**
 * 划分标签：笼架页与订购抽屉共用同一句文案。
 * 曾经两处各写一份闭包，一边「已划分给你」、另一边只说「已划分」，用户看不出是不是划给自己的。
 */
describe("divisionLabelOf", () => {
  it("没有划分 → undefined（调用方据此不渲染标签）", () => {
    expect(divisionLabelOf({ divisionAssignees: [] }, "u1")).toBeUndefined();
    expect(divisionLabelOf({}, "u1")).toBeUndefined();
    expect(divisionLabelOf(null, "u1")).toBeUndefined();
    expect(divisionLabelOf(undefined, "u1")).toBeUndefined();
  });

  it("名单含本人 → 已划分给你；只有别人 → 已划分", () => {
    expect(divisionLabelOf({ divisionAssignees: [{ id: "u2", name: "李四" }] }, "u1")).toBe("已划分");
    expect(divisionLabelOf({ divisionAssignees: [{ id: "u1", name: "张三" }] }, "u1")).toBe("已划分给你");
    expect(divisionLabelOf({ divisionAssignees: [{ id: "u2" }, { id: "u1" }] }, "u1")).toBe("已划分给你");
  });

  it("拿不到账号 id 时不能把空串当成本人", () => {
    expect(divisionLabelOf({ divisionAssignees: [{ id: "" }] }, "")).toBe("已划分");
  });
});
