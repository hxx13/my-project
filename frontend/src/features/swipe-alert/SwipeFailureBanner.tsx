import { useEffect, useRef, useState, useCallback } from "react";
import { useSwipeAlertStore, type SwipeAlertPayload } from "@/store/useSwipeAlertStore";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRoleLevel } from "@/features/auth/roleAccess";
import {
  AdminDynamicIslandCard,
} from "@/components/admin/AdminDynamicIslandAlert";

function SwipeAlertItem({ alert }: { alert: SwipeAlertPayload }) {
  const [leaving, setLeaving] = useState(false);
  const [entering, setEntering] = useState(true);
  const [acked, setAcked] = useState(false);
  const autoDismissRef = useRef<{ leave?: ReturnType<typeof setTimeout>; finish?: ReturnType<typeof setTimeout> }>({});
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDismiss = useSwipeAlertStore((s) => s.startDismiss);
  const finishDismiss = useSwipeAlertStore((s) => s.finishDismiss);
  const isDismissing = useSwipeAlertStore((s) => s.dismissingIds.has(alert.alertId));

  const dur = alert.bannerDurationSec;

  useEffect(() => {
    enterTimerRef.current = setTimeout(() => setEntering(false), 400);
    return () => {
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    };
  }, []);

  /** 出现后自动倒计时关闭，无需先点「已读」 */
  useEffect(() => {
    if (dur <= 0) return;
    const totalMs = dur * 1000;
    const leaveStartMs = Math.max(totalMs - 300, 0);
    autoDismissRef.current.leave = setTimeout(() => setLeaving(true), leaveStartMs);
    autoDismissRef.current.finish = setTimeout(() => finishDismiss(alert.alertId), totalMs);
    return () => {
      if (autoDismissRef.current.leave) clearTimeout(autoDismissRef.current.leave);
      if (autoDismissRef.current.finish) clearTimeout(autoDismissRef.current.finish);
    };
  }, [alert.alertId, dur, finishDismiss]);

  useEffect(() => {
    if (isDismissing && !leaving) {
      setLeaving(true);
      setAcked(true);
      if (autoDismissRef.current.leave) clearTimeout(autoDismissRef.current.leave);
      if (autoDismissRef.current.finish) clearTimeout(autoDismissRef.current.finish);
      const id = setTimeout(() => finishDismiss(alert.alertId), 300);
      return () => clearTimeout(id);
    }
  }, [isDismissing, leaving, alert.alertId, finishDismiss]);

  const handleDismiss = useCallback(() => {
    if (leaving || acked) return;
    setAcked(true);

    const socket = (window as unknown as { __swipeAlertSocket?: { emit: (e: string, p: unknown) => void } })
      .__swipeAlertSocket;
    if (socket) {
      socket.emit("SWIPE_FAILURE_ALERT_ACK", {
        alertId: alert.alertId,
        ruleId: alert.ruleId,
        userId: authStorage.getUserIdFromToken() || authStorage.getRole(),
      });
    }

    startDismiss(alert.alertId);
  }, [leaving, acked, alert.alertId, alert.ruleId, startDismiss]);

  const handleGoToRecords = useCallback(() => {
    window.location.hash = "#/console/admin/dahua-swing-tasks?tab=records";
  }, []);

  const rec = alert.matchedRecords?.[0];

  return (
    <AdminDynamicIslandCard
      tone="violation"
      title={alert.title}
      subtitle={alert.body}
      iconEmoji="🚨"
      entering={entering}
      leaving={leaving}
      showProgress={dur > 0}
      progressDurationSec={dur}
      actions={[
        { label: "查看详情 →", onClick: handleGoToRecords, variant: "secondary" },
        {
          label: "已读 ✓",
          onClick: handleDismiss,
          variant: "primary",
          disabled: acked,
        },
      ]}
    >
      {rec ? (
        <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="admin-dynamic-island-detail-row admin-dynamic-island-detail-row--strong">
            <span className="admin-dynamic-island-detail-name">{rec.personName}</span>
            {rec.mobilePhone ? <span>📱 {rec.mobilePhone}</span> : null}
            {rec.swingTime ? <span style={{ opacity: 0.75 }}>🕐 {rec.swingTime}</span> : null}
          </div>

          <div className="admin-dynamic-island-detail-row">
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
              🚪 {rec.channelName || rec.channelCode}
            </span>
            <span
              className={`admin-dynamic-island-detail-pill ${
                rec.aroStatus === "INSIDE"
                  ? "admin-dynamic-island-detail-pill--success"
                  : rec.aroStatus === "OUTSIDE"
                    ? "admin-dynamic-island-detail-pill--danger"
                    : "admin-dynamic-island-detail-pill--muted"
              }`}
            >
              {rec.aroStatus === "INSIDE" ? "屏障内" : rec.aroStatus === "OUTSIDE" ? "屏障外" : "未知"}
            </span>
            {rec.enterOrExitLabel ? (
              <span
                className={`admin-dynamic-island-detail-pill ${
                  rec.enterOrExit === 1
                    ? "admin-dynamic-island-detail-pill--success"
                    : "admin-dynamic-island-detail-pill--danger"
                }`}
              >
                {rec.enterOrExit === 1 ? "⬆ 进入" : "⬇ 离开"}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </AdminDynamicIslandCard>
  );
}

export function SwipeFailureBanner() {
  const alerts = useSwipeAlertStore((s) => s.alerts);
  const role = authStorage.getRole();

  if (!hasMinRoleLevel(role, 4)) return null;
  if (alerts.length === 0) return null;

  return (
    <>
      {alerts.map((alert) => (
        <SwipeAlertItem key={alert.alertId} alert={alert} />
      ))}
    </>
  );
}
