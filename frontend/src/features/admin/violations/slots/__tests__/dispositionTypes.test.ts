import { describe, expect, it } from "vitest";
import {
  fromDispositionRow,
  toCreateDisposition,
  toUpdateDisposition,
  validateDispositionForCreate,
  registryDispositionType,
  ensureForbidForStrategy,
  strategyRequiresForbid,
  actionsIncludeUnlock,
  dueSecondaryLabel,
  summarizeDispositionForDetail,
} from "../dispositionTypes";
import type { DispositionStrategy, DispositionValue } from "../dispositionTypes";
import type { StudentViolationRow } from "@/api/domains/studentViolation.api";

const fixed = (
  challengePhrase = "",
  maxEnterSuccess: number | null = null,
  puzzle = challengePhrase.trim().length > 0
): DispositionStrategy => ({
  type: "fixed",
  challengePhrase,
  maxEnterSuccess,
  puzzle,
});

const baseValue = (overrides: Partial<DispositionValue> = {}): DispositionValue => ({
  actions: [],
  expiry: { mode: "RELATIVE", days: null },
  strategy: fixed(),
  ...overrides,
});

describe("dispositionTypes 纯函数契约", () => {
  it("toCreateDisposition 把动作三兄弟映射为布尔三兄弟", () => {
    const out = toCreateDisposition(baseValue({ actions: ["forbid", "unlock"] }));
    expect(out.forbidEnter).toBe(true);
    expect(out.showNoticeEveryScan).toBe(false);
    expect(out.interactiveUnlockOnVerify).toBe(true);
  });

  it("toCreateDisposition RELATIVE days=null → expireAfterDays=null（不得转 0 或省略）", () => {
    const out = toCreateDisposition(baseValue({ expiry: { mode: "RELATIVE", days: null } }));
    expect(out.expireAfterDays).toBeNull();
    expect("expireAfterDays" in out).toBe(true);
  });

  it("toCreateDisposition challengePhrase 空串→null，非空原样透传", () => {
    expect(toCreateDisposition(baseValue()).interactiveChallenge).toBeNull();
    expect(toCreateDisposition(baseValue({ strategy: fixed("请签名") })).interactiveChallenge).toBe("请签名");
  });

  it("fromDispositionRow 把 0/1/undefined 归一化为布尔动作", () => {
    expect(fromDispositionRow({ id: 1, targetUserId: "u1", forbidEnter: 1 }).actions).toContain("forbid");
    expect(fromDispositionRow({ id: 1, targetUserId: "u1", forbidEnter: 0 }).actions).not.toContain("forbid");
    expect(fromDispositionRow({ id: 1, targetUserId: "u1" }).actions).not.toContain("forbid");
  });

  it("fromDispositionRow 的 expiry 恒为 { mode: 'KEEP' }", () => {
    const row: StudentViolationRow = { id: 1, targetUserId: "u1", expireAt: "2026-09-01T00:00:00Z" };
    expect(fromDispositionRow(row).expiry).toEqual({ mode: "KEEP" });
  });

  it("toUpdateDisposition 三种 expiry 映射", () => {
    const keep = toUpdateDisposition(baseValue({ expiry: { mode: "KEEP" } }));
    expect(keep.expireMode).toBe("KEEP");
    expect(keep.expireAfterDays).toBeNull();

    const clear = toUpdateDisposition(baseValue({ expiry: { mode: "CLEAR" } }));
    expect(clear.expireMode).toBe("CLEAR");
    expect(clear.expireAfterDays).toBeNull();

    const relative = toUpdateDisposition(baseValue({ expiry: { mode: "RELATIVE", days: 7 } }));
    expect(relative.expireMode).toBe("RELATIVE");
    expect(relative.expireAfterDays).toBe(7);
  });

  it("toUpdateDisposition(fromDispositionRow(row)) 除 expiry 外逐字段幂等", () => {
    const row: StudentViolationRow = {
      id: 1,
      targetUserId: "u1",
      forbidEnter: 1,
      showNoticeEveryScan: 0,
      interactiveUnlockOnVerify: 1,
      interactiveChallenge: "请签名",
      maxEnterSuccess: 3,
      expireAt: "2026-09-01T00:00:00Z",
    };
    const out = toUpdateDisposition(fromDispositionRow(row));
    expect(out.forbidEnter).toBe(true);
    expect(out.showNoticeEveryScan).toBe(false);
    expect(out.interactiveUnlockOnVerify).toBe(true);
    expect(out.interactiveChallenge).toBe("请签名");
    expect(out.maxEnterSuccess).toBe(3);
    // expiry 故意排除：expireAt 是绝对时间戳，无法反推天数，往返在该字段上物理不成立
  });

  it("toCreateDisposition 传 KEEP 应抛错（开单没有「保持不变」语义）", () => {
    expect(() => toCreateDisposition(baseValue({ expiry: { mode: "KEEP" } }))).toThrow();
  });

  it("纯空白/首尾空白 challengePhrase → null 或 trim（不生成强制禁入）", () => {
    expect(toCreateDisposition(baseValue({ strategy: fixed("   ", null, true) })).interactiveChallenge).toBeNull();
    expect(toUpdateDisposition(baseValue({ strategy: fixed("  ", null, true) })).interactiveChallenge).toBeNull();
    expect(toCreateDisposition(baseValue({ strategy: fixed(" 我 同意 ") })).interactiveChallenge).toBe("我 同意");
  });

  it("maxEnterSuccess: 0 往返保留 0 不转 null（0 次 vs 不限制）", () => {
    const row: StudentViolationRow = { id: 1, targetUserId: "u1", maxEnterSuccess: 0 };
    expect(toUpdateDisposition(fromDispositionRow(row)).maxEnterSuccess).toBe(0);
    expect(toCreateDisposition(baseValue({ strategy: fixed("", 0) })).maxEnterSuccess).toBe(0);
  });

  it("toCreateDisposition expiry RELATIVE days=0 → expireAfterDays 0（区分 0 与省略）", () => {
    expect(toCreateDisposition(baseValue({ expiry: { mode: "RELATIVE", days: 0 } })).expireAfterDays).toBe(0);
  });

  it("actions 为空数组 → 三布尔全 false", () => {
    const out = toCreateDisposition(baseValue({ actions: [] }));
    expect(out.forbidEnter).toBe(false);
    expect(out.showNoticeEveryScan).toBe(false);
    expect(out.interactiveUnlockOnVerify).toBe(false);
  });

  it("actions 重复项幂等：['forbid','forbid'] → forbidEnter true", () => {
    const out = toCreateDisposition(baseValue({ actions: ["forbid", "forbid"] }));
    expect(out.forbidEnter).toBe(true);
    expect(out.showNoticeEveryScan).toBe(false);
    expect(out.interactiveUnlockOnVerify).toBe(false);
  });

  it("fromDispositionRow 对几乎空行 → 空 actions + 默认 strategy + KEEP", () => {
    const row: StudentViolationRow = { id: 1, targetUserId: "u1" };
    const out = fromDispositionRow(row);
    expect(out.actions).toEqual([]);
    expect(out.strategy).toEqual({ type: "fixed", challengePhrase: "", maxEnterSuccess: null, puzzle: false });
    expect(out.expiry).toEqual({ mode: "KEEP" });
  });

  it("空短语也可选 ACK_PUZZLE（puzzle=true），不再被映射回 SHOW_ONLY", () => {
    const v = baseValue({ strategy: fixed("", null, true) });
    expect(registryDispositionType(v)).toBe("ACK_PUZZLE");
    expect(validateDispositionForCreate(v)).toBe("请填写拼图短语");
  });

  it("unset 策略开单校验失败", () => {
    expect(validateDispositionForCreate(baseValue({ strategy: { type: "unset" } }))).toBe("请选择处置策略");
  });

  it("strategyRequiresForbid：仅展示/未选不要求，交互类要求", () => {
    expect(strategyRequiresForbid({ type: "unset" })).toBe(false);
    expect(strategyRequiresForbid(fixed("", null, false))).toBe(false);
    expect(strategyRequiresForbid(fixed("", null, true))).toBe(true);
    expect(strategyRequiresForbid({ type: "ack_read", maxEnterSuccess: null })).toBe(true);
    expect(
      strategyRequiresForbid({
        type: "quiz",
        questionBankId: "default",
        drawCount: 3,
        passCount: 2,
        maxAttempts: 3,
        maxEnterSuccess: null,
      })
    ).toBe(true);
    expect(strategyRequiresForbid({ type: "signature", preamble: "", maxEnterSuccess: null })).toBe(true);
  });

  it("ensureForbidForStrategy：交互策略补 forbid；仅展示不改动", () => {
    expect(ensureForbidForStrategy([], fixed("", null, true))).toEqual(["forbid"]);
    expect(ensureForbidForStrategy(["unlock"], { type: "ack_read", maxEnterSuccess: null })).toEqual([
      "unlock",
      "forbid",
    ]);
    expect(ensureForbidForStrategy(["forbid", "unlock"], { type: "ack_read", maxEnterSuccess: null })).toEqual([
      "forbid",
      "unlock",
    ]);
    expect(ensureForbidForStrategy(["every"], fixed("", null, false))).toEqual(["every"]);
    expect(ensureForbidForStrategy([], { type: "unset" })).toEqual([]);
  });

  it("unlock 与封禁天数可并存：勾选 unlock 时 toCreate 照传天数", () => {
    const out = toCreateDisposition(
      baseValue({ actions: ["forbid", "unlock"], expiry: { mode: "RELATIVE", days: 7 } })
    );
    expect(out.interactiveUnlockOnVerify).toBe(true);
    expect(out.expireAfterDays).toBe(7);
  });

  it("unlock + RELATIVE → toUpdate 保持 RELATIVE 且天数透传", () => {
    const out = toUpdateDisposition(
      baseValue({ actions: ["unlock"], expiry: { mode: "RELATIVE", days: 3 } })
    );
    expect(out.interactiveUnlockOnVerify).toBe(true);
    expect(out.expireMode).toBe("RELATIVE");
    expect(out.expireAfterDays).toBe(3);
  });

  it("unlock + KEEP：toUpdate 保持 KEEP，天数 null", () => {
    const out = toUpdateDisposition(baseValue({ actions: ["unlock"], expiry: { mode: "KEEP" } }));
    expect(out.expireMode).toBe("KEEP");
    expect(out.expireAfterDays).toBeNull();
  });

  it("天数与 actions 无关：无论是否勾选 unlock 都正常透传", () => {
    expect(
      toCreateDisposition(baseValue({ actions: ["forbid"], expiry: { mode: "RELATIVE", days: 5 } })).expireAfterDays
    ).toBe(5);
    expect(
      toCreateDisposition(baseValue({ actions: ["forbid", "unlock"], expiry: { mode: "RELATIVE", days: 5 } }))
        .expireAfterDays
    ).toBe(5);
  });

  it("actionsIncludeUnlock", () => {
    expect(actionsIncludeUnlock(["forbid", "unlock"])).toBe(true);
    expect(actionsIncludeUnlock(["forbid"])).toBe(false);
  });

  it("dueSecondaryLabel：拼图+验证解禁无 expireAt → 验证后解禁，而非需人工解除", () => {
    const row: StudentViolationRow = {
      id: 1,
      targetUserId: "u1",
      status: "ACTIVE",
      forbidEnter: 1,
      interactiveUnlockOnVerify: 1,
      interactiveChallenge: "请完成拼图",
      dispositionType: "ACK_PUZZLE",
      expireAt: null,
    };
    expect(dueSecondaryLabel(row)).toBe("验证后解禁");
    expect(summarizeDispositionForDetail(row).strategyLabel).toBe("拼图短语");
    expect(summarizeDispositionForDetail(row).challengePhrase).toBe("请完成拼图");
    expect(summarizeDispositionForDetail(row).unlockOnVerify).toBe("是");
  });

  it("dueSecondaryLabel：永久禁入无验证路径 → 需人工解除", () => {
    const row: StudentViolationRow = {
      id: 2,
      targetUserId: "u1",
      status: "ACTIVE",
      forbidEnter: 1,
      dispositionType: "SHOW_ONLY",
      expireAt: null,
    };
    expect(dueSecondaryLabel(row)).toBe("需人工解除");
  });
});
