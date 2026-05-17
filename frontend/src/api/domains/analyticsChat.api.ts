import { authStorage } from "@/features/auth/authStorage";
import type { AnalyticsReportKey } from "@/api/domains/analytics.api";

/** 与后端 AnalyticsChatContextService.REPORT_SCOPE_VIEW_ID 一致：报表下全部配置 */
export const ANALYTICS_CHAT_ALL_VIEWS_ID = 0;

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export type AnalyticsChatSession = {
  id: number;
  reportKey: string;
  viewId: number;
  viewName: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AnalyticsChatMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  thinkingText?: string | null;
  model?: string | null;
  createdAt?: string;
};

async function parseResult<T>(res: Response): Promise<T> {
  const json = (await res.json()) as Result<T>;
  if (!res.ok || !json.success) {
    throw new Error(json.message || "请求失败");
  }
  return json.data;
}

export async function fetchAnalyticsChatSessions(reportKey: AnalyticsReportKey, viewId: number) {
  const res = await fetch(
    `/api/v1/analytics/chat/sessions?reportKey=${encodeURIComponent(reportKey)}&viewId=${viewId}`,
    { headers: authHeaders() }
  );
  return parseResult<AnalyticsChatSession[]>(res);
}

export async function createAnalyticsChatSession(reportKey: AnalyticsReportKey, viewId: number, title?: string) {
  const res = await fetch("/api/v1/analytics/chat/sessions", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ reportKey, viewId, title }),
  });
  return parseResult<AnalyticsChatSession>(res);
}

export async function fetchAnalyticsChatMessages(sessionId: number) {
  const res = await fetch(`/api/v1/analytics/chat/sessions/${sessionId}/messages`, {
    headers: authHeaders(),
  });
  return parseResult<AnalyticsChatMessage[]>(res);
}

export async function renameAnalyticsChatSession(sessionId: number, title: string) {
  const res = await fetch(`/api/v1/analytics/chat/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return parseResult<null>(res);
}

export async function deleteAnalyticsChatSession(sessionId: number) {
  const res = await fetch(`/api/v1/analytics/chat/sessions/${sessionId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return parseResult<null>(res);
}

export type AnalyticsChatStreamHandlers = {
  onThinking?: (text: string) => void;
  onDelta?: (text: string) => void;
  onDone?: (payload: { messageId?: number; model?: string }) => void;
  onError?: (message: string) => void;
};

/** 流式发送（SSE）；勿用 axios，超时需 5 分钟以上 */
export async function streamAnalyticsChatMessage(
  sessionId: number,
  content: string,
  handlers: AnalyticsChatStreamHandlers,
  options?: { refreshContext?: boolean; signal?: AbortSignal }
) {
  const res = await fetch(`/api/v1/analytics/chat/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ content, refreshContext: options?.refreshContext ?? false }),
    signal: options?.signal,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      // ignore
    }
    handlers.onError?.(msg);
    throw new Error(msg);
  }
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("无响应流");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) return;
    const raw = dataLines.join("\n");
    dataLines = [];
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = { text: raw };
    }
    if (eventName === "thinking" && typeof payload.text === "string") {
      handlers.onThinking?.(payload.text);
    } else if (eventName === "delta" && typeof payload.text === "string") {
      handlers.onDelta?.(payload.text);
    } else if (eventName === "done") {
      handlers.onDone?.({
        messageId: typeof payload.messageId === "number" ? payload.messageId : undefined,
        model: typeof payload.model === "string" ? payload.model : undefined,
      });
    } else if (eventName === "error") {
      const msg = typeof payload.message === "string" ? payload.message : "生成失败";
      handlers.onError?.(msg);
    }
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

function authHeaders(): Record<string, string> {
  const token = authStorage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
