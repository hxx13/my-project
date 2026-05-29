import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, markNotificationRead } from "../api/student.api";
import type { FetchNotificationsParams, NotificationData } from "../api/student.api";

/**
 * 获取通知消息列表
 *
 * 支持按类型筛选和分页。
 * staleTime 设为 30 秒，保证新通知及时送达。
 */
export function useStudentNotifications(params: FetchNotificationsParams = {}) {
  return useQuery<{ data: NotificationData[]; total: number; unreadCount: number }>({
    queryKey: ["student", "notifications", params],
    queryFn: () => fetchNotifications(params),
    staleTime: 30 * 1000,
    retry: 1,
  });
}

/**
 * 标记通知已读
 *
 * 成功后自动刷新通知列表和仪表盘缓存。
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", "notifications"] });
      queryClient.invalidateQueries({ queryKey: ["student", "dashboard"] });
    },
  });
}
