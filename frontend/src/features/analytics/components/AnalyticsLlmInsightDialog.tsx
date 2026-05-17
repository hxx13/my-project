import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchAnalyticsLlmInsight,
  fetchLlmInsightPrompt,
  generateAnalyticsLlmInsight,
  type AnalyticsLlmInsightResult,
} from "@/api/domains/analytics.api";
import { AnalyticsInsightDisplay } from "@/features/analytics/components/AnalyticsInsightDisplay";
import {
  isTimeoutError,
  mergeInsightWhenDialogClosed,
  pollAnalyticsLlmInsightUntilReady,
} from "@/features/analytics/analyticsLlmInsightPoll";
import { defaultUserPromptForModule, llmInsightModuleLabel } from "@/features/llm/llmInsightModules";
import {
  clearSavedUserPrompt,
  loadSavedUserPrompt,
  saveUserPromptLocally,
} from "@/features/llm/llmInsightPromptStorage";
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
  const [promptDraft, setPromptDraft] = useState("");
  const [systemDefaultPrompt, setSystemDefaultPrompt] = useState("");
  const sessionClosedRef = useRef(false);
  const generatingRef = useRef(false);

  const open = target != null;
  const reportKey = target?.reportKey ?? "isolation_usage";
  const auditLogId = target?.auditLogId ?? 0;
  const periodLabel = target?.periodLabel;
  const moduleLabel = llmInsightModuleLabel(reportKey);

  const resolveInitialPrompt = useCallback(async () => {
    const local = loadSavedUserPrompt(reportKey);
    if (local) return local;
    try {
      const bundle = await fetchLlmInsightPrompt(reportKey);
      setSystemDefaultPrompt(bundle.userPrompt || bundle.defaultUserPrompt);
      return bundle.userPrompt || bundle.defaultUserPrompt;
    } catch {
      const fallback = defaultUserPromptForModule(reportKey);
      setSystemDefaultPrompt(fallback);
      return fallback;
    }
  }, [reportKey]);

  useEffect(() => {
    if (!open || auditLogId <= 0) return;
    sessionClosedRef.current = false;
    generatingRef.current = false;
    setLines([]);
    setInsight(null);
    setPhase("loading");

    const run = async () => {
      try {
        const [cached, initialPrompt] = await Promise.all([
          fetchAnalyticsLlmInsight(auditLogId, false),
          resolveInitialPrompt(),
        ]);
        if (sessionClosedRef.current) return;
        setPromptDraft(initialPrompt);
        if (cached.exists) {
          setInsight(cached);
          setPhase("done");
          setLines([
            { id: "agent-cache", role: "agent", text: "已加载历史解读。修改下方提问后点击「发送」可重新生成。" },
            { id: "result-0", role: "result", insight: cached, periodLabel },
          ]);
          qc.setQueryData(["analytics", "llm-insight", auditLogId], cached);
        } else {
          setPhase("ready");
          setLines([
            {
              id: "agent-hint",
              role: "agent",
              text: `请确认或编辑提问内容，点击「发送」开始解读（${moduleLabel}）。`,
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
  }, [open, auditLogId, periodLabel, reportKey, moduleLabel, qc, resolveInitialPrompt]);

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
    setLines((prev) => {
      const withoutResult = prev.filter((l) => l.role !== "result");
      return [...withoutResult, { id: `result-${Date.now()}`, role: "result", insight: res, periodLabel }];
    });
  };

  const handleSavePrompt = () => {
    const text = promptDraft.trim();
    if (!text) {
      toast.error("提问内容不能为空");
      return;
    }
    saveUserPromptLocally(reportKey, text);
    toast.success("已保存提问模板（本机）");
  };

  const handleRestoreDefault = async () => {
    clearSavedUserPrompt(reportKey);
    try {
      const bundle = await fetchLlmInsightPrompt(reportKey);
      const next = bundle.userPrompt || bundle.defaultUserPrompt;
      setSystemDefaultPrompt(next);
      setPromptDraft(next);
    } catch {
      const next = defaultUserPromptForModule(reportKey);
      setPromptDraft(next);
      setSystemDefaultPrompt(next);
    }
    toast.success("已恢复为系统默认提问");
  };

  const handleSend = async () => {
    const text = promptDraft.trim();
    if (!text) {
      toast.error("请先填写提问内容");
      promptRef.current?.focus();
      return;
    }
    if (auditLogId <= 0 || phase === "generating") return;

    saveUserPromptLocally(reportKey, text);
    setPhase("generating");
    generatingRef.current = true;
    setLines((prev) => [
      ...prev.filter((l) => l.role !== "result"),
      { id: `user-${Date.now()}`, role: "user", text },
    ]);

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

  return createPortal(
    <>
      <button
        type="button"
        aria-label="关闭"
        className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[111] flex items-center justify-center p-3 sm:p-6" role="presentation">
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby="llm-insight-dialog-title"
          aria-modal="true"
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

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-4 sm:px-5">
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
          <label className="mb-1.5 block text-xs font-medium text-slate-500">提问内容（可编辑后发送）</label>
          <textarea
            ref={promptRef}
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            disabled={sending || phase === "loading"}
            rows={4}
            className="mb-2 w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 disabled:opacity-60"
            placeholder="输入发给大模型的提问…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">
              {insight?.exists ? "已有缓存 · Ctrl+Enter 发送" : "Ctrl+Enter 快捷发送"}
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
                onClick={handleSavePrompt}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                保存
              </button>
              <button
                type="button"
                disabled={sending || phase === "loading"}
                onClick={() => void handleSend()}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                发送
              </button>
            </div>
          </div>
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
        {children ?? (
          <p className="flex items-start gap-2 whitespace-pre-wrap break-words leading-relaxed">
            {loading ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-violet-500" aria-hidden /> : null}
            <span>{text}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
