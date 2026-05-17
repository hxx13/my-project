import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  ANALYTICS_CHAT_ALL_VIEWS_ID,
  createAnalyticsChatSession,
  deleteAnalyticsChatSession,
  fetchAnalyticsChatMessages,
  fetchAnalyticsChatSessions,
  streamAnalyticsChatMessage,
  type AnalyticsChatMessage,
  type AnalyticsChatSession,
} from "@/api/domains/analyticsChat.api";
import type { AnalyticsReportKey } from "@/api/domains/analytics.api";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  reportKey: AnalyticsReportKey;
  /** 当前报表下已保存的统计配置条数（0 时不可提问） */
  configCount: number;
};

type UiMessage = AnalyticsChatMessage & {
  streaming?: boolean;
  liveThinking?: string[];
  liveContent?: string;
};

export function AnalyticsCopilotDialog({ open, onClose, reportKey, configCount }: Props) {
  const scopeViewId = ANALYTICS_CHAT_ALL_VIEWS_ID;
  const scopeLabel =
    configCount > 0 ? `全部 ${configCount} 条统计配置` : "暂无统计配置";
  const canUse = configCount > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [sessions, setSessions] = useState<AnalyticsChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshContext, setRefreshContext] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});

  const loadSessions = useCallback(async () => {
    if (!canUse) return;
    setLoadingSessions(true);
    try {
      const list = await fetchAnalyticsChatSessions(reportKey, scopeViewId);
      setSessions(list);
      if (list.length > 0 && activeSessionId == null) {
        setActiveSessionId(list[0].id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载会话失败");
    } finally {
      setLoadingSessions(false);
    }
  }, [reportKey, canUse, scopeViewId, activeSessionId]);

  const loadMessages = useCallback(async (sessionId: number) => {
    setLoadingMessages(true);
    try {
      const list = await fetchAnalyticsChatMessages(sessionId);
      setMessages(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载消息失败");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveSessionId(null);
    setMessages([]);
    void loadSessions();
  }, [open, canUse, reportKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || activeSessionId == null) return;
    void loadMessages(activeSessionId);
  }, [activeSessionId, open, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const handleNewSession = async () => {
    if (!canUse) {
      toast.error("请先保存至少一条统计配置");
      return;
    }
    try {
      const created = await createAnalyticsChatSession(reportKey, scopeViewId);
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      setMessages([]);
      toast.success("已新建对话，已封箱全部配置数据");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    }
  };

  const handleDeleteSession = async (id: number) => {
    try {
      await deleteAnalyticsChatSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        const next = sessions.find((s) => s.id !== id);
        setActiveSessionId(next?.id ?? null);
        setMessages([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (!canUse) {
      toast.error("请先保存至少一条统计配置");
      return;
    }

    let sessionId = activeSessionId;
    if (sessionId == null) {
      try {
        const created = await createAnalyticsChatSession(reportKey, scopeViewId);
        setSessions((prev) => [created, ...prev]);
        sessionId = created.id;
        setActiveSessionId(created.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "创建会话失败");
        return;
      }
    }

    const tempUserId = -Date.now();
    const tempAssistantId = tempUserId - 1;
    setDraft("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: "user", content: text },
      {
        id: tempAssistantId,
        role: "assistant",
        content: "",
        streaming: true,
        liveThinking: [],
        liveContent: "",
      },
    ]);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    let thinkingLines: string[] = [];
    let answer = "";

    try {
      await streamAnalyticsChatMessage(
        sessionId,
        text,
        {
          onThinking: (step) => {
            thinkingLines = [...thinkingLines, step];
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, liveThinking: [...thinkingLines] } : m
              )
            );
            setThinkingOpen((o) => ({ ...o, [String(tempAssistantId)]: true }));
          },
          onDelta: (chunk) => {
            answer += chunk;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, liveContent: answer } : m
              )
            );
          },
          onDone: async () => {
            const fresh = await fetchAnalyticsChatMessages(sessionId!);
            setMessages(fresh);
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? { ...s, updatedAt: new Date().toISOString(), title: s.title === "新对话" ? text.slice(0, 40) : s.title }
                  : s
              )
            );
          },
          onError: (msg) => toast.error(msg),
        },
        { refreshContext, signal: ac.signal }
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== tempAssistantId));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-2 sm:p-4">
      <div
        className="flex h-[min(92vh,880px)] w-[min(96vw,1120px)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="AI 综合分析"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-5 w-5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold sm:text-base">AI 综合分析</h2>
              <p className="truncate text-[11px] text-violet-100">
                {scopeLabel} · 合并各配置下全部清算期次综合分析
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-white/90 hover:bg-white/15"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-100 bg-neutral-50/80">
            <div className="p-2">
              <button
                type="button"
                disabled={!canUse}
                onClick={() => void handleNewSession()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                新建对话
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {loadingSessions ? (
                <p className="px-2 py-4 text-center text-xs text-neutral-400">加载中…</p>
              ) : sessions.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-neutral-400">暂无历史对话</p>
              ) : (
                <ul className="space-y-1">
                  {sessions.map((s) => (
                    <li key={s.id} className="group flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setActiveSessionId(s.id)}
                        className={cn(
                          "min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs",
                          activeSessionId === s.id
                            ? "bg-violet-100 font-medium text-violet-900"
                            : "text-neutral-700 hover:bg-neutral-100"
                        )}
                      >
                        {s.title || "新对话"}
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 text-neutral-400 opacity-0 hover:text-rose-600 group-hover:opacity-100"
                        onClick={() => void handleDeleteSession(s.id)}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 [scrollbar-width:thin]"
            >
              {!canUse ? (
                <p className="text-center text-sm text-neutral-500">
                  请先在下方保存至少一条统计配置；AI 将结合全部配置及其清算数据回答。
                </p>
              ) : loadingMessages ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                </div>
              ) : messages.length === 0 ? (
                <div className="mx-auto max-w-lg space-y-3 py-8 text-center">
                  <p className="text-sm text-neutral-600">
                    可提问例如：「对比各配置，哪个月异常且耗量最大？峰值在哪个地区、房间和课题组？」
                  </p>
                  <p className="text-xs text-neutral-400">
                    将封箱本报表下全部统计配置的多期清算快照（非仅当前选中的一条）。
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    thinkingExpanded={thinkingOpen[String(m.id)] ?? false}
                    onToggleThinking={() =>
                      setThinkingOpen((o) => ({ ...o, [String(m.id)]: !o[String(m.id)] }))
                    }
                  />
                ))
              )}
            </div>

            <footer className="shrink-0 border-t border-neutral-100 bg-white p-3">
              <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-neutral-500">
                <input
                  type="checkbox"
                  checked={refreshContext}
                  onChange={(e) => setRefreshContext(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                <RefreshCw className="h-3 w-3" />
                发送前重新封箱全部配置的最新清算数据
              </label>
              <div className="flex items-end gap-2 rounded-xl border border-neutral-200 bg-neutral-50/80 p-2 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  disabled={!canUse || sending}
                  placeholder={canUse ? "输入分析问题…" : "请先保存统计配置"}
                  className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!canUse || sending || !draft.trim()}
                  onClick={() => void handleSend()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MessageBubble({
  message: m,
  thinkingExpanded,
  onToggleThinking,
}: {
  message: UiMessage;
  thinkingExpanded: boolean;
  onToggleThinking: () => void;
}) {
  const isUser = m.role === "user";
  const content = m.streaming ? (m.liveContent ?? "") : m.content;
  const thinking = m.streaming ? m.liveThinking : m.thinkingText?.split("\n").filter(Boolean);
  const showThinking = thinking && thinking.length > 0;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-violet-600 text-white" : "bg-neutral-100 text-neutral-900"
        )}
      >
        {!isUser && showThinking ? (
          <div className="mb-2 rounded-lg border border-violet-200/60 bg-violet-50/80">
            <button
              type="button"
              onClick={onToggleThinking}
              className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-[11px] font-medium text-violet-800"
            >
              {thinkingExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {m.streaming ? "深度思考中…" : "分析过程"}
            </button>
            {thinkingExpanded ? (
              <ul className="space-y-1 border-t border-violet-100 px-3 py-2 text-[11px] text-violet-900/90">
                {thinking.map((line, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-violet-400">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="whitespace-pre-wrap break-words">
          {content}
          {m.streaming && !content ? (
            <span className="inline-flex items-center gap-1 text-neutral-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400 [animation-delay:300ms]" />
            </span>
          ) : null}
          {m.streaming && content ? (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-violet-500 align-middle" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
