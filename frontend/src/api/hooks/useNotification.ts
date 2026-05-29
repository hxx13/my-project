import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/api/domains/notification.api";
import { fetchPendingBadges } from "@/api/domains/me.api";
import { toast } from "react-hot-toast";

export function useNotificationList(params?: { page?: number; size?: number }) {
  return useQuery({
    queryKey: queryKeys.notification.list(params),
    queryFn: () => fetchNotifications(params?.page, params?.size),
    placeholderData: (prev) => prev,
  });
}

export function useNotificationUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notification.unreadCount(),
    queryFn: async () => {
      const badges = await fetchPendingBadges();
      const notifyText = badges?.notifyText?.trim();
      if (notifyText) {
        const n = parseInt(notifyText, 10);
        if (!Number.isNaN(n) && String(n) === notifyText) return n;
      }
      return badges?.notify ?? 0;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notification.all });
      qc.invalidateQueries({ queryKey: queryKeys.me.pendingBadges() });
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notification.all });
      qc.invalidateQueries({ queryKey: queryKeys.me.pendingBadges() });
      toast.success("已全部标记为已读");
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}
