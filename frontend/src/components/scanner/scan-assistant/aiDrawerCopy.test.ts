import { describe, it, expect } from "vitest";
import { applyCopyVars, resolveCopy } from "./aiDrawerCopy";

describe("applyCopyVars", () => {
  it("替换 {name} 与 {mm:ss} 占位符", () => {
    expect(applyCopyVars("「{name}」没截成", { name: "首页" })).toBe("「首页」没截成");
    expect(applyCopyVars("还剩 {mm:ss}", { "mm:ss": "01:30" })).toBe("还剩 01:30");
  });

  it("数字、零值也能替换", () => {
    expect(applyCopyVars("还剩 {mm:ss}", { "mm:ss": "00:00" })).toBe("还剩 00:00");
  });

  it("未提供的占位符原样留着", () => {
    expect(applyCopyVars("「{name}」没截成", {})).toBe("「{name}」没截成");
    expect(applyCopyVars("还剩 {mm:ss}")).toBe("还剩 {mm:ss}");
  });

  it("同一模板里多个占位符一起换", () => {
    expect(applyCopyVars("{name} 还剩 {mm:ss}", { name: "A", "mm:ss": "00:05" })).toBe(
      "A 还剩 00:05",
    );
  });
});

describe("resolveCopy", () => {
  const map = { "ai.copy.card.timer.left": "还剩 {mm:ss}" };

  it("库里有值就以库为准并替换占位符", () => {
    expect(resolveCopy(map, "ai.copy.card.timer.left", "还剩 99:99", { "mm:ss": "00:07" })).toBe(
      "还剩 00:07",
    );
  });

  it("库里没这个键就回落兜底原文", () => {
    expect(resolveCopy(map, "ai.copy.chat.stopped", "（已停止生成）")).toBe("（已停止生成）");
  });

  it("库里是空串也回落兜底", () => {
    expect(resolveCopy({ k: "" }, "k", "兜底")).toBe("兜底");
  });

  it("map 为 null/undefined 时回落兜底", () => {
    expect(resolveCopy(null, "k", "兜底")).toBe("兜底");
    expect(resolveCopy(undefined, "k", "兜底")).toBe("兜底");
  });

  it("有库值时兜底不参与（不带占位符的库值原样返回）", () => {
    expect(resolveCopy({ "ai.copy.card.timer.stop": "停止一下" }, "ai.copy.card.timer.stop", "停止")).toBe(
      "停止一下",
    );
  });
});
