import { authHttp } from "@/api/core/authHttp";
import { authStorage } from "@/features/auth/authStorage";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface AiSession {
  id: number;
  userId: string;
  title: string;
  source?: string;
  contextPage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiMessage {
  id: number;
  sessionId: number;
  seq: number;
  role: "user" | "assistant" | "tool";
  content?: string;
  rawToolCalls?: string;
  toolCallId?: string;
  actorUserId?: string;
  actorRoleSnapshot?: string;
  model?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  createdAt?: string;
}

export interface AiAuditRow {
  id: number;
  createdAt: string;
  userId?: string;
  actorName?: string;
  actorRoleSnapshot?: string;
  sessionId: number;
  sessionTitle?: string;
  userUtterance?: string;
  toolName: string;
  rawArguments?: string;
  requiredCapability?: string;
  capabilityGranted?: number | boolean;
  denialReason?: string;
  executed?: number | boolean;
  rawResult?: string;
  ok?: number | boolean;
  errorMessage?: string;
  confirmedBy?: string;
}

export interface AiPromptPreview {
  layers: Array<{ title: string; source: string; content: string }>;
  finalPrompt: string;
}

// ── REST ──

export async function createAiSession(body?: { contextPage?: string; source?: string }) {
  const res = await authHttp.post<Result<AiSession>>("/v1/ai/sessions", body ?? {});
  return res.data.data;
}

export async function listAiSessions(page = 0, size = 20) {
  const res = await authHttp.get<Result<{ list: AiSession[]; total: number }>>("/v1/ai/sessions", {
    params: { page, size },
  });
  return res.data.data;
}

export async function fetchAiHistory(sessionId: number) {
  const res = await authHttp.get<Result<AiMessage[]>>(`/v1/ai/sessions/${sessionId}/messages`);
  return res.data.data;
}

export interface AiAuditQuery {
  userId?: string;
  sessionId?: number;
  toolName?: string;
  executed?: boolean;
  deniedOnly?: boolean;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export async function fetchAiAuditRows(query: AiAuditQuery = {}) {
  const res = await authHttp.get<Result<{ rows: AiAuditRow[]; total: number }>>("/v1/ai/audit/rows", {
    params: query,
  });
  return res.data.data;
}

export async function fetchAiAuditToolNames() {
  const res = await authHttp.get<Result<string[]>>("/v1/ai/audit/tool-names");
  return res.data.data;
}

export async function fetchAiPromptPreview(contextPage?: string) {
  const res = await authHttp.get<Result<AiPromptPreview>>("/v1/ai/prompt-preview", {
    params: contextPage ? { contextPage } : {},
  });
  return res.data.data;
}

// ── SSE ──

export interface AiStreamHandlers {
  onDelta?: (text: string) => void;
  onTool?: (name: string, status: string) => void;
  onInteraction?: (payload: {
    token: string;
    kind: string;
    question: string;
    options: Array<{ label: string; value: string }>;
    multiSelect?: boolean;
  }) => void;
  onDone?: (messageId?: number) => void;
  onError?: (message: string) => void;
}

/**
 * 发送消息并消费 SSE。
 *
 * 用 fetch + ReadableStream 而不是 EventSource —— EventSource 只支持 GET，
 * 而这里要 POST 消息体。
 */
export async function streamAiMessage(
  sessionId: number,
  content: string,
  handlers: AiStreamHandlers,
  options?: { contextPage?: string; signal?: AbortSignal },
) {
  const token = authStorage.getToken();
  const res = await fetch(`/api/v1/ai/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content, contextPage: options?.contextPage }),
    signal: options?.signal,
  });

  if (!res.ok) {
    const msg = `HTTP ${res.status}`;
    handlers.onError?.(msg);
    throw new Error(msg);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("无响应流");

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
      payload = {};
    }
    if (eventName === "delta" && typeof payload.text === "string") {
      handlers.onDelta?.(payload.text);
    } else if (eventName === "tool") {
      handlers.onTool?.(String(payload.name ?? ""), String(payload.status ?? ""));
    } else if (eventName === "interaction") {
      handlers.onInteraction?.({
        token: String(payload.token ?? ""),
        kind: String(payload.kind ?? ""),
        question: String(payload.question ?? ""),
        options: (payload.options as Array<{ label: string; value: string }>) ?? [],
        multiSelect: Boolean(payload.multiSelect),
      });
    } else if (eventName === "done") {
      handlers.onDone?.(typeof payload.messageId === "number" ? payload.messageId : undefined);
    } else if (eventName === "error") {
      handlers.onError?.(typeof payload.message === "string" ? payload.message : "生成失败");
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
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      } else if (line.trim() === "") {
        flush();
      }
    }
  }
  flush();
}
