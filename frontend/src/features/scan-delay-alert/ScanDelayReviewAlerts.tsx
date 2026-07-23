import { useCallback, useEffect, useState } from "react";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  AdminDynamicIslandCard,
} from "@/components/admin/AdminDynamicIslandAlert";
import {
  scanDelayReviewHash,
  useScanDelayReviewAlertStore,
} from "@/store/useScanDelayReviewAlertStore";

function goReview(requestId?: string) {
  window.location.hash = scanDelayReviewHash(requestId);
}

/** 延迟免冻结强提醒：与刷卡失败等共用全局灵动岛组件 */
export function ScanDelayReviewAlerts() {
  const role = authStorage.getRole();
  const banner = useScanDelayReviewAlertStore((s) => s.banner);
  const markAlertRead = useScanDelayReviewAlertStore((s) => s.markAlertRead);
  const dismissBannerForSession = useScanDelayReviewAlertStore((s) => s.dismissBannerForSession);
  const dismissBanner = useScanDelayReviewAlertStore((s) => s.dismissBanner);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (!banner) return;
    setEntering(true);
    const t = window.setTimeout(() => setEntering(false), 320);
    return () => window.clearTimeout(t);
  }, [banner?.requestId, banner?.title]);

  const onGoReview = useCallback(() => {
    if (!banner) return;
    goReview(banner.requestId);
    dismissBanner();
  }, [banner, dismissBanner]);

  const onMarkRead = useCallback(() => {
    if (!banner) return;
    void markAlertRead(banner.requestId);
  }, [banner, markAlertRead]);

  const onClose = useCallback(() => {
    if (!banner) return;
    dismissBannerForSession(banner.requestId);
  }, [banner, dismissBannerForSession]);

  if (!hasMinRole(role, "STAFF") || !banner) return null;

  return (
    <AdminDynamicIslandCard
        tone="announcement"
        iconEmoji="⏱"
        title={banner.title}
        subtitle={banner.summary}
        entering={entering}
        actions={[
          { label: "去审核", onClick: onGoReview, variant: "primary" },
          { label: "已读", onClick: onMarkRead, variant: "secondary" },
          { label: "×", onClick: onClose, variant: "ghost" },
        ]}
      />
  );
}
