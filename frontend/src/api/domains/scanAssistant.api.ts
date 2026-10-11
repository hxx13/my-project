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

/** 用量进度：每完成一轮模型调用推一次（粒度是「轮」，不是逐 token）。 */
export interface ScanAssistantUsage {
  /** 模型调用累计耗时。**不含工具执行** —— 想拿用户实际等待时长用 wallMs。 */
  latencyMs: number;
  /** 其中模型调用占的毫秒。 */
  modelMs?: number;
  /** 其中工具执行占的毫秒。用户等了 20 秒却显示 4 秒，差额就在这里。 */
  toolMs?: number;
  /** 用户实际等待的墙钟时长（模型 + 工具）。「用时」该显示的是它。 */
  wallMs?: number;
  /**
   * **真正的思考用时**（毫秒）：请求发出 → 第一个非思考增量到达。
   *
   * <p>与 {@link wallMs} 是两个数：那个是「用户等了多久」（大头往往是工具在查数据），
   * 这个是「模型想了多久」。**界面上要显示的是后者**（用户 2026-10-11 明确）。
   * 负值 = 这一轮没测到，别显示。
   */
  thinkingMs?: number;
  /** 思考消耗的 token（上游精确给出）。用来显示「思考了多少」。 */
  reasoningTokens?: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  turns: number;
  model?: string;
}

export type ScanAssistantStreamHandlers = {
  onStarted?: () => void;
  onDelta?: (text: string, fallback?: boolean) => void;
  /**
   * 模型的**思考正文**。与 onDelta 分开：界面上思考要折叠、正文常显，
   * 混进一条流就没法只折叠前半段。
   */
  onReasoning?: (text: string) => void;
  /** 工具的**人话动作短语**（「正在汇总 148 个板块…」）。与 onTool 的机器码 status 不是一回事。 */
  onToolProgress?: (name: string, phrase: string) => void;
  onUsage?: (usage: ScanAssistantUsage) => void;
  /** 载体需要用户从候选项里挑一个时触发（如「该人的可选房间」）。选项是结构化的，不是正文。 */
  onInteraction?: (payload: {
    token: string;
    kind: string;
    question: string;
    /** `note` 是「选它会怎样」的一句备注，可空（模型自己写的选项常带，工具查出来的通常没有）。 */
    options: Array<{ label: string; value: string; note?: string }>;
    multiSelect?: boolean;
  }) => void;
  onDone?: (payload: { text?: string; model?: string; sessionId?: number; messageId?: number } & Partial<ScanAssistantUsage>) => void;
  onError?: (message: string) => void;
  /**
   * 助手要把用户送到某个页面（「帮我打开流水线日志」）。
   *
   * path 来自服务端的页面清单，**不是模型编的**；但它是注册表里的 canonical 形式
   * （`/admin/xxx`），真正可 navigate 的路径要用 toAdminRoutePath 转一次。
   */
  onNavigate?: (payload: { path: string; label?: string }) => void;
  /**
   * 助手算好了一次导出，让**载体**用它自己的登录态去拉文件（后端不签发公开下载链接）。
   * 载荷形如 {kind:"materialAudit", label:"课题组审计-…", params:{tab,from,to,…}}。
   *
   * `exportId` 是这条导出在服务端的档案号：**下载完把那份字节交回这个号归档**，
   * 历史里再下拿到的就与当时逐字节相同；用户要改这份文件时，也是对这条档案动手。
   */
  onDownload?: (payload: {
    kind?: string;
    label?: string;
    params?: Record<string, unknown>;
    exportId?: number;
  }) => void;
  /**
   * 工具进度：running / done / failed。
   *
   * 长任务（截图、定时）在对话里**可见**全靠它 —— 没有它，用户看不出是在跑还是已经黄了。
   */
  onTool?: (payload: { name: string; status: string }) => void;
  /**
   * 助手要在对话里**放一张图**（截图等）。
   *
   * `path` 有值 = **载体自己去截**：先跳到这一页、等它渲染稳，再把当前画面截下来 ——
   * 截到的就是提问者本人的视角（他的登录态、数据、视口），服务端不需要注入任何身份。
   * `path` 为空 = 图**已经产好了**，按 `exportId` 去产物接口取字节显示。
   *
   * 两种都要把拿到的字节**交回 `exportId` 归档**（与导出同一条口径），否则切走再回来那张图就没了。
   */
  onImage?: (payload: { exportId?: number; label?: string; path?: string }) => void;
};

