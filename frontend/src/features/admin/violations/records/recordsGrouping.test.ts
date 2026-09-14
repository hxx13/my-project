import { describe, expect, it } from "vitest";
import type { StudentViolationRow } from "@/api/domains/studentViolation.api";
import { groupViolationRows, parseSignatureDataUrl } from "./recordsGrouping";

function row(id: number, batchId?: string, projectGroupName?: string | null): StudentViolationRow {
  return { id, targetUserId: `u${id}`, batchId, projectGroupName };
}

/** 同一人的多条违规（不同笼位）：显式指定 targetUserId / 显示名。 */
function personRow(
  id: number,
  targetUserId: string,
  displayName?: string,
  projectGroupName?: string | null
): StudentViolationRow {
  return { id, targetUserId, targetUserDisplayName: displayName, batchId: "B1", projectGroupName };
}

describe("groupViolationRows", () => {
  it("同一 batchId 相邻行归为一块（不排序，按传入顺序）", () => {
    const blocks = groupViolationRows([row(1, "B1"), row(2, "B1"), row(3, "B1")]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].batchId).toBe("B1");
    expect(blocks[0].rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("不同 batchId 切成多块，块顺序即传入顺序", () => {
    const blocks = groupViolationRows([row(1, "B2"), row(2, "B1"), row(3, "B1")]);
    expect(blocks.map((b) => b.batchId)).toEqual(["B2", "B1"]);
    expect(blocks.map((b) => b.rows.length)).toEqual([1, 2]);
  });

  it("同行人历史行 batchId 缺失时归一为 SINGLE-<id>，每人自成一块", () => {
    const blocks = groupViolationRows([row(7), row(8)]);
    expect(blocks.map((b) => b.batchId)).toEqual(["SINGLE-7", "SINGLE-8"]);
    expect(blocks.every((b) => b.rows.length === 1)).toBe(true);
  });

  it("batchId 为空串或纯空白时同样归一为 SINGLE-<id>，不得塌成一块", () => {
    const blocks = groupViolationRows([row(9, ""), row(10, "   ")]);
    expect(blocks.map((b) => b.batchId)).toEqual(["SINGLE-9", "SINGLE-10"]);
    expect(blocks.every((b) => b.rows.length === 1)).toBe(true);
  });

  it("块内按 projectGroupName 连续段切分，只有段首行带 startIndex/rowSpan", () => {
    const blocks = groupViolationRows([
      row(1, "B1", "甲组"),
      row(2, "B1", "甲组"),
      row(3, "B1", "乙组"),
      row(4, "B1", "甲组"), // 非连续，不能并回第一段
    ]);
    expect(blocks[0].groups).toEqual([
      { name: "甲组", rowSpan: 2, startIndex: 0 },
      { name: "乙组", rowSpan: 1, startIndex: 2 },
      { name: "甲组", rowSpan: 1, startIndex: 3 },
    ]);
    // 段长度之和 == 块行数；每个段首 index 唯一 → 非首行不渲染合并格
    const total = blocks[0].groups.reduce((s, g) => s + g.rowSpan, 0);
    expect(total).toBe(blocks[0].rows.length);
    const starts = new Set(blocks[0].groups.map((g) => g.startIndex));
    expect(starts.size).toBe(blocks[0].groups.length);
  });

  it("projectGroupName 为 null/空串统一归为 null（显示「—」）", () => {
    const blocks = groupViolationRows([row(1, "B1", null), row(2, "B1", "  ")]);
    expect(blocks[0].groups).toEqual([{ name: null, rowSpan: 2, startIndex: 0 }]);
  });
});

describe("groupViolationRows —— 人（targetUserId）分段", () => {
  it("块内同一个人的多行合成一段（一个笼位一条违规 → 一个人多条）", () => {
    const blocks = groupViolationRows([
      personRow(1, "u1", "张三"),
      personRow(2, "u1", "张三"),
      personRow(3, "u1", "张三"),
    ]);
    expect(blocks[0].persons).toEqual([{ key: "u1", name: "张三", rowSpan: 3, startIndex: 0 }]);
  });

  it("换人另起一段", () => {
    const blocks = groupViolationRows([
      personRow(1, "u1", "张三"),
      personRow(2, "u1", "张三"),
      personRow(3, "u2", "李四"),
    ]);
    expect(blocks[0].persons).toEqual([
      { key: "u1", name: "张三", rowSpan: 2, startIndex: 0 },
      { key: "u2", name: "李四", rowSpan: 1, startIndex: 2 },
    ]);
  });

  it("同一个人的行不连续时切成两段（不重排，与课题组同口径）", () => {
    const blocks = groupViolationRows([
      personRow(1, "u1", "张三"),
      personRow(2, "u2", "李四"),
      personRow(3, "u1", "张三"),
    ]);
    expect(blocks[0].persons.map((p) => [p.key, p.startIndex, p.rowSpan])).toEqual([
      ["u1", 0, 1],
      ["u2", 1, 1],
      ["u1", 2, 1],
    ]);
  });

  it("显示名缺失/空白时兜底 targetUserId（键仍用 targetUserId，同名不串段）", () => {
    const blocks = groupViolationRows([personRow(1, "u1"), personRow(2, "u1", "  ")]);
    expect(blocks[0].persons).toEqual([{ key: "u1", name: "u1", rowSpan: 2, startIndex: 0 }]);
  });

  it("人与课题组段相互独立：同一人跨组、同组内多人的段各自成立", () => {
    const blocks = groupViolationRows([
      personRow(1, "u1", "张三", "甲组"),
      personRow(2, "u1", "张三", "甲组"),
      personRow(3, "u2", "李四", "甲组"),
      personRow(4, "u1", "张三", "乙组"),
    ]);
    expect(blocks[0].groups.map((g) => [g.name, g.startIndex, g.rowSpan])).toEqual([
      ["甲组", 0, 3],
      ["乙组", 3, 1],
    ]);
    expect(blocks[0].persons.map((p) => [p.key, p.startIndex, p.rowSpan])).toEqual([
      ["u1", 0, 2],
      ["u2", 2, 1],
      ["u1", 3, 1],
    ]);
    // 两套分段的段长之和都等于块行数、段首 index 各自唯一
    for (const segs of [blocks[0].groups, blocks[0].persons]) {
      expect(segs.reduce((s, g) => s + g.rowSpan, 0)).toBe(blocks[0].rows.length);
      expect(new Set(segs.map((g) => g.startIndex)).size).toBe(segs.length);
    }
  });
});

describe("parseSignatureDataUrl", () => {
  // ⚠ 主用例：真实回执是**两层**——后端 writeReceiptAndComplete 统一包成 {answer: <原始提交>}，
  // 而原始提交自己又是 JSON.stringify({signature})。只认扁平形状会永远解不出来（弹窗报「未找到签名图」）。
  it("真实回执形状：{answer:\"{\\\"signature\\\":...}\"} 要能剥两层取出 dataUrl", () => {
    const stored = JSON.stringify({ answer: JSON.stringify({ signature: "data:image/jpeg;base64,REAL" }) });
    expect(parseSignatureDataUrl(stored)).toBe("data:image/jpeg;base64,REAL");
  });

  it("answer 直接就是 dataUrl（不套里层 JSON）也能取到", () => {
    expect(parseSignatureDataUrl(JSON.stringify({ answer: "data:image/jpeg;base64,DIRECT" }))).toBe(
      "data:image/jpeg;base64,DIRECT"
    );
  });

  it("兼容扁平形状 {signature}", () => {
    expect(parseSignatureDataUrl(JSON.stringify({ signature: "data:image/png;base64,AAA" }))).toBe(
      "data:image/png;base64,AAA"
    );
  });

  it("答题/拼图那类没有签名的回执返回 null", () => {
    expect(parseSignatureDataUrl(JSON.stringify({ answer: JSON.stringify({ answers: { q1: 0 } }) }))).toBeNull();
    expect(parseSignatureDataUrl(JSON.stringify({ answer: "知识就是力量" }))).toBeNull();
  });

  it("空 / 非 JSON / 无 signature / 空白签名一律返回 null", () => {
    expect(parseSignatureDataUrl(null)).toBeNull();
    expect(parseSignatureDataUrl("")).toBeNull();
    expect(parseSignatureDataUrl("not-json")).toBeNull();
    expect(parseSignatureDataUrl(JSON.stringify({ answers: {} }))).toBeNull();
    expect(parseSignatureDataUrl(JSON.stringify({ signature: "   " }))).toBeNull();
  });
});
