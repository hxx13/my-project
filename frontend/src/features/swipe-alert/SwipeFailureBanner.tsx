import { useEffect, useRef, useState } from "react";
import { useSwipeAlertStore } from "@/store/useSwipeAlertStore";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRoleLevel } from "@/features/auth/roleAccess";

export function SwipeFailureBanner() {
  const activeAlert = useSwipeAlertStore((s) => s.activeAlert);
  const dismissAlert = useSwipeAlertStore((s) => s.dismissAlert);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const role = authStorage.getRole();

  // Only render for ADMIN+ (level >= 4)
  if (!activeAlert || !hasMinRoleLevel(role, 4)) {
    return null;
  }

  const handleDismiss = () => {
    setLeaving(true);
    const socket = (window as any).__swipeAlertSocket;
    if (socket) {
      socket.emit("SWIPE_FAILURE_ALERT_ACK", {
        alertId: activeAlert.alertId,
        userId: authStorage.getUserIdFromToken() || authStorage.getRole(),
      });
    }
    setTimeout(() => dismissAlert(), 300);
  };

  // Go to records page
  const handleGoToRecords = () => {
    window.open("/admin/dahua-swing-tasks?tab=records", "_self");
  };

  // Auto-dismiss timer
  useEffect(() => {
    if (!activeAlert) return;
    setLeaving(false);
    if (activeAlert.bannerDurationSec > 0) {
      timerRef.current = setTimeout(() => {
        dismissAlert();
      }, activeAlert.bannerDurationSec * 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeAlert?.alertId]);

  const dur = activeAlert.bannerDurationSec || 10;

  return (
    <>
      {/* Keyframes */}
      <style>{`
        @keyframes swipe-alert-in {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-24px) scale(0.85); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes swipe-alert-pulse {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes swipe-alert-bar {
          0%   { width: calc(100% - 116px); }
          100% { width: 0%; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: leaving
            ? "translateX(-50%) translateY(-20px) scale(0.95)"
            : "translateX(-50%) translateY(0) scale(1)",
          zIndex: 9998,
          background: "#0f172a",
          color: "#fff",
          borderRadius: 28,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow:
            "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08) inset",
          backdropFilter: "blur(20px)",
          minWidth: 340,
          maxWidth: 520,
          opacity: leaving ? 0 : 1,
          transition: "opacity .3s, transform .3s cubic-bezier(.16,1,.3,1)",
          animation: leaving ? "none" : "swipe-alert-in .5s cubic-bezier(.16,1,.3,1)",
        }}
      >
        {/* Icon + pulse ring */}
        <div style={{ position: "relative", flexShrink: 0, width: 36, height: 36 }}>
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
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
            {activeAlert.title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#94a3b8",
              marginTop: 2,
              lineHeight: 1.3,
            }}
          >
            {activeAlert.body}
          </div>
          {/* Countdown bar */}
          {activeAlert.bannerDurationSec > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: -6,
                left: 0,
                height: 2,
                background: "rgba(239,68,68,0.5)",
                borderRadius: 1,
                width: "calc(100% - 116px)",
                animation: `swipe-alert-bar ${dur}s linear forwards`,
              }}
            />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleGoToRecords}
            style={{
              padding: "6px 14px",
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
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              background: "#fff",
              color: "#0f172a",
              whiteSpace: "nowrap",
            }}
          >
            已读 ✓
          </button>
        </div>
      </div>
    </>
  );
}
