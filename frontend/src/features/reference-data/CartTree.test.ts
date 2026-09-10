import { describe, it, expect } from "vitest";
import { buildCartTree, canEditCartLine } from "./CartTree";
import type { CartLine } from "./CartDrawer";

const line = (over: Partial<CartLine> & { id: number }): CartLine => ({
  key: String(over.id),
  itemId: 1,
  itemLabel: "SD大鼠",
  specLabel: "",
  qty: 1,
  addedBy: "u1",
  addedByLabel: "甲",
  aupRecordId: 100,
  aupLabel: "AUP-A",
  packageStatus: "DRAFT",
  ...over,
});

const lines: CartLine[] = [
  line({ id: 1, addedBy: "u1", addedByLabel: "甲", itemId: 1, itemLabel: "SD大鼠", specLabel: "雄性" }),
  line({ id: 2, addedBy: "u1", addedByLabel: "甲", itemId: 1, itemLabel: "SD大鼠", specLabel: "雌性" }),
  line({ id: 3, addedBy: "u2", addedByLabel: "乙", itemId: 2, itemLabel: "C57小鼠", specLabel: "雄性" }),
  line({ id: 4, addedBy: "u2", addedByLabel: "乙", itemId: 2, itemLabel: "C57小鼠", specLabel: "雄性", aupRecordId: 200, aupLabel: "AUP-B" }),
];

describe("buildCartTree", () => {
  it("空车返回空数组", () => {
    expect(buildCartTree([], "aup-user-spec")).toEqual([]);
  });

  it("默认 AUP→实验员：按 aupRecordId 分组，子组按加购人", () => {
    const groups = buildCartTree(lines, "aup-user-spec");
    expect(groups.map((g) => g.title)).toEqual(["AUP · AUP-A", "AUP · AUP-B"]);
    expect(groups[0].subGroups.map((s) => s.title)).toEqual(["实验员 · 甲", "实验员 · 乙"]);
    expect(groups[0].subGroups.map((s) => s.lines.length)).toEqual([2, 1]);
    expect(groups[1].subGroups.map((s) => s.lines.length)).toEqual([1]);
  });

  it("aupRecordId 为空归到「未归属」", () => {
    const groups = buildCartTree([line({ id: 9, aupRecordId: null, aupLabel: undefined })], "aup-user-spec");
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("AUP · 未归属");
  });

  it("规格→实验员：按 itemId::specLabel 分组（不同 AUP 的同行合到一组）", () => {
    const groups = buildCartTree(lines, "spec-user");
    expect(groups.map((g) => g.title)).toEqual(["SD大鼠 · 雄性", "SD大鼠 · 雌性", "C57小鼠 · 雄性"]);
    expect(groups[2].subGroups.map((s) => s.lines.length)).toEqual([2]);
  });

  it("无规格行的分组键退回 -", () => {
    const groups = buildCartTree([line({ id: 9, specLabel: "" })], "spec-user");
    expect(groups[0].title).toBe("SD大鼠");
  });
});

describe("canEditCartLine", () => {
  it("PI 可改他人行", () => {
    expect(canEditCartLine(line({ id: 1, addedBy: "u1" }), { isPi: true, currentUserId: "u9" })).toBe(true);
  });
  it("非 PI 只能改本人行", () => {
    expect(canEditCartLine(line({ id: 1, addedBy: "u1" }), { isPi: false, currentUserId: "u1" })).toBe(true);
    expect(canEditCartLine(line({ id: 1, addedBy: "u1" }), { isPi: false, currentUserId: "u2" })).toBe(false);
  });
});
