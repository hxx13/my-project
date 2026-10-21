import { describe, it, expect } from "vitest";
import { groupByCategory } from "./ledgerGroups";

type Row = { name: string; date: string };

describe("ledgerGroups.groupByCategory", () => {
  it("按首次出现顺序分组，组内保留时间倒序", () => {
    const rows: Row[] = [
      { name: "A", date: "2026-10-03" },
      { name: "B", date: "2026-10-02" },
      { name: "A", date: "2026-10-01" },
    ];
    const groups = groupByCategory(rows, (r) => r.name, (r) => r.date);
    expect(groups.map((g) => g.name)).toEqual(["A", "B"]);
    expect(groups[0].rows.map((r) => r.date)).toEqual(["2026-10-03", "2026-10-01"]);
    expect(groups[0].count).toBe(2);
    expect(groups[0].latest).toBe(rows[0]);
    expect(groups[0].rangeText).toBe("2026-10-01 ~ 2026-10-03");
    expect(groups[1].rangeText).toBe("2026-10-02");
  });

  it("空分类归入未分类", () => {
    const groups = groupByCategory([{ name: "", date: "2026-10-01" }], (r) => r.name, (r) => r.date);
    expect(groups.map((g) => g.name)).toEqual(["未分类"]);
  });
});
