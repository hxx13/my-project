import { useEffect, useState } from "react";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRoleLevel } from "@/features/auth/roleAccess";
import { AdminDynamicIslandStack } from "@/components/admin/AdminDynamicIslandAlert";
import { SwipeFailureBanner } from "@/features/swipe-alert/SwipeFailureBanner";
import { ScanDelayReviewAlerts } from "@/features/scan-delay-alert/ScanDelayReviewAlerts";
import { CageLinkageNoticeBanner } from "@/features/cage-notice/CageLinkageNoticeBanner";
import { useSwipeAlertStore } from "@/store/useSwipeAlertStore";
import { useScanDelayReviewAlertStore } from "@/store/useScanDelayReviewAlertStore";
import { useCageNoticeAlertStore } from "@/store/useCageNoticeAlertStore";

function isConsoleRoute(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  return hash.startsWith("#/console");
}

/**
 * 全局灵动岛层：固定宽度栈，聚合延迟审核 / 刷卡失败 / 笼位处理提示等强提醒。
 * 仅限 /console 后台管理路由域生效，H5 移动端 /m/home 等路由不展示。
 */
export function AdminGlobalDynamicIslandLayer() {
  const [onConsole, setOnConsole] = useState(isConsoleRoute);

  useEffect(() => {
    const update = () => setOnConsole(isConsoleRoute());
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  const role = authStorage.getRole();
  const swipeAlerts = useSwipeAlertStore((s) => s.alerts);
  const scanDelayBanner = useScanDelayReviewAlertStore((s) => s.banner);
  const cageNotices = useCageNoticeAlertStore((s) => s.alerts);

  if (!onConsole) return null;

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
