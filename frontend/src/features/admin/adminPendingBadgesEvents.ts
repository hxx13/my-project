/** 好友已读等操作后触发，与 AdminLayout 中 fetchPendingBadges 对齐 */
export const ADMIN_PENDING_BADGES_REFRESH_EVENT = "aro-admin-refresh-pending-badges";

/** 后端 SSE 事件名（与 ChatService /api/notifications/stream 推送一致），供员工私聊页订阅 */
export const STAFF_CHAT_SSE_EVENT = "staff_chat";

/** AdminLayout 解析 `staff_chat` SSE 后派发，避免与侧栏重复建立第二条 EventSource（见 StaffMessagesPage） */
export const ADMIN_STAFF_CHAT_PUSH_DETAIL_EVENT = "aro-admin-staff-chat-sse-detail";

export type StaffChatSsePayload = {
  kind?: string;
  conversationId?: string;
  messageId?: string;
  readerUserId?: string;
};

/**
 * AdminLayout 在收到 SSE `notification` 后派发：刷新侧栏角标 + 通知收件箱列表（避免仅在通知子页才订阅 SSE 导致角标不更新）。
 */
export const ADMIN_NOTIFICATION_SSE_PUSH_EVENT = "aro-admin-notification-sse-push";

/** 好友页通讯录/分组在全局右键菜单中变更后，通知好友页刷新列表（与 post-save 策略解耦，仅整表轻量刷新） */
export const ADMIN_STAFF_CONTACTS_REFRESH_EVENT = "aro-admin-staff-contacts-refresh";
