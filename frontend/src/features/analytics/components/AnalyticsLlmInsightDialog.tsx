import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronDown, ChevronRight, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchAnalyticsLlmInsight,
  fetchInsightDataPackage,
  fetchLlmInsightPrompt,
  generateAnalyticsLlmInsight,
  type AnalyticsInsightDataPackage,
  type AnalyticsLlmInsightResult,
} from "@/api/domains/analytics.api";
import { AnalyticsInsightDisplay } from "@/features/analytics/components/AnalyticsInsightDisplay";
import {
  isTimeoutError,
  mergeInsightWhenDialogClosed,
  pollAnalyticsLlmInsightUntilReady,
} from "@/features/analytics/analyticsLlmInsightPoll";
import {
  createAnalyticsChatSession,
  streamAnalyticsChatMessage,
} from "@/api/domains/analyticsChat.api";
import type { AnalyticsReportKey } from "@/api/domains/analytics.api";
import { defaultUserPromptForModule, llmInsightModuleLabel } from "@/features/llm/llmInsightModules";
import {
  clearSavedUserPrompt,
  loadSavedUserPrompt,
  saveUserPromptLocally,
} from "@/features/llm/llmInsightPromptStorage";
import { ChatMarkdownBody } from "@/components/markdown/ChatMarkdownBody";
import { cn } from "@/lib/utils";

export type InsightAnchorRect = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

export type InsightDialogTarget = {
  reportKey: string;
  auditLogId: number;
  periodLabel?: string;
  anchor: InsightAnchorRect;
};

type ChatLine =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "agent"; text: string; loading?: boolean }
  | { id: string; role: "result"; insight: AnalyticsLlmInsightResult; periodLabel?: string };

type Props = {
  target: InsightDialogTarget | null;
  onClose: () => void;
};

