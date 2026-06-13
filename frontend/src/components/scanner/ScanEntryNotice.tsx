import { useState, useEffect, useRef } from "react";
import { MinimizableNotice } from "@/components/ui/MinimizableNotice";
import { resolveAutoSignoutCountdownCopy } from "@/utils/formatCountdown";
import type { PopupState } from "./components/types";
import "./ScanEntryNotice.css";

/* ═══════════════════════════════════════════════════════════
   ScanEntryNotice — 扫描弹窗进入确认适配器

   动效落点后弹出居中确认弹窗。内部维护 dismissed 标记，
   用户关闭/最小化后不再重复弹出，直到下一次新进入事件。
   ═══════════════════════════════════════════════════════════ */

interface ScanEntryNoticeProps {
  state: PopupState;
  roomName: string;
  onDismiss: () => void;
}

export function ScanEntryNotice({
  state,
  roomName,
  onDismiss,
}: ScanEntryNoticeProps) {
  /* ── 检测新进入事件：enterCornerReady false→true ── */
  const prevReadyRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const wasReady = prevReadyRef.current;
    prevReadyRef.current = state.enterCornerReady;
    /* 新一轮进入（动效落点）→ 重置 dismissed */
    if (!wasReady && state.enterCornerReady) {
      setDismissed(false);
    }
  }, [state.enterCornerReady]);

  /* ── 可见性 ── */
  const open =
    state.enterCornerReady &&
    !dismissed &&
    !state.exitCelebrateRoomId;

  /* ── 关闭胶囊（用户点 ✕ 彻底关闭） ── */
  const handleDismiss = () => {
    setDismissed(true);
    onDismiss();
  };

  /* ── "知道了"：空操作，最小化由 MinimizableNotice 内部接管 ── */
  const handleAcknowledge = () => {
    /* do nothing — MinimizableNotice.handleAction 自己调 doMinimize() */
  };

  if (!open) return null;

  /* ── 数据映射 ── */
  const hasCountdown = (state.autoSignoutSecondsRemaining ?? 0) > 0;
  const copy = resolveAutoSignoutCountdownCopy(state.autoSignoutState);
  const title = `已进入 ${roomName}`;

  return (
    <MinimizableNotice
      open={open}
      onDismiss={handleDismiss}
      title={title}
      description={copy.hint}
      countdownSeconds={hasCountdown ? state.autoSignoutSecondsRemaining : null}
      countdownLabel={hasCountdown ? copy.badge : undefined}
      variant="warning"
      minimizable
      actionLabel="知道了"
      onAction={handleAcknowledge}
      cornerOffset={{ x: 24, y: 120 }}
      className="scan-entry-notice"
    />
  );
}
