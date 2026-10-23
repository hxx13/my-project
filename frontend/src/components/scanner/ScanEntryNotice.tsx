import { useState, useEffect, useRef } from "react";
import { MinimizableNotice } from "@/components/ui/MinimizableNotice";
import {
  hasActiveAutoSignoutCountdown,
  remainingSecondsFromScheduledAt,
  resolveAutoSignoutCountdownCopy,
} from "@/utils/formatCountdown";
import type { PopupState } from "./components/types";
import { MobileQrCard } from "./MobileQrCard";
import "./ScanEntryNotice.css";

/* ═══════════════════════════════════════════════════════════
   ScanEntryNotice — 扫描弹窗进入确认适配器

   动效开始飞向右下角时弹出居中确认弹窗；文案在首次展示时冻结，
   倒计时优先按 scheduledAt 实时推算，避免展开胶囊时回到 29:50。
   ═══════════════════════════════════════════════════════════ */

type NoticeSnapshot = {
  roomName: string;
  autoSignoutState: string | null;
  autoSignoutSecondsRemaining: number | null;
  autoSignoutScheduledAt: string | null;
};

interface ScanEntryNoticeProps {
  state: PopupState;
  roomName: string;
  onDismiss: () => void;
  /** 用户点击"我要离开"时的回调（仅场内+倒计时时显示此按钮） */
  onRequestExit?: () => void;
}

function hasCountdownData(snapshot: NoticeSnapshot): boolean {
  return hasActiveAutoSignoutCountdown(snapshot);
}

export function ScanEntryNotice({
  state,
  roomName,
  onDismiss,
  onRequestExit,
}: ScanEntryNoticeProps) {
  const sessionIdRef = useRef<string | null>(null);
  const enrichedRef = useRef(false);
  const pinnedRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [snapshot, setSnapshot] = useState<NoticeSnapshot | null>(null);

  /* ── 新一轮进入：以 enterCelebrateRoomId 为会话键 ── */
  useEffect(() => {
    const sid = state.enterCelebrateRoomId;
    if (!state.enterNoticeReady || !sid || state.exitCelebrateRoomId) return;
    if (sessionIdRef.current === sid) return;

    sessionIdRef.current = sid;
    enrichedRef.current = false;
    pinnedRef.current = false;
    setDismissed(false);
    setSnapshot({
      roomName,
      autoSignoutState: state.autoSignoutState,
      autoSignoutSecondsRemaining: state.autoSignoutSecondsRemaining,
      autoSignoutScheduledAt: state.autoSignoutScheduledAt,
    });
  }, [
    state.enterNoticeReady,
    state.enterCelebrateRoomId,
    state.exitCelebrateRoomId,
    roomName,
    state.autoSignoutState,
    state.autoSignoutSecondsRemaining,
    state.autoSignoutScheduledAt,
  ]);

  /* ── analyze 刷新稍晚：仅补一次缺失的倒计时字段，已最小化后不再改文案 ── */
  useEffect(() => {
    if (!snapshot || pinnedRef.current || enrichedRef.current) return;
    const snapMissing =
      !snapshot.autoSignoutScheduledAt &&
      (snapshot.autoSignoutSecondsRemaining ?? 0) <= 0;
    const liveScheduled = state.autoSignoutScheduledAt;
    const liveSeconds = state.autoSignoutSecondsRemaining ?? 0;
    if (!snapMissing || (!liveScheduled && liveSeconds <= 0)) return;

    enrichedRef.current = true;
    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            autoSignoutState: state.autoSignoutState,
            autoSignoutSecondsRemaining: liveSeconds > 0 ? liveSeconds : prev.autoSignoutSecondsRemaining,
            autoSignoutScheduledAt: liveScheduled ?? prev.autoSignoutScheduledAt,
          }
        : null
    );
  }, [
    snapshot,
    state.autoSignoutSecondsRemaining,
    state.autoSignoutState,
    state.autoSignoutScheduledAt,
  ]);

  /* ── 离开确认弹窗打开时**不关闭**本通知：它留在下层做稳定底板，
        二级弹窗直接盖上来，避免「一级瞬间消失 → 二级再淡入」的闪屏。 ── */
  const open =
    state.enterNoticeReady &&
    snapshot != null &&
    hasCountdownData(snapshot) &&
    !dismissed &&
    !state.exitCelebrateRoomId;

  const handleDismiss = () => {
    setDismissed(true);
    sessionIdRef.current = null;
    enrichedRef.current = false;
    pinnedRef.current = false;
    setSnapshot(null);
    onDismiss();
  };

  const handleAcknowledge = () => {
    /* do nothing — MinimizableNotice.handleAction 自己调 doMinimize() */
  };

  const handlePhaseChange = (phase: "modal" | "minimizing" | "minimized" | "expanding") => {
    if (phase === "minimized" || phase === "minimizing") {
      pinnedRef.current = true;
    }
  };

  if (!open || !snapshot) return null;

  const copy = resolveAutoSignoutCountdownCopy(snapshot.autoSignoutState);
  const hasCountdown = hasCountdownData(snapshot);
  const description = hasCountdown
    ? snapshot.autoSignoutState === "PENDING_ACTIVATION"
      ? "请在倒计时内刷卡激活，超时自动签退"
      : "倒计时结束后自动签退"
    : copy.hint;
  const isAlreadyInside = state.enterMotionAtCorner;
  const title = isAlreadyInside
    ? `当前已在 ${snapshot.roomName} 内`
    : `已进入 ${snapshot.roomName}`;
  // 本人免登录二维码：可拍照保存，等同登录凭证
  const extraContent = state.user?.userId ? (
    <div className="flex w-full flex-col items-center gap-1">
      <MobileQrCard userId={state.user.userId} showRegenerate={false} />
      <p className="text-[10px] text-center leading-tight" style={{ color: "var(--app-color-text-tertiary)" }}>
        可拍照保存 · 等同登录凭证 · 请勿转发
      </p>
    </div>
  ) : null;

  // "我要离开"按钮：仅场内已有+有倒计时+有回调时显示；正在执行离开(actedRoomId)期间隐藏，避免"确认离开"后又弹一次"我要离开"
  const showExitButton = isAlreadyInside && hasCountdown && onRequestExit && !state.actedRoomId;

  return (
    <MinimizableNotice
      key={sessionIdRef.current ?? "scan-entry-notice"}
      open={open}
      onDismiss={handleDismiss}
      onPhaseChange={handlePhaseChange}
      title={title}
      description={description}
      countdownDeadlineAt={snapshot.autoSignoutScheduledAt}
      countdownSeconds={
        hasCountdown && !snapshot.autoSignoutScheduledAt
          ? snapshot.autoSignoutSecondsRemaining
          : null
      }
      countdownLabel={hasCountdown ? copy.badge : undefined}
      variant="warning"
      minimizable
      extra={extraContent}
      actionLabel="知道了"
      onAction={handleAcknowledge}
      secondaryActionLabel={showExitButton ? "我要离开" : undefined}
      onSecondaryAction={showExitButton ? onRequestExit : undefined}
      cornerOffset={{ x: 24, y: 120 }}
      className="scan-entry-notice"
    />
  );
}
