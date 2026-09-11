import { describe, it, expect } from "vitest";
import { refCardLines, refCardPrice } from "./ReferenceCard";
import type { RefDataItem } from "@/api/domains/referenceData.api";

const item = (fieldData: Record<string, unknown>): RefDataItem => ({
  id: 7,
  refType: "ANIMAL_STRAIN",
  parentId: null,
  sortOrder: 0,
  status: 1,
  fieldData,
});

describe("refCardLines", () => {
  it("固定返回主标题/副标题/描述三行，缺省为空串", () => {
    expect(refCardLines(item({ title: "C57BL/6", subtitle: "C57BL/6J", description: "常用品系" })))
      .toEqual(["C57BL/6", "C57BL/6J", "常用品系"]);
    expect(refCardLines(item({ title: "C57BL/6" }))).toEqual(["C57BL/6", "", ""]);
    expect(refCardLines(item({ title: 1, subtitle: null, description: undefined }))).toEqual(["1", "", ""]);
  });
});

describe("refCardPrice", () => {
  it("未开启价格不占位", () => {
    expect(refCardPrice(item({ price: 100 }))).toBeNull();
    expect(refCardPrice(item({ priceEnabled: false, price: 100 }))).toBeNull();
  });

  it("开启但无任何价格显示「待定」", () => {
    expect(refCardPrice(item({ priceEnabled: true }))).toBe("待定");
    expect(refCardPrice(item({ priceEnabled: true, price: "" }))).toBe("待定");
    expect(refCardPrice(item({ priceEnabled: true, price: "abc" }))).toBe("待定");
  });

  it("单一价格只显示一个数", () => {
    expect(refCardPrice(item({ priceEnabled: true, price: 120 }))).toBe("¥120.00");
    expect(refCardPrice(item({ priceEnabled: true, specPrices: { "规格: 雄性": 99.5 } }))).toBe("¥99.50");
  });

  it("多规格价取区间", () => {
    expect(refCardPrice(item({ priceEnabled: true, specPrices: { a: 120, b: 180, c: 150 } })))
      .toBe("¥120.00 ~ ¥180.00");
  });

  it("有规格价时忽略单品价", () => {
    expect(refCardPrice(item({ priceEnabled: true, price: 999, specPrices: { a: 120, b: 180 } })))
      .toBe("¥120.00 ~ ¥180.00");
  });
});
