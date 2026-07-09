import { useEffect, useMemo, useRef } from "react";
import { AdminDynamicIslandCard, type AdminDynamicIslandAction } from "@/components/admin/AdminDynamicIslandAlert";
import { useCageNoticeAlertStore } from "@/store/useCageNoticeAlertStore";

const AUTO_DISMISS_MS = 10_000;

function CageNoticeBannerItem({
  alert,
}: {
  alert: ReturnType<typeof useCageNoticeAlertStore.getState>["alerts"][number];
}) {
  const dismissing = useCageNoticeAlertStore((s) => s.dismissingIds.has(alert.alertId));
  const startDismiss = useCageNoticeAlertStore((s) => s.startDismiss);
  const finishDismiss = useCageNoticeAlertStore((s) => s.finishDismiss);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    autoTimerRef.current = setTimeout(() => startDismiss(alert.alertId), AUTO_DISMISS_MS);
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
  }, [alert.alertId, startDismiss]);

  useEffect(() => {
    if (dismissing) {
      dismissTimerRef.current = setTimeout(() => finishDismiss(alert.alertId), 400);
      return () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); };
    }
  }, [dismissing, alert.alertId, finishDismiss]);

  const actions: AdminDynamicIslandAction[] = useMemo(
    () => [
      {
        label: "知道了",
        variant: "ghost",
        onClick: () => startDismiss(alert.alertId),
      },
    ],
    [alert.alertId, startDismiss],
  );

  return (
    <AdminDynamicIslandCard
      title={alert.title}
      subtitle={alert.body}
      iconEmoji="🐭"
      tone="cage_notice"
      entering
      leaving={dismissing}
      showProgress
      progressDurationSec={AUTO_DISMISS_MS / 1000}
      actions={actions}
    >
      <p className="text-[11px]" style={{ color: "var(--scan-notice-island-body)" }}>
        {alert.targetUserId} · {alert.createdAt?.replace("T", " ").slice(0, 19)}
      </p>
    </AdminDynamicIslandCard>
  );
}

export function CageLinkageNoticeBanner() {
  const alerts = useCageNoticeAlertStore((s) => s.alerts);
  if (alerts.length === 0) return null;
  return (
    <>
      {alerts.map((a) => (
        <CageNoticeBannerItem key={a.alertId} alert={a} />
      ))}
    </>
  );
}
