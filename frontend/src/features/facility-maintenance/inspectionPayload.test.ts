import { describe, expect, it } from "vitest";
import {
  cellKey,
  mergeCells,
  normalizeCells,
  normalizeDailyInspectionSheet,
  normalizeSites,
  pickCi,
} from "@/features/facility-maintenance/inspectionPayload";

describe("inspectionPayload", () => {
  it("cellKey 产出 siteId|itemId 格式，normalizeCells 透传键并把值字符串化", () => {
    expect(cellKey("site1", "item2")).toBe("site1|item2");
    // 键格式由 cellKey 保证，normalizeCells 不解析键、只统一值的类型
    expect(normalizeCells({ "site1|item2": 5 })).toEqual({ "site1|item2": "5" });
    expect(normalizeCells({ "site1|item2": null })).toEqual({ "site1|item2": "" });
    expect(normalizeCells([1, 2])).toEqual({});
  });

  it("pickCi 命中 version 与 Version 两种写法", () => {
    expect(pickCi({ version: 1 }, "version")).toBe(1);
    expect(pickCi({ Version: 2 }, "version")).toBe(2);
  });

  it("normalizeDailyInspectionSheet 将字符串 version 归一为数字", () => {
    const out = normalizeDailyInspectionSheet({ version: "3" });
    expect(out?.version).toBe(3);
  });

  it("normalizeSites 丢弃缺 id 的脏数据", () => {
    const out = normalizeSites([{ name: "无id" }, { id: "1", name: "机房A" }, null]);
    expect(out).toEqual([{ id: "1", name: "机房A" }]);
  });

  it("mergeCells 只覆盖传入的键、保留其余", () => {
    expect(mergeCells({ a: "1", b: "2" }, { b: "3" })).toEqual({ a: "1", b: "3" });
  });
});
