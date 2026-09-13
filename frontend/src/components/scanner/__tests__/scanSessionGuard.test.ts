import { beforeEach, describe, expect, it } from "vitest";
import { resetScanSessionGuard, setScanPopupSession, tryBeginScanChannel } from "../scanSessionGuard";

/**
 * 扫码会话守卫：抑制**同一个人**弹窗打开后重复刷卡，但绝不能拦到别人。
 *
 * 回归背景：弹窗打开时，调用方曾把自己的 userId（弹窗里那个人）当 knownUserId 传进来，
 * 于是 `popupUserId === uid` 恒真 —— 只要弹窗开着，**任何人**刷卡都被拦 30 秒。
 */
describe("scanSessionGuard.tryBeginScanChannel", () => {
  beforeEach(() => resetScanSessionGuard());

  it("同一个人（同一 scanKey）在弹窗打开后再刷 → 拦截", () => {
    setScanPopupSession("U1", "CARD-A");
    const r = tryBeginScanChannel("CARD-A");
    expect(r.allow).toBe(false);
    expect(r.allow === false && r.message).toContain("抬起");
  });

  it("弹窗打开时换一个人刷卡 → 放行（关键回归点）", () => {
    setScanPopupSession("U1", "CARD-A");
    expect(tryBeginScanChannel("CARD-B").allow).toBe(true);
    expect(tryBeginScanChannel("CARD-C").allow).toBe(true);
  });

  it("没有弹窗时任何人刷卡都放行", () => {
    expect(tryBeginScanChannel("CARD-A").allow).toBe(true);
    expect(tryBeginScanChannel("CARD-B").allow).toBe(true);
  });

  it("把弹窗里那个人的 userId 当 knownUserId 传进来时，换人也会被误拦——这就是当初的恒真判定", () => {
    setScanPopupSession("U1", "CARD-A");
    expect(tryBeginScanChannel("CARD-B", "U1").allow).toBe(false);
  });

  it("空扫码内容一律拒绝", () => {
    expect(tryBeginScanChannel("   ").allow).toBe(false);
  });

  it("scanKey 大小写/空白归一后仍算同一个人", () => {
    setScanPopupSession("u1", "card-a");
    expect(tryBeginScanChannel(" CARD-A ").allow).toBe(false);
  });
});
