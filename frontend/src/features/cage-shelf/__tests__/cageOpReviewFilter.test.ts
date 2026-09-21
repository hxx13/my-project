import { describe, expect, it } from "vitest";
import type { CageOpRequestView } from "@/api/domains/cageShelf.api";
import {
  filterCageOpRows,
  matchesCageOpKeyword,
  selectedIdsInOrder,
  signatureProgressText,
} from "../cageOpReviewFilter";

/**
 * 分笼/转移审核列表的筛选与三签文案回归。
 * 筛选判错会「搜了搜不到 / 搜错人」；三签文案判错会把「还没签」显示成「不同意」。
 */

function req(over: Partial<CageOpRequestView> = {}): CageOpRequestView {
  return {
    id: "1",
    opType: "transfer",
    sourceAnimalCageId: "100",
    targetAnimalCageIds: ["200"],
    status: "pending",
    ...over,
  } as CageOpRequestView;
}

describe("matchesCageOpKeyword", () => {
  it("空关键词 / 只有空格 → 全部命中", () => {
    expect(matchesCageOpKeyword(req(), "")).toBe(true);
    expect(matchesCageOpKeyword(req(), "   ")).toBe(true);
  });

  it("匹配申请人姓名、原因、校区/房间/笼架名，且大小写不敏感", () => {
    const r = req({ applicantName: "张三", reason: "课题需要", campusName: "浦东", roomName: "201C", shelveName: "S1" });
    expect(matchesCageOpKeyword(r, "张三")).toBe(true);
    expect(matchesCageOpKeyword(r, "课题")).toBe(true);
    expect(matchesCageOpKeyword(r, "浦东")).toBe(true);
    expect(matchesCageOpKeyword(r, "201c")).toBe(true);
    expect(matchesCageOpKeyword(r, "s1")).toBe(true);
  });

  it("匹配坐标用 x-y，不是 A-2 的位号名", () => {
    const r = req({ positionX: 1, positionY: 2 });
    expect(matchesCageOpKeyword(r, "1-2")).toBe(true);
    expect(matchesCageOpKeyword(r, "A-2")).toBe(false);
  });

  it("目标笼位的位置也参与匹配（找「搬到哪」）", () => {
    const r = req({ targets: [{ animalCageId: "200", roomName: "301A", shelveName: "T2", positionX: 4, positionY: 5 }] });
    expect(matchesCageOpKeyword(r, "301a")).toBe(true);
    expect(matchesCageOpKeyword(r, "4-5")).toBe(true);
  });
});

describe("filterCageOpRows", () => {
  const rows = [
    req({ id: "1", status: "pending", applicantName: "张三" }),
    req({ id: "2", status: "approved", applicantName: "李四" }),
    req({ id: "3", status: "rejected", applicantName: "张三" }),
    req({ id: "4", status: "cancelled", applicantName: "王五" }),
  ];

  it("状态筛选：待审/已通过/已驳回各自只留对应状态；全部放行 cancelled", () => {
    expect(filterCageOpRows(rows, { keyword: "", status: "pending" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterCageOpRows(rows, { keyword: "", status: "approved" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterCageOpRows(rows, { keyword: "", status: "rejected" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterCageOpRows(rows, { keyword: "", status: "all" }).map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("关键词与状态是与关系，同时命中才留下", () => {
    expect(filterCageOpRows(rows, { keyword: "张三", status: "all" }).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterCageOpRows(rows, { keyword: "张三", status: "approved" }).map((r) => r.id)).toEqual([]);
  });
});

describe("signatureProgressText", () => {
  it("按固定顺序归属地/目的地/兽医拼装，缺记录 = 待签", () => {
    const r = req({
      signatures: [
        { role: "VET", decision: "rejected", reason: "不合规" },
        { role: "ORIGIN", decision: "approved" },
      ],
    });
    expect(signatureProgressText(r)).toBe("归属地 已同意 · 目的地 待签 · 兽医 不同意");
  });

  it("三签全空 = 全待签，而不是空串", () => {
    expect(signatureProgressText(req())).toBe("归属地 待签 · 目的地 待签 · 兽医 待签");
  });

  it("暂缓不当作通过", () => {
    expect(signatureProgressText(req({ signatures: [{ role: "DEST", decision: "held" }] })))
      .toBe("归属地 待签 · 目的地 已暂缓 · 兽医 待签");
  });
});

describe("selectedIdsInOrder", () => {
  it("按列表顺序收敛，而不是 Set 插入顺序", () => {
    const rows = [req({ id: "a" }), req({ id: "b" }), req({ id: "c" })];
    expect(selectedIdsInOrder(rows, new Set(["c", "a"]))).toEqual(["a", "c"]);
  });

  it("过滤后隐藏的行不进 PDF", () => {
    const rows = [req({ id: "a" }), req({ id: "b" })];
    expect(selectedIdsInOrder(rows, new Set(["a", "b", "gone"]))).toEqual(["a", "b"]);
  });
});
