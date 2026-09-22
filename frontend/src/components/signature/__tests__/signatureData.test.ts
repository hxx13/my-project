import { describe, it, expect } from "vitest";
import { fitSize, fitSignatureBox, SIGNATURE_RATIO, SIGNATURE_CANVAS } from "../signatureData";

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

describe("fitSignatureBox", () => {
  // 各种手机屏幕下可写区的实测夹逼：比例必须不变、且不超出可用区
  const cases: Array<[string, number, number]> = [
    ["iPhone SE 竖屏", 366, 500],
    ["iPhone 15 竖屏", 366, 620],
    ["大屏安卓竖屏", 400, 780],
    ["折叠屏内屏竖屏", 660, 900],
    ["横屏窄高", 820, 300],
    ["横屏常规", 820, 313],
    ["可用区极扁", 300, 90],
  ];

  it.each(cases)("%s：比例锁在 8:3", (_name, w, h) => {
    const box = fitSignatureBox(w, h);
    expect(Math.abs(box.width / box.height - SIGNATURE_RATIO)).toBeLessThan(0.01);
  });

  it.each(cases)("%s：不超出可用区，且至少有一边顶满", (_name, w, h) => {
    const box = fitSignatureBox(w, h);
    expect(box.width).toBeLessThanOrEqual(w + 1);
    expect(box.height).toBeLessThanOrEqual(h + 1);
    expect(box.width === w || box.height === h).toBe(true);
  });

  it("导出比例与规范一致（800×300 = 8:3）", () => {
    expect(SIGNATURE_CANVAS.width / SIGNATURE_CANVAS.height).toBeCloseTo(SIGNATURE_RATIO, 10);
  });
});
