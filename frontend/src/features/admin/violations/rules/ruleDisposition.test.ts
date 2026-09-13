import { describe, expect, it } from "vitest";
import { registryDispositionType, type DispositionValue } from "../slots/dispositionTypes";
import { dispositionToRulePatch, ruleToDisposition } from "./ruleDisposition";
import type { ViolationRule } from "@/api/domains/studentViolation.api";

/** 最小规则底座；与本用例无关的规则字段留空。 */
const rule = (over: Partial<ViolationRule>): ViolationRule =>
  ({
    ruleCode: "R",
    ruleName: "R",
    enabled: 1,
    forbidEnter: 0,
    showNoticeEveryScan: 1,
    interactiveUnlockOnVerify: 0,
    unblockMethod: "自助解禁",
    autoSignoutEnabled: 0,
    ...over,
  }) as ViolationRule;

const value = (strategy: DispositionValue["strategy"]): DispositionValue => ({
  actions: ["forbid"],
  expiry: { mode: "RELATIVE", days: null },
  strategy,
});

describe("ruleDisposition：规则级处置策略落点与回退", () => {
  it("存量规则（disposition 列全 NULL）不崩：从 interactiveChallenge 反推拼图", () => {
    const d = ruleToDisposition(rule({ forbidEnter: 1, interactiveChallenge: "一人一卡" }));
    expect(d.strategy).toEqual({
      type: "fixed",
      challengePhrase: "一人一卡",
      maxEnterSuccess: null,
      puzzle: true,
    });
    expect(registryDispositionType(d)).toBe("ACK_PUZZLE");
  });

  it("存量规则（无短语）不崩：回退为仅展示", () => {
    const d = ruleToDisposition(rule({ forbidEnter: 1 }));
    expect(registryDispositionType(d)).toBe("SHOW_ONLY");
  });

  it("有 dispositionType 时以新列为准（不被空短语拉回仅展示）", () => {
    const d = ruleToDisposition(
      rule({ dispositionType: "SIGNATURE", dispositionConfigJson: '{"preamble":"我承诺"}' })
    );
    expect(d.strategy).toEqual({ type: "signature", preamble: "我承诺", maxEnterSuccess: null });
  });

  it.each(["SHOW_ONLY", "ACK_READ", "QUIZ", "SIGNATURE", "ACK_PUZZLE"] as const)(
    "往返不丢类型：%s",
    (type) => {
      const strategies: Record<string, DispositionValue["strategy"]> = {
        SHOW_ONLY: { type: "fixed", challengePhrase: "", maxEnterSuccess: null, puzzle: false },
        ACK_READ: { type: "ack_read", minDwellSeconds: 0, requireScrollToBottom: false, maxEnterSuccess: null },
        QUIZ: { type: "quiz", questionBankId: "default", drawCount: 3, passCount: 2, maxAttempts: 3, maxEnterSuccess: null },
        SIGNATURE: { type: "signature", preamble: "", maxEnterSuccess: null },
        ACK_PUZZLE: { type: "fixed", challengePhrase: "短语", maxEnterSuccess: null, puzzle: true },
      };
      const merged = rule(dispositionToRulePatch(value(strategies[type])));
      expect(registryDispositionType(ruleToDisposition(merged))).toBe(type);
    }
  );
});
