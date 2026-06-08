import { useEffect, useRef, useState, useCallback } from "react";
import { useSwipeAlertStore, type SwipeAlertPayload } from "@/store/useSwipeAlertStore";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRoleLevel } from "@/features/auth/roleAccess";

// =========================================================================
// SwipeAlertItem — individual pill in the stack
// =========================================================================

function SwipeAlertItem({
  alert,
}: {
  alert: SwipeAlertPayload;
}) {
  const [leaving, setLeaving] = useState(false);
  const [entering, setEntering] = useState(true);
  const [acked, setAcked] = useState(false); // true after clicking "已读" → countdown starts
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDismiss = useSwipeAlertStore((s) => s.startDismiss);
  const finishDismiss = useSwipeAlertStore((s) => s.finishDismiss);
  const isDismissing = useSwipeAlertStore((s) => s.dismissingIds.has(alert.alertId));

  const dur = alert.bannerDurationSec; // 0 = never auto-dismiss after ack

  // ---- Enter animation ----
  useEffect(() => {
    enterTimerRef.current = setTimeout(() => setEntering(false), 400);
    return () => {
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    };
  }, []);

  // ---- Remote dismiss: watch store's dismissingIds ----
  useEffect(() => {
    if (isDismissing && !leaving) {
      setLeaving(true);
      setAcked(true);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      const id = setTimeout(() => finishDismiss(alert.alertId), 300);
      return () => clearTimeout(id);
    }
  }, [isDismissing, leaving, alert.alertId, finishDismiss]);

  // ---- Local dismiss (click "已读") → ACK broadcast → countdown → auto-dismiss ----
  const handleDismiss = useCallback(() => {
    if (leaving || acked) return;
    setAcked(true);

    // Emit ACK → backend resets cooldown + broadcasts DISMISS to all other clients
    const socket = (window as any).__swipeAlertSocket;
    if (socket) {
      socket.emit("SWIPE_FAILURE_ALERT_ACK", {
        alertId: alert.alertId,
        ruleId: alert.ruleId,
        userId: authStorage.getUserIdFromToken() || authStorage.getRole(),
      });
    }

    // Enter dismissing state (other tabs pick this up)
    startDismiss(alert.alertId);

    // Countdown then auto-dismiss (bannerDurationSec=0 means never auto-dismiss)
    if (dur > 0) {
      const totalMs = dur * 1000;
      const leaveStartMs = Math.max(totalMs - 300, 0);
      dismissTimerRef.current = setTimeout(() => setLeaving(true), leaveStartMs);
      dismissTimerRef.current = setTimeout(() => finishDismiss(alert.alertId), totalMs);
    }
  }, [leaving, acked, alert.alertId, dur, startDismiss, finishDismiss]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const handleGoToRecords = useCallback(() => {
    window.location.hash = "#/admin/dahua-swing-tasks?tab=records";
  }, []);

  const rec = alert.matchedRecords?.[0];
  const showProgress = acked && dur > 0;

  return (
    <div
      style={{
        background: "#0f172a",
        color: "#fff",
        borderRadius: 28,
        padding: "12px 18px",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08) inset",
        backdropFilter: "blur(20px)",
        minWidth: 380,
        maxWidth: 560,
        opacity: leaving ? 0 : 1,
        maxHeight: leaving ? 0 : 200,
        marginBottom: leaving ? 0 : 8,
        overflow: "hidden",
        transform: leaving
          ? "translateY(-12px) scale(0.95)"
          : "translateY(0) scale(1)",
        transition:
          "opacity .3s, max-height .3s, margin-bottom .3s, transform .3s cubic-bezier(.16,1,.3,1)",
        animation: entering
          ? "swipe-alert-stack-in .4s cubic-bezier(.16,1,.3,1)"
          : "none",
      }}
    >
      {/* Icon + pulse ring */}
      <div style={{ position: "relative", flexShrink: 0, width: 36, height: 36, marginTop: 2 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(239,68,68,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            position: "relative",
            zIndex: 1,
          }}
        >
          🚨
        </div>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 36,
            height: 36,
            borderRadius: "50%",
            margin: "-18px 0 0 -18px",
            border: "2px solid rgba(239,68,68,0.6)",
            animation: "swipe-alert-pulse 2s ease-out infinite",
          }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0, position: "relative", paddingBottom: showProgress ? 8 : 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
          {alert.title}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, lineHeight: 1.3 }}>
          {alert.body}
        </div>

        {rec && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#cbd5e1", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{rec.personName}</span>
              {rec.mobilePhone && (
                <span style={{ fontWeight: 700, color: "#f1f5f9", letterSpacing: "0.02em" }}>📱 {rec.mobilePhone}</span>
              )}
              {rec.swingTime && (
                <span style={{ color: "#64748b", fontSize: 10, whiteSpace: "nowrap" }}>
                  🕐 {rec.swingTime}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#94a3b8", flexWrap: "wrap" }}>
              <span style={{ whiteSpace: "nowrap" }}>🚪 {rec.channelName || rec.channelCode}</span>

              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "1px 6px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
                whiteSpace: "nowrap",
                background:
                  rec.aroStatus === "INSIDE" ? "rgba(34,197,94,0.15)" :
                  rec.aroStatus === "OUTSIDE" ? "rgba(239,68,68,0.15)" :
                  "rgba(148,163,184,0.15)",
                color:
                  rec.aroStatus === "INSIDE" ? "#4ade80" :
                  rec.aroStatus === "OUTSIDE" ? "#f87171" :
                  "#94a3b8",
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background:
                    rec.aroStatus === "INSIDE" ? "#4ade80" :
                    rec.aroStatus === "OUTSIDE" ? "#f87171" :
                    "#94a3b8",
                  boxShadow:
                    rec.aroStatus === "INSIDE" ? "0 0 4px #4ade80" :
                    rec.aroStatus === "OUTSIDE" ? "0 0 4px #f87171" :
                    "none",
                }} />
                {rec.aroStatus === "INSIDE" ? "屏障内" :
                 rec.aroStatus === "OUTSIDE" ? "屏障外" : "未知"}
              </span>

              {rec.enterOrExitLabel && (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "1px 6px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  background: rec.enterOrExit === 1 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                  color: rec.enterOrExit === 1 ? "#4ade80" : "#f87171",
                }}>
                  {rec.enterOrExit === 1 ? "⬆ 进入" : "⬇ 离开"}
                </span>
              )}
            </div>
          </div>
        )}

        {showProgress && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              height: 2,
              background: "rgba(239,68,68,0.5)",
              borderRadius: 1,
              animation: `swipe-alert-bar ${alert.bannerDurationSec}s linear forwards`,
            }}
          />
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, marginTop: 2 }}>
        <button
          type="button"
          onClick={handleGoToRecords}
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          查看详情 →
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={acked}
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            border: "none",
            cursor: acked ? "default" : "pointer",
            fontSize: 11,
            fontWeight: 600,
            background: acked ? "rgba(255,255,255,0.15)" : "#fff",
            color: acked ? "rgba(255,255,255,0.5)" : "#0f172a",
            whiteSpace: "nowrap",
            transition: "background .2s, color .2s",
          }}
        >
          {acked ? (dur > 0 ? `已读 · ${dur}s` : "已读 ✓") : "已读 ✓"}
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// SwipeFailureBanner — fixed container with stacked alert pills
// =========================================================================

export function SwipeFailureBanner() {
  const alerts = useSwipeAlertStore((s) => s.alerts);
  const role = authStorage.getRole();

  if (!hasMinRoleLevel(role, 4)) return null;
  if (alerts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes swipe-alert-stack-in {
          0%   { opacity: 0; transform: translateY(-24px) scale(0.85); max-height: 0; margin-bottom: 0; }
          100% { opacity: 1; transform: translateY(0) scale(1); max-height: 200px; margin-bottom: 8px; }
        }
        @keyframes swipe-alert-pulse {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes swipe-alert-bar {
          0%   { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9998,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {alerts.map((alert) => (
          <SwipeAlertItem key={alert.alertId} alert={alert} />
        ))}
      </div>
    </>
  );
}
