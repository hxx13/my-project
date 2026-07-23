import { adminHttp } from "@/api/core/adminHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export type ArchiveUser = {
  userId: string;
  name: string;
  department?: string;
  projectGroup?: string;
  lastScanTime?: string;
  hasConversation: boolean;
  lastGeneratedAt?: string;
  messageCount: number;
  consumed?: boolean;
  consumedAt?: string;
  lastUsageSource?: string;
};

export type ConversationSession = {
  id: number;
  status: string;
  model: string;
  tokenCountTotal: number;
  createTime: string;
  updateTime?: string;
  consumed?: boolean;
  consumedAt?: string;
  lastUsageSource?: string;
  usageWindowStartAt?: string;
};

export type ConversationMessage = {
  id: number;
  role: string;
  content: string;
  tokenCount: number;
  createTime: string;
};

export type ConversationView = {
  userId?: string;
  hasConversation?: boolean;
  session: ConversationSession;
  messages: ConversationMessage[];
  consumed?: boolean;
  consumedAt?: string;
  lastUsageSource?: string;
  usageWindowStartAt?: string;
};

function normalizeConversationView(raw: ConversationView | null | undefined): ConversationView | null {
  if (!raw?.session || !Array.isArray(raw.messages)) return null;
  return raw;
}

/** GET /api/admin/conversation-archive/users → { total, users: ArchiveUser[] } */
export async function fetchArchiveUsers(): Promise<ArchiveUser[]> {
  const res = await adminHttp.get<Result<{ total: number; users: ArchiveUser[] }>>("/conversation-archive/users");
  const body = res.data.data;
  return body?.users ?? [];
}

/** GET /api/admin/conversation-archive/users/{userId}/conversation */
export async function fetchUserConversation(userId: string): Promise<ConversationView | null> {
  const res = await adminHttp.get<Result<ConversationView>>(
    `/conversation-archive/users/${encodeURIComponent(userId)}/conversation`
  );
  return normalizeConversationView(res.data.data);
}

/** POST /api/admin/conversation-archive/users/{userId}/generate — 管理端手动触发单用户对话生成 */
export async function generateUserConversation(userId: string): Promise<ConversationView> {
  const res = await adminHttp.post<Result<ConversationView>>(
    `/conversation-archive/users/${encodeURIComponent(userId)}/generate`
  );
  const view = normalizeConversationView(res.data.data);
  if (!view) throw new Error("生成成功但返回数据格式异常");
  return view;
}

/** DELETE /api/admin/conversation-archive/users/{userId}/conversation */
export async function clearUserConversation(userId: string): Promise<void> {
  await adminHttp.delete(`/conversation-archive/users/${encodeURIComponent(userId)}/conversation`);
}

/** 搜索结果的精简人员信息 */
export type PersonnelHit = {
  userId: string;
  name: string;
  department?: string;
  projectGroup?: string;
};

/** GET /api/admin/conversation-archive/personnel/search */
export async function searchPersonnel(keyword: string, limit = 20): Promise<PersonnelHit[]> {
  const res = await adminHttp.get<Result<PersonnelHit[]>>("/conversation-archive/personnel/search", {
    params: { keyword, limit },
  });
  return res.data.data ?? [];
}

/** POST /api/admin/conversation-archive/users/{userId}/enroll — 手动注册人员到对话列表 */
export async function enrollUser(userId: string): Promise<ConversationView> {
  const res = await adminHttp.post<Result<ConversationView>>(
    `/conversation-archive/users/${encodeURIComponent(userId)}/enroll`
  );
  const view = normalizeConversationView(res.data.data);
  if (!view) throw new Error("注册成功但返回数据格式异常");
  return view;
}

/** SSE 进度事件 */
export type BatchProgressEvent = {
  type: "progress";
  userId: string;
  name: string;
  status: "ok" | "fail";
  error?: string;
  current: number;
  total: number;
};

export type BatchDoneEvent = {
  type: "done";
  total: number;
  success: number;
  failed: number;
  skippedByFilter?: number;
  ignoreUnused?: boolean;
};

export type BatchErrorEvent = {
  type: "error";
  message: string;
};

export type BatchStreamEvent = BatchProgressEvent | BatchDoneEvent | BatchErrorEvent;

/**
 * SSE 流式批量生成对话。根据 consumed 状态选择性加载。
 * @param userIds 为空数组则生成全部符合条件的用户
 * @param ignoreUnused true=无视未使用状态全量生成，false=仅生成 consumed/无对话的用户
 * @param onEvent 每用户推送一次 progress，完成后 done
 */
export async function streamGenerateBatch(
  userIds: string[],
  ignoreUnused: boolean,
  onEvent: (event: BatchStreamEvent) => void,
): Promise<void> {
  const token = (await import("@/features/auth/authStorage")).authStorage.getToken();
  const res = await fetch("/api/admin/conversation-archive/generate-batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ userIds, ignoreUnused }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无响应流");

  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) return;
    try {
      const payload = JSON.parse(dataLines.join("\n")) as BatchStreamEvent;
      onEvent(payload);
    } catch { /* skip malformed */ }
    dataLines = [];
    eventName = "message";
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        flush();
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      } else if (line === "") {
        flush();
      }
    }
  }
  flush();
}
