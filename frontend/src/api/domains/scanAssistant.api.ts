import { authStorage } from "@/features/auth/authStorage";
import type { ScanAssistantMessageKind } from "@/store/useScanAssistantStore";

/** 与后端 ScanAssistantContextPackage 对齐 */
export type ScanAssistantContextPackage = {
  scenario: ScanAssistantMessageKind | string;
  generatedAt: string;
  person?: {
    userId?: string;
    name?: string;
    role?: string;
    department?: string;
    projectGroup?: string;
    group?: string;
    rpgLevel?: number;
  };
  access?: {
    action?: "enter" | "exit" | "stay" | "blocked";
    currentState?: string;
    todayEntryRank?: number;
    todayEntryCount?: number;
    todayScanCount?: number;
    isFirstEntryToday?: boolean;
    lastVisitGap?: string;
    personTodayMinutes?: number;
    globalUserState?: number;
    hasPhysicalCardMapping?: boolean;
    scanPopupEntryAllowedNow?: boolean;
  };
  rooms?: {
    primaryRoom?: string;
    allowedRoomNames?: string[];
    pendingRoomNames?: string[];
    allowedCount?: number;
    pendingCount?: number;
    currentInside?: boolean;
  };
  notices?: {
    violationTitle?: string;
    violationEnterLocked?: boolean;
    violationRemainingAllowance?: number;
    violationRuleName?: string;
    unboundNotice?: string;
    unboundEnterLocked?: boolean;
    entryWindowBlocked?: boolean;
  };
  facility?: {
    todayTotalEntries?: number;
    todayTotalScans?: number;
    activeInsideCount?: number;
    pudongEntries?: number;
    puxiEntries?: number;
  };
  temporal?: {
    timeOfDay?: "morning" | "afternoon" | "evening" | "night";
    dayOfWeek?: string;
    businessDayStart?: string;
  };
  promptHints?: {
    tone?: string;
    maxSentences?: number;
  };
};

export type ScanAssistantSpeakContext = Record<string, string | number | boolean | null | undefined | string[]>;

export type ScanAssistantStreamHandlers = {
  onStarted?: () => void;
  onDelta?: (text: string, fallback?: boolean) => void;
  onDone?: (payload: { text?: string; model?: string; sessionId?: number }) => void;
  onError?: (message: string) => void;
};

export type ScanAssistantArchiveWelcome = {
  hasWelcome: boolean;
  text?: string;
  source?: "per_user" | "scan_live" | string;
  sessionId?: number;
  /** 最新一条助手消息的 ID（用于服务端语音文件定位） */
  lastAssistantMessageId?: number;
  updateTime?: string;
  /** 本次请求现场刚同步生成 */
  justGenerated?: boolean;
  reason?: string;
};

function authHeaders(): Record<string, string> {
  const token = authStorage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 获取结构化 AI 上下文数据包（调试/预览） */
export async function fetchScanAssistantContext(
  kind: ScanAssistantMessageKind,
  context: ScanAssistantSpeakContext,
): Promise<ScanAssistantContextPackage> {
  const res = await fetch("/api/v1/twin/scan-assistant/context", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ kind, context }),
  });
  if (!res.ok) {
    throw new Error(`获取助手上下文失败: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: ScanAssistantContextPackage; message?: string };
  if (!json.data) {
    throw new Error(json.message ?? "无上下文数据");
  }
  return json.data;
}

/** 从 conversation-archive 读取该用户最新助手欢迎语（只读，供气泡预填） */
export async function fetchScanAssistantArchiveWelcome(
  context: ScanAssistantSpeakContext,
): Promise<ScanAssistantArchiveWelcome> {
  const res = await fetch("/api/v1/twin/scan-assistant/conversation/welcome", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "welcome", context }),
  });
  if (!res.ok) {
    throw new Error(`读取存档欢迎语失败: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: ScanAssistantArchiveWelcome; message?: string };
  return json.data ?? { hasWelcome: false };
}

/** 标记预生成对话已被载体使用（auto：10 分钟内合并；click：每次点击计数） */
export async function markScanAssistantConversationUsed(
  context: ScanAssistantSpeakContext,
  usageSource: "auto" | "click",
): Promise<{ marked?: boolean; shouldRegenerate?: boolean }> {
  const res = await fetch("/api/v1/twin/scan-assistant/conversation/mark-used", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ context, usageSource }),
  });
  if (!res.ok) return { marked: false };
  const json = (await res.json()) as { data?: { marked?: boolean; shouldRegenerate?: boolean } };
  return json.data ?? { marked: false };
}

