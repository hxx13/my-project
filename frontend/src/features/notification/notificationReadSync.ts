import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsReadByBiz,
  fetchUnreadBizFlags,
  toBizCompositeKey,
  workKindToBizType,
  type BizKeyInput,
} from "@/api/domains/notification.api";
import { ADMIN_PENDING_BADGES_REFRESH_EVENT } from "@/features/admin/adminPendingBadgesEvents";

/** 任意端标记已读后派发，供收件箱/工单列表就地合并状态 */
export const NOTIFICATION_READ_CHANGED_EVENT = "aro-notification-read-changed";

export type NotificationReadChangedDetail = {
  notificationId?: string;
  bizType?: string;
  bizId?: string;
  all?: boolean;
};

export function emitNotificationReadChanged(detail: NotificationReadChangedDetail = {}) {
  window.dispatchEvent(new CustomEvent<NotificationReadChangedDetail>(NOTIFICATION_READ_CHANGED_EVENT, { detail }));
  window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
}

export async function markNotificationReadSynced(id: string, detail?: NotificationReadChangedDetail) {
  await markNotificationRead(id);
  emitNotificationReadChanged({ notificationId: id, ...detail });
}

export async function markBizNotificationsReadSynced(bizType: string, bizId: string) {
  await markNotificationsReadByBiz(bizType, bizId);
  emitNotificationReadChanged({ bizType, bizId });
}

export async function markAllNotificationsReadSynced() {
  await markAllNotificationsRead();
  emitNotificationReadChanged({ all: true });
}

export async function loadUnreadBizFlagMap(keys: BizKeyInput[]): Promise<Record<string, boolean>> {
  if (!keys.length) return {};
  const flags = await fetchUnreadBizFlags(keys);
  const out: Record<string, boolean> = {};
  for (const k of keys) {
    const ck = toBizCompositeKey(k.bizType, k.bizId);
    out[ck] = !!flags[ck];
  }
  return out;
}

export function bizKeyFromWorkKind(workKind: "claim" | "repair" | "purchase" | "material" | "scanDelay", id: string): BizKeyInput | null {
  const bizType = workKindToBizType(workKind);
  if (!bizType || !id) return null;
  return { bizType, bizId: id };
}

/** 学生审核页：物资申领 / 延迟免冻结通知跳转 */
export function navigateStudentReviewFromBiz(bizType?: string | null): boolean {
  if (bizType === "SCAN_DELAY") {
    window.location.hash = "#/admin/material/review?tab=scanDelay";
    return true;
  }
  if (bizType === "MATERIAL_REQUEST") {
    window.location.hash = "#/admin/material/review";
    return true;
  }
  return false;
}
