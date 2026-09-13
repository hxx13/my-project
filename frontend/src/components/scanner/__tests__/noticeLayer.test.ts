import { describe, expect, it } from "vitest";
import { declaredInteractiveStrategy, needsInteractiveLayer } from "../noticeLayer";

describe("declaredInteractiveStrategy", () => {
  it("按 dispositionType 直读（大小写/空白归一）", () => {
    expect(declaredInteractiveStrategy({ dispositionType: " ack_read " })).toBe("ACK_READ");
    expect(declaredInteractiveStrategy({ dispositionType: "QUIZ" })).toBe("QUIZ");
    expect(declaredInteractiveStrategy({ dispositionType: "SIGNATURE" })).toBe("SIGNATURE");
    expect(declaredInteractiveStrategy({ dispositionType: "SHOW_ONLY" })).toBe("SHOW_ONLY");
  });

  it("老数据没有 dispositionType：有拼图短语即 ACK_PUZZLE，否则无策略", () => {
    expect(declaredInteractiveStrategy({ interactiveChallenge: "知识就是力量" })).toBe("ACK_PUZZLE");
    expect(declaredInteractiveStrategy({ interactiveChallenge: "   " })).toBe("");
    expect(declaredInteractiveStrategy({})).toBe("");
    expect(declaredInteractiveStrategy(null)).toBe("");
  });

  it("声明了 ACK_PUZZLE 却没有短语 → 无策略（卡片也不会渲染面板）", () => {
    expect(declaredInteractiveStrategy({ dispositionType: "ACK_PUZZLE" })).toBe("");
    expect(
      declaredInteractiveStrategy({ dispositionType: "ACK_PUZZLE", interactiveChallenge: "  " })
    ).toBe("");
  });

  it("有短语时仍按声明的策略走（短语只做回退）", () => {
    expect(
      declaredInteractiveStrategy({ dispositionType: "ACK_READ", interactiveChallenge: "知识就是力量" })
    ).toBe("ACK_READ");
  });
});

describe("needsInteractiveLayer", () => {
  it("交互类且未完成 → 需要交互层", () => {
    for (const t of ["ACK_READ", "ACK_PUZZLE", "QUIZ", "SIGNATURE"]) {
      const notice = { dispositionType: t, interactiveChallengeVerified: false };
      if (t === "ACK_PUZZLE") {
        expect(needsInteractiveLayer({ ...notice, interactiveChallenge: "短语" })).toBe(true);
      } else {
        expect(needsInteractiveLayer(notice)).toBe(true);
      }
    }
  });

  it("已完成处置 → 落回公告层（这是「交互完成后恢复并排」的关键）", () => {
    expect(
      needsInteractiveLayer({ dispositionType: "SIGNATURE", interactiveChallengeVerified: true })
    ).toBe(false);
  });

  it("仅展示 / 无通知 → 公告层", () => {
    expect(needsInteractiveLayer({ dispositionType: "SHOW_ONLY" })).toBe(false);
    expect(needsInteractiveLayer({})).toBe(false);
    expect(needsInteractiveLayer(null)).toBe(false);
    expect(needsInteractiveLayer(undefined)).toBe(false);
  });
});
