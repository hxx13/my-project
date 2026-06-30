import { useState, useEffect, useRef } from "react";
import { Smartphone } from "lucide-react";
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
  /** 当前扫码人 userId，用于生成手机端直达二维码 */
  studentUserId?: string;
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
  studentUserId: studentUserIdProp,
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

  const open =
    state.enterNoticeReady &&
    snapshot != null &&
    hasCountdownData(snapshot) &&
    !dismissed &&
    !state.exitCelebrateRoomId &&
    !state.confirmingExitRoom;

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

  const hasCountdown = hasCountdownData(snapshot);
  const copy = resolveAutoSignoutCountdownCopy(snapshot.autoSignoutState);
  const isAlreadyInside = state.enterMotionAtCorner;
  const title = isAlreadyInside
    ? `当前已在 ${snapshot.roomName} 内`
    : `已进入 ${snapshot.roomName}`;
  const studentUserId = studentUserIdProp || state.user?.userId || "";

  // QR 底部横条（仅当 studentUserId 存在时渲染）
  const extraContent = studentUserId ? (
    <div className="scan-entry-qr-strip">
      <div className="scan-entry-qr-strip__info">
        <Smartphone className="size-[18px] shrink-0 text-[var(--app-color-text-tertiary)]" strokeWidth={1.5} />
        <span>扫描二维码可实时查看当前状态</span>
      </div>
      <div className="scan-entry-qr-strip__qr">
        <MobileQrCard userId={studentUserId} adaptive />
      </div>
    </div>
  ) : undefined;

  // "我要离开"按钮：仅场内已有+有倒计时+有回调时显示
  const showExitButton = isAlreadyInside && hasCountdown && onRequestExit;

  return (
    <MinimizableNotice
      key={sessionIdRef.current ?? "scan-entry-notice"}
      open={open}
      onDismiss={handleDismiss}
      onPhaseChange={handlePhaseChange}
      title={title}
      description={copy.hint}
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
