import { describe, it, expect } from "vitest";
import { toggleValue, summarizeChips, filterOptions } from "../multiSelectModel";
import type { MultiSelectOption } from "../multiSelectModel";

type Action = "a" | "b" | "c" | "d" | "e";

const OPTIONS: MultiSelectOption<Action>[] = [
  { value: "a", label: "立即禁入", desc: "forbid enter", tone: "danger" },
  { value: "b", label: "每次提示", desc: "每次扫码都提示" },
  { value: "c", label: "验证后解禁", tone: "ok" },
  { value: "d", label: "仅记录", tone: "info" },
  { value: "e", label: "人工复核", tone: "warn" },
];

describe("multiSelectModel 纯函数", () => {
  it("toggleValue 加入/移除选中项，且返回新数组、不改动原数组", () => {
    const original: Action[] = ["a", "b"];

    const added = toggleValue(original, "c");
    expect(added).toEqual(["a", "b", "c"]);
    expect(added).not.toBe(original);

    const removed = toggleValue(original, "a");
    expect(removed).toEqual(["b"]);

    expect(original).toEqual(["a", "b"]);
  });

  it("toggleValue 对空数组加入、对已存在值移除", () => {
    expect(toggleValue([] as Action[], "a")).toEqual(["a"]);

    const original: Action[] = ["a", "b", "c"];
    const removed = toggleValue(original, "b");
    expect(removed).toEqual(["a", "c"]);
    expect(removed).not.toBe(original);
    expect(original).toEqual(["a", "b", "c"]);
  });

  it("summarizeChips：3 选中 2 显示 → 2 个 chip + overflow 1", () => {
    const { chips, overflow } = summarizeChips(OPTIONS, ["a", "c", "e"], 2);
    expect(chips).toHaveLength(2);
    expect(overflow).toBe(1);
  });

  it("summarizeChips：选中数 ≤ maxChips → overflow 0", () => {
    expect(summarizeChips(OPTIONS, ["a", "b"], 2).overflow).toBe(0);
    expect(summarizeChips(OPTIONS, ["a"], 2).overflow).toBe(0);
  });

  it("summarizeChips 顺序按 options 而非点选顺序", () => {
    const { chips } = summarizeChips(OPTIONS, ["e", "a"], 3);
    expect(chips.map((c) => c.value)).toEqual(["a", "e"]);
  });

  it("summarizeChips maxChips=0 → 空 chips、overflow=选中数", () => {
    const { chips, overflow } = summarizeChips(OPTIONS, ["a", "b", "c"], 0);
    expect(chips).toEqual([]);
    expect(overflow).toBe(3);
  });

  it("summarizeChips 静默排除 options 之外的 value，不计入 overflow", () => {
    const values = ["a", "zzz"] as unknown as Action[];
    const { chips, overflow } = summarizeChips(OPTIONS, values, 3);
    expect(chips.map((c) => c.value)).toEqual(["a"]);
    expect(overflow).toBe(0);
  });

  it("filterOptions 能按 desc 命中，且大小写不敏感", () => {
    expect(filterOptions(OPTIONS, "FORBID").map((o) => o.value)).toEqual(["a"]);
    expect(filterOptions(OPTIONS, "扫码").map((o) => o.value)).toEqual(["b"]);
  });

  it("filterOptions 空关键字（含纯空白）返回原数组", () => {
    expect(filterOptions(OPTIONS, "")).toBe(OPTIONS);
    expect(filterOptions(OPTIONS, "   ")).toBe(OPTIONS);
  });

  it("filterOptions 无命中返回空数组", () => {
    expect(filterOptions(OPTIONS, "不存在的词")).toEqual([]);
  });

  it("filterOptions 关键字前后空格被 trim", () => {
    expect(filterOptions(OPTIONS, "  立即禁入  ").map((o) => o.value)).toEqual(["a"]);
  });
});
