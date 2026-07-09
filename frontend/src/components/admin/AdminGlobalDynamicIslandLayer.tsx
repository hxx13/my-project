import { authStorage } from "@/features/auth/authStorage";
import { hasMinRoleLevel } from "@/features/auth/roleAccess";
import { AdminDynamicIslandStack } from "@/components/admin/AdminDynamicIslandAlert";
import { SwipeFailureBanner } from "@/features/swipe-alert/SwipeFailureBanner";
import { ScanDelayReviewAlerts } from "@/features/scan-delay-alert/ScanDelayReviewAlerts";
import { CageLinkageNoticeBanner } from "@/features/cage-notice/CageLinkageNoticeBanner";
import { useSwipeAlertStore } from "@/store/useSwipeAlertStore";
import { useScanDelayReviewAlertStore } from "@/store/useScanDelayReviewAlertStore";
import { useCageNoticeAlertStore } from "@/store/useCageNoticeAlertStore";

/** 全局灵动岛层：固定宽度栈，聚合延迟审核 / 刷卡失败 / 笼位处理提示等强提醒 */
export function AdminGlobalDynamicIslandLayer() {
  const role = authStorage.getRole();
  const swipeAlerts = useSwipeAlertStore((s) => s.alerts);
  const scanDelayBanner = useScanDelayReviewAlertStore((s) => s.banner);
  const cageNotices = useCageNoticeAlertStore((s) => s.alerts);

  const showSwipe = hasMinRoleLevel(role, 4) && swipeAlerts.length > 0;
  const showScanDelay = scanDelayBanner != null;
  const showCageNotice = hasMinRoleLevel(role, 4) && cageNotices.length > 0;

  if (!showSwipe && !showScanDelay && !showCageNotice) return null;

  return (
    <AdminDynamicIslandStack>
      <ScanDelayReviewAlerts />
      <SwipeFailureBanner />
      <CageLinkageNoticeBanner />
    </AdminDynamicIslandStack>
  );
}