export function AnalyticsLlmInsightDialog({ target, onClose }: Props) {
  const qc = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [insight, setInsight] = useState<AnalyticsLlmInsightResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "generating" | "done" | "error">("idle");
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [regeneratePromptDraft, setRegeneratePromptDraft] = useState("");
  const [systemDefaultPrompt, setSystemDefaultPrompt] = useState("");
  const [showRegeneratePanel, setShowRegeneratePanel] = useState(false);
  const [followUpSessionId, setFollowUpSessionId] = useState<number | null>(null);
  const followUpAbortRef = useRef<AbortController | null>(null);
  const sessionClosedRef = useRef(false);
  const generatingRef = useRef(false);
  const [followUpSending, setFollowUpSending] = useState(false);
  const [dataPackage, setDataPackage] = useState<AnalyticsInsightDataPackage | null>(null);

  const open = target != null;
  const reportKey = target?.reportKey ?? "isolation_usage";
  const auditLogId = target?.auditLogId ?? 0;
  const periodLabel = target?.periodLabel;
  const ctxReportKey = dataPackage?.reportKey ?? reportKey;
  const moduleLabel = dataPackage?.moduleLabel ?? llmInsightModuleLabel(reportKey);

  const loadRecommendedRegeneratePrompt = useCallback(async () => {
    const rk = ctxReportKey;
    const local = loadSavedUserPrompt(rk);
    if (local) {
      setRegeneratePromptDraft(local);
      return;
    }
    try {
      const bundle = await fetchLlmInsightPrompt(rk);
      const next = bundle.userPrompt || bundle.defaultUserPrompt;
      setSystemDefaultPrompt(next);
      setRegeneratePromptDraft(next);
    } catch {
      const fallback = defaultUserPromptForModule(rk);
      setSystemDefaultPrompt(fallback);
      setRegeneratePromptDraft(fallback);
    }
  }, [ctxReportKey]);

  useEffect(() => {
    if (!open || auditLogId <= 0) return;
    sessionClosedRef.current = false;
    generatingRef.current = false;
    setLines([]);
    setInsight(null);
    setFollowUpDraft("");
    setFollowUpSessionId(null);
    setShowRegeneratePanel(false);
    setDataPackage(null);
    setRegeneratePromptDraft("");
    setPhase("loading");

    const run = async () => {
      try {
        const [cached, pkg] = await Promise.all([
          fetchAnalyticsLlmInsight(auditLogId, false),
          fetchInsightDataPackage(auditLogId),
        ]);
        if (sessionClosedRef.current) return;
        setDataPackage(pkg);
        qc.setQueryData(["analytics", "insight-data-package", auditLogId], pkg);
        if (pkg.reportKey !== reportKey) {
          toast.error(`数据包报表类型为「${pkg.moduleLabel}」，与当前页面不一致，已按数据包为准`);
        }
        const pkgLine = `数据包已封箱：${pkg.viewName ?? "—"} · ${pkg.periodLabel ?? periodLabel ?? "—"} · ${pkg.moduleLabel}\n${pkg.summaryPreview ?? ""}`;

        if (cached.exists) {
          setInsight(cached);
          setPhase("done");
          setLines([
            { id: "agent-pkg", role: "agent", text: pkgLine },
            {
              id: "agent-cache",
              role: "agent",
              text: "已加载历史结构化解读。可在下方输入分析指令进行追问；如需会议 JSON 报告，可展开「生成结构化解读」。",
            },
            { id: "result-0", role: "result", insight: cached, periodLabel: pkg.periodLabel ?? periodLabel },
          ]);
          qc.setQueryData(["analytics", "llm-insight", auditLogId], cached);
        } else {
          setPhase("ready");
          setLines([
            {
              id: "agent-pkg",
              role: "agent",
              text: `${pkgLine}\n\n请在下方输入您的分析指令（不会自动发送预设模板）。`,
            },
          ]);
        }
      } catch (e) {
        if (sessionClosedRef.current) return;
        setPhase("error");
        toast.error(e instanceof Error ? e.message : "加载失败");
      }
    };

    void run();
    return () => {
      const wasGenerating = generatingRef.current;
      sessionClosedRef.current = true;
      if (wasGenerating) {
        toast("解读仍在后台进行，完成后将通知您", {
          id: `llm-insight-bg-${auditLogId}`,
          icon: "ℹ️",
        });
        pollAnalyticsLlmInsightUntilReady(auditLogId, qc);
      }
    };
  }, [open, auditLogId, periodLabel, reportKey, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pushAgent = (text: string, loading = false) => {
    if (sessionClosedRef.current) return "";
    const id = `agent-${Date.now()}-${Math.random()}`;
    setLines((prev) => [...prev, { id, role: "agent", text, loading }]);
    return id;
  };

  const finishAgent = (id: string, text: string) => {
    if (!id || sessionClosedRef.current) return;
    setLines((prev) =>
      prev.map((l) => (l.id === id && l.role === "agent" ? { ...l, text, loading: false } : l))
    );
  };

  const applyInsight = (res: AnalyticsLlmInsightResult) => {
    qc.setQueryData(["analytics", "llm-insight", auditLogId], res);
    if (sessionClosedRef.current) {
      mergeInsightWhenDialogClosed(auditLogId, qc, false);
      return;
    }
    setInsight(res);
    setPhase("done");
    setShowRegeneratePanel(false);
    setLines((prev) => {
      const withoutResult = prev.filter((l) => l.role !== "result");
      return [...withoutResult, { id: `result-${Date.now()}`, role: "result", insight: res, periodLabel }];
    });
  };

  const handleSaveRegeneratePrompt = () => {
    const text = regeneratePromptDraft.trim();
    if (!text) {
      toast.error("解读指令不能为空");
      return;
    }
    saveUserPromptLocally(ctxReportKey, text);
    toast.success("已保存解读指令模板（本机）");
  };

  const handleRestoreDefault = async () => {
    clearSavedUserPrompt(ctxReportKey);
    try {
      const bundle = await fetchLlmInsightPrompt(ctxReportKey);
      const next = bundle.userPrompt || bundle.defaultUserPrompt;
      setSystemDefaultPrompt(next);
      setRegeneratePromptDraft(next);
    } catch {
      const next = defaultUserPromptForModule(ctxReportKey);
      setRegeneratePromptDraft(next);
      setSystemDefaultPrompt(next);
    }
    toast.success("已恢复为系统默认解读指令");
  };

  const ensureFollowUpSession = async (): Promise<number> => {
    if (followUpSessionId != null) return followUpSessionId;
    const created = await createAnalyticsChatSession(ctxReportKey as AnalyticsReportKey, {
      auditLogId,
      title: periodLabel ? `解读追问 · ${periodLabel}` : "解读追问",
    });
    setFollowUpSessionId(created.id);
    return created.id;
  };

  const handleFollowUpSend = async () => {
    const text = followUpDraft.trim();
    if (!text) {
      toast.error("请输入要问的问题");
      promptRef.current?.focus();
      return;
    }
    if (auditLogId <= 0 || followUpSending) return;
    if (!dataPackage || phase === "loading" || phase === "generating") {
      toast.error("数据包尚未就绪，请稍候");
      return;
    }

    setFollowUpSending(true);
    setFollowUpDraft("");
    setLines((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", text }]);
    const streamId = `agent-stream-${Date.now()}`;
    setLines((prev) => [...prev, { id: streamId, role: "agent", text: "", loading: true }]);

    const abort = new AbortController();
    followUpAbortRef.current = abort;
    let acc = "";

    try {
      const sessionId = await ensureFollowUpSession();
      await streamAnalyticsChatMessage(
        sessionId,
        text,
        {
          onDelta: (chunk) => {
            acc += chunk;
            setLines((prev) =>
              prev.map((l) => (l.id === streamId ? { ...l, role: "agent" as const, text: acc, loading: true } : l))
            );
          },
          onError: (msg) => {
            throw new Error(msg);
          },
        },
        { signal: abort.signal }
      );
      setLines((prev) =>
        prev.map((l) => (l.id === streamId ? { ...l, role: "agent" as const, text: acc || "（无内容）", loading: false } : l))
      );
    } catch (e) {
      if (abort.signal.aborted) return;
      setLines((prev) => prev.filter((l) => l.id !== streamId));
      toast.error(e instanceof Error ? e.message : "追问失败");
    } finally {
      setFollowUpSending(false);
      followUpAbortRef.current = null;
    }
  };

  const handleRegenerateInsight = async () => {
    const text = regeneratePromptDraft.trim();
    if (!text) {
      toast.error("请先填写解读生成指令");
      promptRef.current?.focus();
      return;
    }
    if (auditLogId <= 0 || phase === "generating") return;

    saveUserPromptLocally(ctxReportKey, text);
    setPhase("generating");
    generatingRef.current = true;
    pushAgent("正在按新指令重新生成结构化解读…", true);

    const s1 = pushAgent("正在读取清算快照与环比数据…", true);
    await delay(350);
    if (sessionClosedRef.current) return;
    finishAgent(s1, "已汇总统计数据。");

    const s2 = pushAgent("正在调用大模型生成解读（通常 30 秒～2 分钟）…", true);
    const forceRefresh = Boolean(insight?.exists);
    try {
      const res = await generateAnalyticsLlmInsight(auditLogId, forceRefresh, text);
      generatingRef.current = false;
      if (sessionClosedRef.current) {
        applyInsight(res);
        return;
      }
      finishAgent(s2, "解读已生成并保存。");
      applyInsight(res);
      toast.success("解读完成");
    } catch (e) {
      generatingRef.current = false;
      const timedOut = isTimeoutError(e);
      if (sessionClosedRef.current) {
        if (timedOut) pollAnalyticsLlmInsightUntilReady(auditLogId, qc);
        return;
      }
      finishAgent(s2, timedOut ? "请求超时，正在后台等待结果…" : "生成失败");
      setPhase("error");
      const msg = timedOut
        ? "请求超时，服务端可能仍在生成，请稍后再次打开查看。"
        : e instanceof Error
          ? e.message
          : "生成失败";
      toast.error(msg);
      if (timedOut) pollAnalyticsLlmInsightUntilReady(auditLogId, qc);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const sending = phase === "generating";
  const packageReady = dataPackage != null && phase !== "loading";
  const showFollowUpInput = packageReady && !sending;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="关闭"
        data-modal-layer="true"
        className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        data-modal-layer="true"
        className="fixed inset-0 z-[111] flex items-center justify-center p-3 sm:p-6"
        role="presentation"
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby="llm-insight-dialog-title"
          aria-modal="true"
          data-modal-layer="true"
          className="flex h-[min(92vh,880px)] w-[min(96vw,1120px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3 sm:px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm">
            <Bot className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="llm-insight-dialog-title" className="truncate text-base font-semibold text-slate-900">
              AI 解读 · {moduleLabel}
            </h2>
            <p className="truncate text-xs text-slate-500">{periodLabel || "清算快照"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div
          ref={scrollRef}
          data-modal-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-4 sm:px-5"
        >
          <div className="space-y-3">
            {lines.map((line) => {
              if (line.role === "user") return <UserBubble key={line.id} text={line.text} />;
              if (line.role === "agent") return <AgentBubble key={line.id} text={line.text} loading={line.loading} />;
              return (
                <AgentBubble key={line.id} wide>
                  <AnalyticsInsightDisplay insight={line.insight} periodLabel={line.periodLabel} />
                </AgentBubble>
              );
            })}
            {phase === "loading" ? <AgentBubble text="正在加载…" loading /> : null}
          </div>
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
          {showFollowUpInput ? (
            <>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">分析指令（基于已封箱数据包）</label>
              <textarea
                value={followUpDraft}
                onChange={(e) => setFollowUpDraft(e.target.value)}
                disabled={followUpSending}
                rows={2}
                className="mb-2 w-full resize-y rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 disabled:opacity-60"
                placeholder={`输入分析问题，例如：本期${dataPackage?.metricUnit ?? "数据"}环比异常原因？`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void handleFollowUpSend();
                  }
                }}
              />
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  disabled={followUpSending}
                  onClick={() => void handleFollowUpSend()}
                  className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {followUpSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  发送分析
                </button>
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="mb-2 flex w-full items-center gap-1 text-left text-xs font-medium text-slate-600 hover:text-slate-900"
            onClick={() => setShowRegeneratePanel((v) => !v)}
          >
            {showRegeneratePanel ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {insight?.exists ? "重新生成结构化解读（会议 JSON）" : "生成结构化解读（会议 JSON）"}
          </button>
          {showRegeneratePanel ? (
            <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
              onClick={() => void loadRecommendedRegeneratePrompt()}
            >
              载入推荐指令
            </button>
          </div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">结构化解读指令（可选，不自动发送）</label>
          <textarea
            ref={promptRef}
            value={regeneratePromptDraft}
            onChange={(e) => setRegeneratePromptDraft(e.target.value)}
            disabled={sending || phase === "loading"}
            rows={4}
            className="mb-2 w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 disabled:opacity-60"
            placeholder="例如：简短汇报一下内容即可"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleRegenerateInsight();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">
              {insight?.exists ? "已有缓存 · Ctrl+Enter 生成" : "Ctrl+Enter 生成解读"}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={sending || phase === "loading"}
                onClick={() => void handleRestoreDefault()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                title={systemDefaultPrompt ? "恢复系统/模块默认" : undefined}
              >
                <RotateCcw className="h-3 w-3" />
                恢复默认
              </button>
              <button
                type="button"
                disabled={sending || phase === "loading"}
                onClick={handleSaveRegeneratePrompt}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                保存
              </button>
              <button
                type="button"
                disabled={sending || phase === "loading"}
                onClick={() => void handleRegenerateInsight()}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {insight?.exists ? "重新生成解读" : "生成解读"}
              </button>
            </div>
          </div>
            </>
          ) : null}
        </footer>
        </div>
      </div>
    </>,
    document.body
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] rounded-2xl rounded-br-md bg-violet-600 px-3 py-2 text-sm text-white shadow-sm">
        <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function AgentBubble({
  text,
  loading,
  wide,
  children,
}: {
  text?: string;
  loading?: boolean;
  wide?: boolean;
  children?: ReactNode;
}) {
  if (wide && children) {
    return (
      <div className="w-full rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:p-5">{children}</div>
    );
  }
  return (
    <div className="flex justify-start gap-2">
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div
        className={cn(
          "max-w-[calc(100%-2.25rem)] min-w-0 flex-1 rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200/80"
        )}
      >
        {children ??
          (loading ? (
            <p className="flex items-start gap-2 whitespace-pre-wrap break-words leading-relaxed">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-violet-500" aria-hidden />
              <span>{text}</span>
            </p>
          ) : (
            <ChatMarkdownBody text={text ?? ""} streaming={loading} />
          ))}
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
