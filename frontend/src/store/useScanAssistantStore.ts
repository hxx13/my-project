import { create } from "zustand";
import { triggerProactiveBroadcast } from "@/api/domains/scanAssistant.api";

export type ScanAssistantMessageKind = "welcome" | "alert" | "info";

export type ScanAssistantMessage = {
  id: string;
  text: string;
  kind: ScanAssistantMessageKind;
  shownAt: number;
  /** 识别到的人员标识；换人时触发气泡关闭再打开 */
  personKey?: string;
  /** LLM 流式输出中：Carrier 直接展示全文，不做打字机重置 */
  isStreaming?: boolean;
};

type ScanAssistantState = {
  /** 常驻右下角载体；无播报时仍展示 orb */
  dockVisible: boolean;
  activeMessage: ScanAssistantMessage | null;
  /** 气泡是否收起（保留 activeMessage，点击载体可再次展开） */
  bubbleCollapsed: boolean;

  /** 主动播报状态 */
  proactivePolling: boolean;
  lastProactiveAt: number | null;

  setDockVisible: (visible: boolean) => void;
  /** 播报一条文案（如原红色 toast 内容） */
  speak: (text: string, kind?: ScanAssistantMessageKind, personKey?: string) => void;
  /** 开始 LLM 流式播报 */
  beginStreamMessage: (kind: ScanAssistantMessageKind, personKey?: string) => void;
  /** 追加流式增量 */
  appendStreamDelta: (delta: string) => void;
  /** 替换流式全文（存档预填后收到 LLM 首包时） */
  setStreamText: (text: string) => void;
  /** 流式结束，锁定最终文案 */
  finishStreamMessage: (finalText?: string) => void;
  /** 取消当前流式播报（不清 dock） */
  cancelStreamMessage: () => void;
  /** 收起气泡（同一人弹窗内保留文案） */
  collapseBubble: () => void;
  /** 再次展开气泡（由载体点击触发） */
  expandBubble: () => void;
  /** 完全清除（换人 / 关闭扫码弹窗） */
  dismissMessage: () => void;

  /** 启动主动播报轮询（每 5 分钟检查一次） */
  startProactivePolling: () => () => void;
  /** 触发一次主动播报并展示 */
  pollProactive: () => Promise<void>;
  /** 停止主动播报轮询 */
  stopProactivePolling: () => void;
};

let streamMessageId: string | null = null;
let proactiveTimer: ReturnType<typeof setInterval> | null = null;

const PROACTIVE_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

function pushMessage(
  set: (partial: Partial<ScanAssistantState>) => void,
  text: string,
  kind: ScanAssistantMessageKind,
  personKey?: string,
) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const msg: ScanAssistantMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    kind,
    shownAt: Date.now(),
    personKey: personKey?.trim() || undefined,
    isStreaming: false,
  };

  set({ activeMessage: msg, dockVisible: true, bubbleCollapsed: false });
}

export const useScanAssistantStore = create<ScanAssistantState>((set, get) => ({
  dockVisible: true,
  activeMessage: null,
  bubbleCollapsed: false,
  proactivePolling: false,
  lastProactiveAt: null,

  setDockVisible: (visible) => set({ dockVisible: visible }),

  speak: (text, kind = "alert", personKey) => {
    streamMessageId = null;
    pushMessage(set, text, kind, personKey);
  },

  beginStreamMessage: (kind, personKey) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    streamMessageId = id;
    set({
      dockVisible: true,
      bubbleCollapsed: false,
      activeMessage: {
        id,
        text: "",
        kind,
        shownAt: Date.now(),
        personKey: personKey?.trim() || undefined,
        isStreaming: true,
      },
    });
  },

  appendStreamDelta: (delta) => {
    if (!delta) return;
    const current = get().activeMessage;
    if (!current || current.id !== streamMessageId) return;
    set({
      activeMessage: {
        ...current,
        text: current.text + delta,
      },
    });
  },

  setStreamText: (text) => {
    const current = get().activeMessage;
    if (!current || current.id !== streamMessageId) return;
    set({
      activeMessage: {
        ...current,
        text,
      },
    });
  },

  finishStreamMessage: (finalText) => {
    const current = get().activeMessage;
    if (!current || current.id !== streamMessageId) return;
    const text = (finalText ?? current.text).trim();
    if (!text) {
      set({ activeMessage: null });
      streamMessageId = null;
      return;
    }
    const finalized: ScanAssistantMessage = {
      ...current,
      text,
      isStreaming: false,
      shownAt: Date.now(),
    };
    set({ activeMessage: finalized });
    streamMessageId = null;
  },

  cancelStreamMessage: () => {
    streamMessageId = null;
    set({ activeMessage: null, bubbleCollapsed: false });
  },

  collapseBubble: () => set({ bubbleCollapsed: true }),

  expandBubble: () => set({ bubbleCollapsed: false }),

  dismissMessage: () => {
    streamMessageId = null;
    set({ activeMessage: null, bubbleCollapsed: false });
  },

  startProactivePolling: () => {
    if (proactiveTimer) clearInterval(proactiveTimer);
    set({ proactivePolling: true });

    // 首次立即检查
    get().pollProactive();

    proactiveTimer = setInterval(() => {
      get().pollProactive();
    }, PROACTIVE_INTERVAL_MS);

    return () => {
      if (proactiveTimer) clearInterval(proactiveTimer);
      set({ proactivePolling: false });
    };
  },

  pollProactive: async () => {
    try {
      const result = await triggerProactiveBroadcast();
      if (result.hasBroadcast && result.text) {
        pushMessage(set, result.text, "info");
        set({ lastProactiveAt: Date.now() });
      }
    } catch {
      // 静默失败，下次再试
    }
  },

  stopProactivePolling: () => {
    if (proactiveTimer) clearInterval(proactiveTimer);
    proactiveTimer = null;
    set({ proactivePolling: false });
  },
}));
