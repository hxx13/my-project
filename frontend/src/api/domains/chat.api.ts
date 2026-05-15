import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  message: string;
  success: boolean;
  data: T;
}

export type StaffContact = {
  id: string;
  username: string;
  displayNickname: string;
  /** 与工单申请人展示同源（人员库→昵称→登录名） */
  displayName?: string;
  contactGroupId: string;
  /** 后端聚合：该好友发来且未读条数 */
  unreadFromPeer?: number;
};

export type ContactGroup = { id: string; name: string; sortOrder: number };

export async function fetchStaffContacts(params: { keyword?: string; page?: number; size?: number }) {
  const res = await authHttp.get<Result<{ total: number; data: StaffContact[]; page: number; size: number }>>(
    "/chat/staff-contacts",
    { params }
  );
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "加载失败");
  return res.data.data;
}

export async function fetchContactGroups(): Promise<ContactGroup[]> {
  const res = await authHttp.get<Result<{ data: ContactGroup[] }>>("/chat/contact-groups");
  if (!res.data?.success || !res.data?.data?.data) throw new Error(res.data?.message || "加载分组失败");
  return res.data.data.data;
}

export async function createContactGroup(name: string): Promise<ContactGroup> {
  const res = await authHttp.post<Result<{ id: string; name: string; sortOrder: number }>>("/chat/contact-groups", { name });
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "创建失败");
  const d = res.data.data;
  return { id: d.id, name: d.name, sortOrder: d.sortOrder };
}

export async function deleteContactGroup(groupId: string): Promise<void> {
  const res = await authHttp.delete<Result<null>>(`/chat/contact-groups/${encodeURIComponent(groupId)}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除失败");
}

export async function setContactAssignment(peerUserId: string, groupId: string | null): Promise<void> {
  const res = await authHttp.put<Result<null>>("/chat/contact-assignments", {
    peerUserId,
    groupId: groupId || "",
  });
  if (!res.data?.success) throw new Error(res.data?.message || "保存失败");
}

/** 本人通讯录中已存在的 peer user id（含已分组与未分组） */
export async function fetchBookmarkedPeerIds(): Promise<string[]> {
  const res = await authHttp.get<Result<string[]>>("/chat/contact-bookmarks");
  if (!res.data?.success || !Array.isArray(res.data.data)) {
    throw new Error((res.data as { message?: string } | undefined)?.message || "加载通讯录标记失败");
  }
  return res.data.data;
}

export async function addContactBookmark(peerUserId: string): Promise<void> {
  const res = await authHttp.post<Result<null>>(`/chat/contact-bookmarks/${encodeURIComponent(peerUserId)}`);
  if (!res.data?.success) throw new Error(res.data?.message || "加入通讯录失败");
}

export async function removeContactBookmark(peerUserId: string): Promise<void> {
  const res = await authHttp.delete<Result<null>>(`/chat/contact-bookmarks/${encodeURIComponent(peerUserId)}`);
  if (!res.data?.success) throw new Error(res.data?.message || "移除失败");
}

export type ConversationSummary = {
  id: string;
  peerUserId: string;
  peerUsername: string;
  peerDisplayNickname: string;
  lastMessageAt: string;
  /** 有 chat_user_conversation_prefs 表时由后端返回 */
  pinned?: boolean;
};

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await authHttp.get<Result<{ data: ConversationSummary[] }>>("/chat/conversations");
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "加载失败");
  return (res.data.data.data || []).map((row) => ({
    ...row,
    pinned: Boolean(row.pinned),
  }));
}

export async function setConversationPinned(conversationId: string, pinned: boolean): Promise<void> {
  const res = await authHttp.put<Result<null>>(`/chat/conversations/${encodeURIComponent(conversationId)}/pinned`, { pinned });
  if (!res.data?.success) throw new Error(res.data?.message || "操作失败");
}

export async function hideConversationFromMyList(conversationId: string): Promise<void> {
  const res = await authHttp.delete<Result<null>>(`/chat/conversations/${encodeURIComponent(conversationId)}/from-my-list`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除失败");
}

export async function openConversation(peerUserId: string) {
  const res = await authHttp.post<Result<{ conversationId: string }>>(`/chat/conversations/open/${encodeURIComponent(peerUserId)}`);
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "打开会话失败");
  return res.data.data.conversationId;
}

/** 将已读游标推至最新消息（与 /api/me/pending-badges 中 chatUnread 同源） */
export async function markConversationRead(conversationId: string): Promise<void> {
  const res = await authHttp.post<Result<null>>(`/chat/conversations/${encodeURIComponent(conversationId)}/read`);
  if (!res.data?.success) throw new Error(res.data?.message || "标记已读失败");
}

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string;
  attachmentId: string;
  createTime: string;
  attachmentName: string;
  attachmentMime: string;
  attachmentSize: number;
  /** 本人发送且对方已读游标覆盖该条时由后端为 true */
  readByPeer?: boolean;
};

export async function fetchMessages(conversationId: string, afterMessageId?: string, limit = 50) {
  const res = await authHttp.get<Result<{ data: ChatMessage[] }>>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    params: { afterMessageId: afterMessageId || undefined, limit },
  });
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "加载消息失败");
  return res.data.data.data;
}

export async function postChatMessage(conversationId: string, body: { body?: string; attachmentId?: string }) {
  const res = await authHttp.post<Result<{ id: string }>>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, body);
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "发送失败");
  return res.data.data;
}

export async function uploadChatAttachment(conversationId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await authHttp.post<Result<{ attachmentId: string; originalName: string; sizeBytes: number }>>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/attachments`,
    fd,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "上传失败");
  return res.data.data;
}

export async function downloadChatAttachment(attachmentId: string): Promise<Blob> {
  const res = await authHttp.get(`/chat/attachments/${encodeURIComponent(attachmentId)}/download`, {
    responseType: "blob",
  });
  return res.data as Blob;
}
