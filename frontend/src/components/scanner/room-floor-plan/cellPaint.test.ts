import { describe, it, expect } from "vitest";
import { resolveMultiStatusBackground } from "./cellPaint";
import type { CageColorConfig } from "@/api/domains/cageShelf.api";

const COLORS: CageColorConfig = {
  NORMAL: { bg: "#f1f5f9", border: "#cbd5e1" },
  COHABITATION: { bg: "#a7f3d0", border: "#10b981" },
  HEALTH_ABNORMAL: { bg: "#e9d5ff", border: "#a855f7" },
  NEED_DIVIDE: { bg: "#fef08a", border: "#eab308" },
};

describe("resolveMultiStatusBackground", () => {
  it("无状态返回 null", () => {
    expect(resolveMultiStatusBackground([], COLORS)).toBeNull();
    expect(resolveMultiStatusBackground(undefined, COLORS)).toBeNull();
  });

  it("只有 NORMAL 返回 null", () => {
    expect(resolveMultiStatusBackground([{ code: "NORMAL" }], COLORS)).toBeNull();
  });

  it("单一状态返回该状态底色", () => {
    expect(resolveMultiStatusBackground([{ code: "COHABITATION" }], COLORS)).toBe("#a7f3d0");
  });

  it("两个状态竖向平分", () => {
    const bg = resolveMultiStatusBackground(
      [{ code: "COHABITATION" }, { code: "HEALTH_ABNORMAL" }],
      COLORS,
    );
    expect(bg).toBe("linear-gradient(to bottom, #a7f3d0 0%, #a7f3d0 50%, #e9d5ff 50%, #e9d5ff 100%)");
  });

  it("三个状态各占三分之一", () => {
    const bg = resolveMultiStatusBackground(
      [{ code: "COHABITATION" }, { code: "NEED_DIVIDE" }, { code: "HEALTH_ABNORMAL" }],
      COLORS,
    );
    expect(bg).toBe(
      "linear-gradient(to bottom, #a7f3d0 0%, #a7f3d0 33%, #fef08a 33%, #fef08a 67%, #e9d5ff 67%, #e9d5ff 100%)",
    );
  });

  it("未知状态码跳过", () => {
    expect(resolveMultiStatusBackground([{ code: "NOT_A_CODE" }], COLORS)).toBeNull();
  });

  it("混合已知与未知码：跳过未知、只留已知色", () => {
    expect(
      resolveMultiStatusBackground([{ code: "COHABITATION" }, { code: "NOT_A_CODE" }], COLORS),
    ).toBe("#a7f3d0");
  });

  it("NORMAL 与其它码混合：忽略 NORMAL", () => {
    expect(
      resolveMultiStatusBackground([{ code: "NORMAL" }, { code: "HEALTH_ABNORMAL" }], COLORS),
    ).toBe("#e9d5ff");
  });
});
