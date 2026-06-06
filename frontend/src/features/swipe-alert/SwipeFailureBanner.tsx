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

  // Reset leaving state when a new alert arrives (must be before conditional return)
  useEffect(() => {
    if (!activeAlert) return;
    setLeaving(false);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeAlert?.alertId]);

  // Gate: only render for ADMIN+ and when an alert is active
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
    // 点击已读后，按 bannerDurationSec 延时后真正消失（0=立即消失，仅保留离开动画 300ms）
    const delayMs = activeAlert.bannerDurationSec > 0
      ? activeAlert.bannerDurationSec * 1000
      : 300;
    setTimeout(() => dismissAlert(), delayMs);
  };

  // Go to records page (use hash router, not full page navigation)
  const handleGoToRecords = () => {
    window.location.hash = "#/admin/dahua-swing-tasks?tab=records";
  };

  const rec = activeAlert.matchedRecords?.[0];

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
          transition: "opacity .3s, transform .3s cubic-bezier(.16,1,.3,1)",
          animation: leaving ? "none" : "swipe-alert-in .5s cubic-bezier(.16,1,.3,1)",
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
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
            {activeAlert.title}
          </div>

          {/* Body text */}
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, lineHeight: 1.3 }}>
            {activeAlert.body}
          </div>

          {/* Enriched record info — one row per matched person */}
          {rec && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {/* Person info row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#cbd5e1" }}>
                <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{rec.personName}</span>
                {rec.mobilePhone && (
                  <span>📱 {rec.mobilePhone}</span>
                )}
              </div>

              {/* Channel + Status row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#94a3b8" }}>
                <span>🚪 {rec.channelName || rec.channelCode}</span>
                {rec.enterOrExitLabel && (
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600,
                    background: rec.enterOrExit === 1 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                    color: rec.enterOrExit === 1 ? "#4ade80" : "#f87171",
                  }}>
                    {rec.enterOrExit === 1 ? "⬆ 进入" : "⬇ 离开"}
                  </span>
                )}

                {/* ARO current status indicator */}
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "1px 6px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 600,
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
                  {rec.aroStatus === "INSIDE" ? "当前在楼内" :
                   rec.aroStatus === "OUTSIDE" ? "当前在楼外" : "状态未知"}
                </span>
              </div>
            </div>
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
            style={{
              padding: "5px 12px",
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