/** 会话里的一条导出产物（历史回放据此把下载卡放回原位） */
export type AssistantExportArtifact = {
  exportId: number;
  kind: string;
  label?: string;
  filename?: string;
  messageId?: number;
  sourceId?: number;
  /** 有没有文件本体：没有 = 只是给过下载按钮，还没真下过 */
  hasFile: boolean;
  /** 重跑这次导出要用的参数（没归档过时靠它重建下载） */
  params?: Record<string, unknown>;
  createdAt?: string;
};

function parseUsage(payload: Record<string, unknown>): ScanAssistantUsage | null {
  if (typeof payload.totalTokens !== "number") return null;
  return {
    latencyMs: typeof payload.latencyMs === "number" ? payload.latencyMs : 0,
    modelMs: typeof payload.modelMs === "number" ? payload.modelMs : undefined,
    toolMs: typeof payload.toolMs === "number" ? payload.toolMs : undefined,
    wallMs: typeof payload.wallMs === "number" ? payload.wallMs : undefined,
    thinkingMs: typeof payload.thinkingMs === "number" ? payload.thinkingMs : undefined,
    reasoningTokens: typeof payload.reasoningTokens === "number" ? payload.reasoningTokens : undefined,
    promptTokens: typeof payload.promptTokens === "number" ? payload.promptTokens : 0,
    completionTokens: typeof payload.completionTokens === "number" ? payload.completionTokens : 0,
    totalTokens: payload.totalTokens,
    turns: typeof payload.turns === "number" ? payload.turns : 1,
    model: typeof payload.model === "string" ? payload.model : undefined,
  };
}

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
    } else if (name === "reasoning" && typeof payload.text === "string") {
      handlers.onReasoning?.(payload.text);
    } else if (name === "toolProgress") {
      handlers.onToolProgress?.(
        typeof payload.name === "string" ? payload.name : "",
        typeof payload.phrase === "string" ? payload.phrase : "",
      );
    } else if (name === "started") {
      handlers.onStarted?.();
    } else if (name === "interaction") {
      handlers.onInteraction?.({
        token: String(payload.token ?? ""),
        kind: String(payload.kind ?? ""),
        question: String(payload.question ?? ""),
        options: Array.isArray(payload.options)
          ? (payload.options as Array<{ label: string; value: string; note?: string }>)
          : [],
        multiSelect: payload.multiSelect === true,
      });
    } else if (name === "usage") {
      const usage = parseUsage(payload);
      if (usage) handlers.onUsage?.(usage);
    } else if (name === "done") {
      handlers.onDone?.({
        text: typeof payload.text === "string" ? payload.text : undefined,
        model: typeof payload.model === "string" ? payload.model : undefined,
        sessionId: typeof payload.sessionId === "number" ? payload.sessionId : undefined,
        ...(parseUsage(payload) ?? {}),
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
    } else if (name === "reasoning" && typeof payload.text === "string") {
      handlers.onReasoning?.(payload.text);
    } else if (name === "toolProgress") {
      handlers.onToolProgress?.(
        typeof payload.name === "string" ? payload.name : "",
        typeof payload.phrase === "string" ? payload.phrase : "",
      );
    } else if (name === "started") {
      handlers.onStarted?.();
    } else if (name === "interaction") {
      handlers.onInteraction?.({
        token: String(payload.token ?? ""),
        kind: String(payload.kind ?? ""),
        question: String(payload.question ?? ""),
        options: Array.isArray(payload.options)
          ? (payload.options as Array<{ label: string; value: string; note?: string }>)
          : [],
        multiSelect: payload.multiSelect === true,
      });
    } else if (name === "usage") {
      const usage = parseUsage(payload);
      if (usage) handlers.onUsage?.(usage);
    } else if (name === "done") {
      handlers.onDone?.({
        text: typeof payload.text === "string" ? payload.text : undefined,
        model: typeof payload.model === "string" ? payload.model : undefined,
        sessionId: typeof payload.sessionId === "number" ? payload.sessionId : undefined,
        // 这一轮助手消息的 id：倒计时/产物要按它挂回原位，缺了就只能挂到最后一条
        messageId: typeof payload.messageId === "number" ? payload.messageId : undefined,
        ...(parseUsage(payload) ?? {}),
      });
    } else if (name === "error") {
      handlers.onError?.(typeof payload.message === "string" ? payload.message : "提问失败");
    } else if (name === "navigate" && typeof payload.path === "string" && payload.path) {
      handlers.onNavigate?.({
        path: payload.path,
        label: typeof payload.label === "string" ? payload.label : undefined,
      });
    } else if (name === "download") {
      // 球球那条链把载荷包成 {payload:"<json>"}（适配层只做搬运），网关那条直接给对象 —— 两种都收
      let dl: Record<string, unknown> | null = null;
      if (typeof payload.payload === "string" && payload.payload) {
        try { dl = JSON.parse(payload.payload) as Record<string, unknown>; } catch { dl = null; }
      } else if (typeof payload.kind === "string") {
        dl = payload;
      }
      if (dl) handlers.onDownload?.(dl as { kind?: string; label?: string; params?: Record<string, unknown> });
    } else if (name === "tool") {
      handlers.onTool?.({
        name: typeof payload.name === "string" ? payload.name : "",
        status: typeof payload.status === "string" ? payload.status : "",
      });
    } else if (name === "image") {
      handlers.onImage?.({
        exportId: typeof payload.exportId === "number" ? payload.exportId : undefined,
        label: typeof payload.label === "string" ? payload.label : undefined,
        path: typeof payload.path === "string" && payload.path ? payload.path : undefined,
      });
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
  options?: {
    signal?: AbortSignal;
    /** 继续某条历史会话（服务端校验归属，跨用户一律拒） */
    sessionId?: number | null;
    /** 开一条新会话；与 sessionId 互斥，sessionId 优先 */
    newSession?: boolean;
    /**
     * **临时会话**（刷卡后那次对话）：一律新开、不复用上一次的上下文，并且不进「历史对话」列表。
     * 与 newSession 的区别就在最后一条。
     */
    ephemeral?: boolean;
    /** 本轮附图（data URL），按顺序拼进本轮消息 */
    images?: string[];
    /**
     * 本轮附带的表格/文本文件（xlsx / xls / md / txt），data URL。
     *
     * 与图片不同：服务端会**解析并落库**，消息里只拼一段预览，所以后续追问仍看得见这份文件。
     */
    spreadsheets?: Array<{ filename: string; data: string }>;
    /**
     * 提问时所在的页面路径（如 `/content-manager/content`）。
     *
     * **只用于工具路由**：站在内容管理页问「帮我发个通知」时，靠它把「门户内容」那组工具带上，
     * 而不是只靠题目里的词去猜。它**不参与权限判定** —— 权限只看服务端解出来的身份。
     */
    contextPage?: string;
  },
) {
  return postAskSse(
    "/api/v1/twin/scan-assistant/ask/stream",
    {
      question,
      ...(options?.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options?.newSession ? { newSession: true } : {}),
      ...(options?.ephemeral ? { ephemeral: true } : {}),
      ...(options?.images && options.images.length > 0 ? { images: options.images } : {}),
      ...(options?.spreadsheets && options.spreadsheets.length > 0
        ? { spreadsheets: options.spreadsheets }
        : {}),
      ...(options?.contextPage ? { contextPage: options.contextPage } : {}),
    },
    handlers,
    options,
  );
}

/**
 * 回应一次挂起（确认 / 取消）并从挂起处继续。
 *
 * 走网关自己的接口，不是 ask/stream —— 挂起态在服务端，这里**只回传选择值**。
 * token 是那张凭证；当成新消息发出去只会让那条待办的调用被当孤儿丢掉（点了确认却什么都没执行）。
 */
export async function streamAiInteraction(
  sessionId: number,
  token: string,
  value: string,
  handlers: ScanAssistantStreamHandlers,
  options?: { signal?: AbortSignal },
) {
  return postAskSse(
    `/api/v1/ai/sessions/${sessionId}/interactions/${encodeURIComponent(token)}/stream`,
    { value },
    handlers,
    options,
  );
}

/** 球球的历史对话条目 */
export type AssistantSession = {

  id: number;
  title?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** 历史对话里的消息（展示用） */
export type AssistantHistoryMessage = {
  id: number;
  role: string;
  content: string;
  createdAt?: string;
  /** 会话内**顺序号**（服务端权威顺序）。分页往前翻时按它做游标（`beforeSeq`）。 */
  seq?: number;
  /**
   * 这一轮模型的**思考正文**。服务端一直存着（`ai_message.reasoning_content`），
   * 回看历史时照常返回 —— 本地缓存里**故意不放**它（太长，会撑爆 sessionStorage），
   * 所以「切走再切回来」靠这一路把它捞回来。
   */
  reasoningContent?: string;
  /** 思考消耗的 token，用于折叠标题。 */
  reasoningTokens?: number;
  /**
   * 那一轮的用量。服务端**一直存着**（`ai_message` 的 latency/prompt/completion），
   * 只是回看历史这条路上此前没接出来 —— 于是翻旧对话时「用时 · tokens」那行是空的，
   * 而同一行上的赞/踩图标却照常显示，看起来像「点赞把数字挤掉了」。
   */
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  /** 真正的思考用时（毫秒）。老消息是空的（那一列当初还不存在），回看时就只显示总量。 */
  thinkingMs?: number;
};

/**
 * 会话列表。**只留 source=scan 的** —— 那是球球自己的会话；同一个人可能还有别的来源会话，
 * 混进来点开会跳到一个不认识的话题。
 */
export async function fetchAssistantSessions(page = 0, size = 50): Promise<AssistantSession[]> {
  const res = await fetch(`/api/v1/ai/sessions?page=${page}&size=${size}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`会话列表读取失败: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { list?: AssistantSession[] } };
  const list = body?.data?.list ?? [];
  return list.filter((s) => (s.source ?? "scan") === "scan");
}

/** 删除一条对话（服务端软删：列表/续聊不再出现，审计留痕保留） */
export async function deleteAssistantSession(sessionId: number): Promise<void> {
  const res = await fetch(`/api/v1/ai/sessions/${sessionId}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`删除失败: HTTP ${res.status}`);
}

/**
 * 某条历史会话的消息（用于「点开旧对话接着聊」）。
 *
 * **默认只取最后一屏**（`limit`），更早的靠 `beforeSeq` 往前翻一页 —— 长会话几百条，
 * 一次全量既慢又白费，而用户打开旧对话先看的几乎总是最后那几屏。
 * **不传 limit 仍是全量**（老调用方行为不变）。
 */
export async function fetchAssistantSessionMessages(
  sessionId: number,
  options?: { limit?: number; beforeSeq?: number },
): Promise<AssistantHistoryMessage[]> {
  const params = new URLSearchParams();
  if (options?.limit && options.limit > 0) params.set("limit", String(options.limit));
  if (options?.beforeSeq != null) params.set("beforeSeq", String(options.beforeSeq));
  const qs = params.toString();
  const res = await fetch(
    `/api/v1/ai/sessions/${sessionId}/messages${qs ? `?${qs}` : ""}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`历史消息读取失败: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: AssistantHistoryMessage[] };
  return body?.data ?? [];
}

/** 一条回复的思考正文（按需拉取）。 */
export type MessageReasoning = {
  reasoning: string;
  reasoningTokens?: number;
  thinkingMs?: number;
};

/**
 * 按需取一条回复的思考正文。
 *
 * <p>为什么不从本地状态里读：它很长，各端**故意不缓存**（会撑爆存储），
 * 而「切走再切回来」「重开抽屉」「历史翻页」这些路径上都可能把它弄丢（实测撞过三次）。
 * 让展开这个动作**直接去后端要**，库是唯一真相源，中间哪一层丢了都不影响。
 */
export async function fetchMessageReasoning(messageId: number): Promise<MessageReasoning> {
  const res = await fetch(`/api/v1/ai/messages/${messageId}/reasoning`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`思考正文读取失败: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: MessageReasoning };
  return body?.data ?? { reasoning: "" };
}

/** 我自己的一条偏好。 */
export type MyPreference = { id: number; content: string; source?: string; updatedAt?: string };

/**
 * **我自己的**偏好。
 *
 * <p>为什么要有这条路：只用「对话里问一句」的话，用户根本不知道助手记了什么 ——
 * 知情权不能只靠他想得起来问。
 */
export async function fetchMyPreferences(): Promise<MyPreference[]> {
  const res = await fetch("/api/v1/ai/preferences/mine", { headers: authHeaders() });
  if (!res.ok) throw new Error(`偏好读取失败: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: MyPreference[] };
  return body?.data ?? [];
}

/** 自己加一条。 */
export async function addMyPreference(content: string): Promise<void> {
  const res = await fetch("/api/v1/ai/preferences/mine", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
  // 业务错误也要抛：只看 HTTP 状态会把「太长了」显示成成功（这个仓库踩过这个坑）
  if (!res.ok || body?.success === false) throw new Error(body?.message || `保存失败: HTTP ${res.status}`);
}

/** 自己删一条。 */
export async function deleteMyPreference(content: string): Promise<void> {
  const res = await fetch(`/api/v1/ai/preferences/mine?content=${encodeURIComponent(content)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
  if (!res.ok || body?.success === false) throw new Error(body?.message || `删除失败: HTTP ${res.status}`);
}

/** 智能载体主动问好（打开面板即触发，SSE 流式） */
export async function streamScanAssistantGreet(
  handlers: ScanAssistantStreamHandlers,
  options?: { signal?: AbortSignal },
) {
  return postAskSse("/api/v1/twin/scan-assistant/ask/greet/stream", {}, handlers, options);
}

/**
 * 赞 / 踩一条助手回复。
 *
 * 同一条重复投 = **改那一票**（赞↔踩），不堆行 —— 服务端靠唯一键保证「同一人同一回复只算一次」。
 */
export async function voteAssistantMessage(
  messageId: number,
  vote: "up" | "down",
  reason = "",
): Promise<void> {
  const res = await fetch(`/api/v1/ai/messages/${messageId}/feedback`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ vote, reason }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
  // 写请求必须看 success：HTTP 200 + success:false 也是失败（本仓库的既有约定）
  if (!res.ok || !body?.success) {
    throw new Error(body?.message || `投票失败: HTTP ${res.status}`);
  }
}

/**
 * **撤掉**这一票 —— 再点一次同一个图标。
 *
 * 与 {@link voteAssistantMessage} 分开：那个是「我要投 up/down」，这个是「我不投了」。
 * 服务端把后者做成 DELETE（整行删），不是用空串投票 —— 那样语义会糊在参数里。
 */
export async function cancelAssistantVote(messageId: number): Promise<void> {
  const res = await fetch(`/api/v1/ai/messages/${messageId}/feedback`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
  if (!res.ok || !body?.success) {
    throw new Error(body?.message || `取消失败: HTTP ${res.status}`);
  }
}

/** 我在某个会话里投过的票：messageId → up/down。界面用它回填「我点过哪条」。 */
export async function fetchMyMessageVotes(sessionId: number): Promise<Record<number, "up" | "down">> {
  const res = await fetch(`/api/v1/ai/sessions/${sessionId}/my-feedback`, { headers: authHeaders() });
  if (!res.ok) return {};
  const body = (await res.json()) as { data?: Array<{ messageId: number; vote: string }> };
  const out: Record<number, "up" | "down"> = {};
  for (const r of body?.data ?? []) {
    if (r?.messageId != null && (r.vote === "up" || r.vote === "down")) {
      out[r.messageId] = r.vote;
    }
  }
  return out;
}

/** 触发一次主动播报，返回播报文本或空 */export async function triggerProactiveBroadcast(): Promise<{ text: string; hasBroadcast: boolean }> {
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

/** 某条会话产出的全部导出产物（**不含字节**）。历史回放据此把下载卡放回它当年那一轮。 */
export async function fetchSessionExports(sessionId: number): Promise<AssistantExportArtifact[]> {
  const res = await fetch(`/api/v1/ai/sessions/${sessionId}/exports`, { headers: authHeaders() });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: AssistantExportArtifact[] };
  return body?.data ?? [];
}

/**
 * 取这条导出归档下来的文件字节。
 *
 * 返回 null = **还没有归档过**（用户只是拿到过下载按钮、没真下过）。
 * 调用方据此回落到「用参数重跑一次导出」，那条路一直在。
 */
export async function fetchExportBlob(exportId: number): Promise<Blob | null> {
  const res = await fetch(`/api/v1/ai/exports/${exportId}/download`, { headers: authHeaders() });
  if (!res.ok) return null;
  return res.blob();
}

/**
 * 按导出载荷里给的**相对地址**取文件（带登录态）。
 *
 * <p>有些导出不自己造表，走的就是页面那个「导出」按钮同一条接口 —— 后端把地址和筛选条件
 * 交给载体（不在聊天里塞公开链接）。与 {@link fetchExportBlob} 的区别只在取哪儿：
 * 一个是产物存档，一个是现算。
 */
export async function fetchExportByUrl(url: string): Promise<Blob> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  return res.blob();
}

/**
 * 归档：用户下到的那份字节交回服务端，挂在这条导出上。
 *
 * 存的是**用户实际下到的那一份**，服务端不重算 —— 历史里再下才会与当时一模一样。
 * 归档失败不抛：下载已经完成了，留痕失败不该让用户看到报错。
 */
export async function archiveExportContent(exportId: number, blob: Blob, filename: string): Promise<void> {
  try {
    const form = new FormData();
    form.append("file", blob, filename);
    await fetch(`/api/v1/ai/exports/${exportId}/content`, {
      method: "POST",
      headers: authHeaders(),   // **不要手写 Content-Type**：boundary 会丢，变成 200 但 success:false
      body: form,
    });
  } catch {
    // 留痕失败不影响这次下载
  }
}
