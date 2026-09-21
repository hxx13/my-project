import { describe, it, expect } from "vitest";
import { buildTransferForm, type TransferFormEdits } from "@/features/cage-shelf/cageTransferForm";

/**
 * 转移单提交载荷的一条口径：**只发学生动过的值**。
 *
 * 自动值不落库、每次可重算，多发一个自动值 = 把那一刻的自动值冻进单子。
 * 所以「什么都没动」必须一个字段都不发；「只动了第 2 行」也必须发等长的数组
 * （后端按下标取行），前面没动的行留空对象。
 */
describe("buildTransferForm", () => {
  it("什么都没动 → 整个 transferForm 都不发", () => {
    expect(buildTransferForm({}, ["1001"])).toBeUndefined();
  });

  it("只发动过的顶层字段，空格会 trim", () => {
    const edits: TransferFormEdits = { phone: " 13900000000 ", unitName: "某大学" };
    expect(buildTransferForm(edits, ["1001"])).toEqual({
      phone: "13900000000",
      unitName: "某大学",
    });
  });

  it("只动了第二行 → 发等长数组，第一行留空对象（后端按下标回退自动值）", () => {
    const edits: TransferFormEdits = { rows: { "1002": { male: "5" } } };
    expect(buildTransferForm(edits, ["1001", "1002"])).toEqual({
      rows: [{}, { male: 5 }],
    });
  });

  it("行里全是垃圾 → rows 干脆不发", () => {
    const edits: TransferFormEdits = { rows: { "1001": { female: "abc", male: "" } } };
    expect(buildTransferForm(edits, ["1001"])).toBeUndefined();
  });

  it("数量取整、负数与夸张值丢掉（夸张值会让后端 Integer 解析炸掉整份表单）", () => {
    const edits: TransferFormEdits = { rows: { "1001": { female: "3.7", male: "1e21" } } };
    expect(buildTransferForm(edits, ["1001"])).toEqual({ rows: [{ female: 3 }] });
    expect(buildTransferForm({ rows: { "1001": { female: "-2" } } }, ["1001"])).toBeUndefined();
  });

  it("目标已不在选择里 → 那一行不发（行随 picked 走）", () => {
    const edits: TransferFormEdits = { rows: { "9999": { male: "5" } } };
    expect(buildTransferForm(edits, ["1001"])).toBeUndefined();
  });
});