/** 流式扫码助手播报（SSE）；勿用 axios */
export async function streamScanAssistantSpeak(
  kind: ScanAssistantMessageKind,
  context: ScanAssistantSpeakContext,
  handlers: ScanAssistantStreamHandlers,
  options?: { signal?: AbortSignal },
) {
  const res = await fetch("/api/v1/twin/scan-assistant/speak/stream", {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ kind, context }),
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

  /** 按 SSE 块（空行分隔）派发；勿在 event: 行提前 flush，否则 data 在 event 之前时会丢包 */
  const dispatchEvent = () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }
    const raw = dataLines.join("\n");
    dataLines = [];
    const name = eventName;
    eventName = "message";

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = { text: raw };
    }

    if (import.meta.env.DEV) {
      console.debug("[scan-assistant] SSE", name, payload);
    }

    if (name === "delta" && typeof payload.text === "string") {
      handlers.onDelta?.(payload.text, payload.fallback === true);
    } else if (name === "started") {
      handlers.onStarted?.();
    } else if (name === "done") {
      handlers.onDone?.({
        text: typeof payload.text === "string" ? payload.text : undefined,
        model: typeof payload.model === "string" ? payload.model : undefined,
        sessionId: typeof payload.sessionId === "number" ? payload.sessionId : undefined,
      });
    } else if (name === "error") {
      const msg = typeof payload.message === "string" ? payload.message : "播报失败";
      handlers.onError?.(msg);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "") {
        dispatchEvent();
      } else if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
  }
  if (buffer.trim().length > 0) {
    if (buffer.startsWith("event:")) {
      eventName = buffer.slice(6).trim();
    } else if (buffer.startsWith("data:")) {
      dataLines.push(buffer.slice(5).trimStart());
    }
  }
  dispatchEvent();
}

/** 提问/问好共用的 SSE 流式解析 */
async function postAskSse(
  url: string,
  body: unknown,
  handlers: ScanAssistantStreamHandlers,
  options?: { signal?: AbortSignal },
) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body ?? {}),
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
  if (!reader) throw new Error("无响应流");

  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const dispatchEvent = () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }
    const raw = dataLines.join("\n");
    dataLines = [];
    const name = eventName;
    eventName = "message";

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = { text: raw };
    }

    if (name === "delta" && typeof payload.text === "string") {
      handlers.onDelta?.(payload.text, payload.fallback === true);
    } else if (name === "started") {
      handlers.onStarted?.();
    } else if (name === "done") {
      handlers.onDone?.({
        text: typeof payload.text === "string" ? payload.text : undefined,
        model: typeof payload.model === "string" ? payload.model : undefined,
        sessionId: typeof payload.sessionId === "number" ? payload.sessionId : undefined,
      });
    } else if (name === "error") {
      handlers.onError?.(typeof payload.message === "string" ? payload.message : "提问失败");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "") dispatchEvent();
      else if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
  }
  if (buffer.trim().length > 0) {
    if (buffer.startsWith("event:")) eventName = buffer.slice(6).trim();
    else if (buffer.startsWith("data:")) dataLines.push(buffer.slice(5).trimStart());
  }
  dispatchEvent();
}

/** 智能载体提问（SSE 流式） */
export async function streamScanAssistantAsk(
  question: string,
  handlers: ScanAssistantStreamHandlers,
  options?: { signal?: AbortSignal },
) {
  return postAskSse("/api/v1/twin/scan-assistant/ask/stream", { question }, handlers, options);
}

/** 智能载体主动问好（打开面板即触发，SSE 流式） */
export async function streamScanAssistantGreet(
  handlers: ScanAssistantStreamHandlers,
  options?: { signal?: AbortSignal },
) {
  return postAskSse("/api/v1/twin/scan-assistant/ask/greet/stream", {}, handlers, options);
}

/** 触发一次主动播报，返回播报文本或空 */
export async function triggerProactiveBroadcast(): Promise<{ text: string; hasBroadcast: boolean }> {
  const res = await fetch("/api/v1/twin/scan-assistant/broadcast/proactive", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`主动播报失败: HTTP ${res.status}`);
  }
  return (await res.json()) as { text: string; hasBroadcast: boolean };
}

/** 重置对话会话 */
export async function resetScanAssistantConversation(): Promise<{ ok: boolean; sessionId: number }> {
  const res = await fetch("/api/v1/twin/scan-assistant/conversation/reset", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`重置对话失败: HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; sessionId: number };
}
