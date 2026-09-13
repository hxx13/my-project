import { describe, it, expect } from "vitest";
import { fitSize } from "../signatureData";

describe("fitSize", () => {
  it("不放大超过最长边的画布", () => {
    expect(fitSize(200, 100, 600)).toEqual({ width: 200, height: 100 });
  });
  it("按最长边等比缩小", () => {
    expect(fitSize(1200, 600, 600)).toEqual({ width: 600, height: 300 });
  });
  it("竖长画布按高缩放", () => {
    expect(fitSize(300, 900, 450)).toEqual({ width: 150, height: 450 });
  });
});
