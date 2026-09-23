import { describe, expect, it } from "vitest";
import { dateOnly, toDateTimeLocalValue } from "./beijingTime";

/**
 * 回归（2026-09-22）：后端时间是**空格**墙上钟 `yyyy-MM-dd HH:mm:ss`（JacksonTimeConfig），
 * 不是 ISO。按 ISO 处理会静默出错 —— 所以要在这里钉住。
 */
describe("dateOnly", () => {
  it("墙上钟形态取日期 —— split(\"T\")[0] 在这里会原样返回整串（页面显示成带时分秒）", () => {
    expect(dateOnly("2026-09-22 21:17:05")).toBe("2026-09-22");
  });

  it("ISO 形态也对", () => {
    expect(dateOnly("2026-09-22T21:17:05")).toBe("2026-09-22");
  });

  it("本来就是纯日期/空值", () => {
    expect(dateOnly("2026-09-22")).toBe("2026-09-22");
    expect(dateOnly(null)).toBe("");
    expect(dateOnly(undefined)).toBe("");
    expect(dateOnly("")).toBe("");
  });
});

describe("toDateTimeLocalValue", () => {
  it("墙上钟转成 datetime-local 认的 T 形态（空格形态是非法值，浏览器会把它清空）", () => {
    expect(toDateTimeLocalValue("2026-09-22 21:17:05")).toBe("2026-09-22T21:17");
  });

  it("已经是 T 形态则原样，只截到分钟", () => {
    expect(toDateTimeLocalValue("2026-09-22T21:17:05")).toBe("2026-09-22T21:17");
  });

  it("空值返回空串", () => {
    expect(toDateTimeLocalValue(null)).toBe("");
    expect(toDateTimeLocalValue("")).toBe("");
  });
});
