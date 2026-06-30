import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPendingScanDelayRequests } from "@/api/domains/scanDelay.api";
import {
  bindScanDelayAlertReadListener,
  useScanDelayReviewAlertStore,
} from "@/store/useScanDelayReviewAlertStore";
import { authStorage, AUTH_USERINFO_UPDATED_EVENT } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  ADMIN_NOTIFICATION_SSE_PUSH_EVENT,
  ADMIN_PENDING_BADGES_REFRESH_EVENT,
} from "@/features/admin/adminPendingBadgesEvents";

export const SCAN_DELAY_PENDING_ALERT_QUERY_KEY = ["scan-delay", "pending", "alert-sync"] as const;

function canSyncAlerts(): boolean {
  return authStorage.hasToken() && hasMinRole(authStorage.getRole(), "STAFF");
}

/**
 * 未审核且未点「已读」：每次刷新 / 切换链接都重新强提醒。
 */
export function ScanDelayPendingAlertSync() {
  const qc = useQueryClient();
  const resetForNavigation = useScanDelayReviewAlertStore((s) => s.resetForNavigation);
  const syncFromPendingList = useScanDelayReviewAlertStore((s) => s.syncFromPendingList);
  const [staffReady, setStaffReady] = useState(canSyncAlerts);

  useEffect(() => {
    const refresh = () => setStaffReady(canSyncAlerts());
    refresh();
    window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => bindScanDelayAlertReadListener(), []);

  const applyPending = useCallback(
    (pending: Awaited<ReturnType<typeof fetchPendingScanDelayRequests>>) => {
      syncFromPendingList(pending);
    },
    [syncFromPendingList]
  );

  const refetchAndSync = useCallback(async () => {
    if (!canSyncAlerts()) return;
    try {
      const pending = await qc.fetchQuery({
        queryKey: SCAN_DELAY_PENDING_ALERT_QUERY_KEY,
        queryFn: fetchPendingScanDelayRequests,
        staleTime: 0,
      });
      applyPending(pending);
    } catch {
      /* 未登录或网络暂不可用时忽略 */
    }
  }, [qc, applyPending]);

  const remindAfterNavigation = useCallback(() => {
    if (!canSyncAlerts()) return;
    resetForNavigation();
    void refetchAndSync();
  }, [resetForNavigation, refetchAndSync]);

  const { data: pending = [] } = useQuery({
    queryKey: SCAN_DELAY_PENDING_ALERT_QUERY_KEY,
    queryFn: fetchPendingScanDelayRequests,
    enabled: staffReady,
    staleTime: 0,
    refetchInterval: staffReady ? 15_000 : false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  /** 刷新页面：首次挂载即重新提醒 */
  useEffect(() => {
    if (!staffReady) return;
    remindAfterNavigation();
  }, [staffReady, remindAfterNavigation]);

  /** 切换 hash 链接 / 浏览器前进后退 */
  useEffect(() => {
    if (!staffReady) return;
    const onRoute = () => remindAfterNavigation();
    window.addEventListener("hashchange", onRoute);
    window.addEventListener("popstate", onRoute);
    return () => {
      window.removeEventListener("hashchange", onRoute);
      window.removeEventListener("popstate", onRoute);
    };
  }, [staffReady, remindAfterNavigation]);

  useEffect(() => {
    if (!staffReady) return;
    applyPending(pending);
  }, [staffReady, pending, applyPending]);

  useEffect(() => {
    const onOnline = () => {
      void refetchAndSync();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refetchAndSync]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        remindAfterNavigation();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [remindAfterNavigation]);

  useEffect(() => {
    const onPush = () => {
      void refetchAndSync();
    };
    window.addEventListener(ADMIN_NOTIFICATION_SSE_PUSH_EVENT, onPush);
    window.addEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, onPush);
    return () => {
      window.removeEventListener(ADMIN_NOTIFICATION_SSE_PUSH_EVENT, onPush);
      window.removeEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, onPush);
    };
  }, [refetchAndSync]);

  return null;
}
