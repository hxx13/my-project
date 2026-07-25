import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFormCard, AdminPageShell, AdminFillScrollRegion } from "@/components/admin/AdminPageShell";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { authHttp } from "@/api/core/authHttp";
import { adminHttp } from "@/api/core/adminHttp";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import {
  ChevronDown,
  ChevronUp,
  Save,
  RotateCw,
  Mail,
  MessageSquareText,
  Bell,
  Users,
  Clock,
  Variable,
  AlertCircle,
  Search,
  X,
  Check,
  UserPlus,
  Send,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NotifyChannelConfig {
  id: number;
  channelCode: string;
  channelName: string;
  enabled: boolean;
  titleTpl: string;
  contentTpl: string;
  quietStart: string;
  quietEnd: string;
  rateLimitSeconds: number;
}

interface NotifyRecipient {
  id: number;
  perspective: string;
  scopeType: string;
  scopeValue: string;
  /** 服务端解析的显示名 */
  scopeLabel?: string;
}

interface NotifySourceConfig {
  sourceId: number;
  sourceCode: string;
  sourceName: string;
  description: string;
  variables: Record<string, string>;
  sourceEnabled: boolean;
  channels: NotifyChannelConfig[];
  recipients: NotifyRecipient[];
}

interface PushDashboardOverview {
  sent24h: number;
  success24h: number;
  failed24h: number;
  channelHealth: Array<{ channelCode: string; channelName: string; enabled: boolean }>;
}

/** Per-channel editable draft held in local state while the user edits. */
interface ChannelDraft {
  titleTpl: string;
  contentTpl: string;
  enabled: boolean;
  quietStart: string;
  quietEnd: string;
  rateLimitSeconds: number;
}

/** Per-source recipients draft */
interface RecipientDraft {
  perspective: string;
  scopeType: string;
  scopeValue: string;
  /** 服务端解析的显示名（只读，不传回后端） */
  scopeLabel?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toChannelDraft(ch: NotifyChannelConfig): ChannelDraft {
  return {
    titleTpl: ch.titleTpl ?? "",
    contentTpl: ch.contentTpl ?? "",
    enabled: ch.enabled,
    quietStart: ch.quietStart ?? "",
    quietEnd: ch.quietEnd ?? "",
    rateLimitSeconds: ch.rateLimitSeconds ?? 300,
  };
}

function toRecipientDraft(r: NotifyRecipient): RecipientDraft {
  return {
    perspective: r.perspective ?? "",
    scopeType: r.scopeType ?? "",
    scopeValue: r.scopeValue ?? "",
    scopeLabel: r.scopeLabel,
  };
}

const channelIconMap: Record<string, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" aria-hidden />,
  SERVER_CHAN: <MessageSquareText className="h-4 w-4" aria-hidden />,
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminPushConfigPage() {
  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);
  const queryClient = useQueryClient();

  /* ---- data fetching ---- */
  const {
    data: sources,
    isLoading: sourcesLoading,
    error: sourcesError,
    refetch: refetchSources,
  } = useQuery<NotifySourceConfig[]>({
    queryKey: ["notify-sources"],
    queryFn: () => authHttp.get("/admin/notify-source").then((r) => r.data.data),
  });

  const { data: overview } = useQuery<PushDashboardOverview>({
    queryKey: ["push-dashboard-overview"],
    queryFn: () => authHttp.get("/admin/push-dashboard/overview").then((r) => r.data.data),
  });

  /* ---- local expand & draft state ---- */
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  /** sourceId -> { channelId -> ChannelDraft } */
  const [channelDrafts, setChannelDrafts] = useState<
    Record<number, Record<number, ChannelDraft>>
  >({});
  /** sourceId -> RecipientDraft[] */
  const [recipientDrafts, setRecipientDrafts] = useState<
    Record<number, RecipientDraft[]>
  >({});
  /** Which source's channel is currently saving */
  const [savingChannels, setSavingChannels] = useState<Set<string>>(new Set());
  const [savingRecipients, setSavingRecipients] = useState<Set<number>>(new Set());
  const [savingToggles, setSavingToggles] = useState<Set<number>>(new Set());
  const [testSource, setTestSource] = useState<string | null>(null);

  /* ---- initialise drafts from fetched data ---- */
  const initDrafts = useCallback((list: NotifySourceConfig[]) => {
    const cd: Record<number, Record<number, ChannelDraft>> = {};
    const rd: Record<number, RecipientDraft[]> = {};
    for (const s of list) {
      cd[s.sourceId] = {};
      for (const ch of s.channels) {
        cd[s.sourceId][ch.id] = toChannelDraft(ch);
      }
      rd[s.sourceId] = (s.recipients ?? []).map(toRecipientDraft);
    }
    setChannelDrafts(cd);
    setRecipientDrafts(rd);
  }, []);

  useEffect(() => {
    if (sources) initDrafts(sources);
  }, [sources, initDrafts]);

  /* ---- toggle expand ---- */
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ---- mutations ---- */

  /** Toggle source enable */
  const toggleSourceMutation = useMutation({
    mutationFn: ({ sourceId, enabled }: { sourceId: number; enabled: boolean }) =>
      authHttp.put(`/admin/notify-source/${sourceId}/enabled?enabled=${enabled}`),
    onMutate: ({ sourceId }) => setSavingToggles((p) => new Set(p).add(sourceId)),
    onSettled: (_d, _e, { sourceId }) => {
      setSavingToggles((p) => {
        const n = new Set(p);
        n.delete(sourceId);
        return n;
      });
    },
    onSuccess: () => {
      toast.success("状态已切换");
      queryClient.invalidateQueries({ queryKey: ["notify-sources"] });
      queryClient.invalidateQueries({ queryKey: ["push-dashboard-overview"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "切换失败"),
  });

  /** Save single channel config */
  const saveChannelMutation = useMutation({
    mutationFn: ({
      sourceId,
      channelCode,
      body,
    }: {
      sourceId: number;
      channelCode: string;
      body: ChannelDraft;
    }) => authHttp.put(`/admin/notify-source/${sourceId}/channels/${channelCode}`, body),
    onMutate: ({ sourceId, channelCode }) =>
      setSavingChannels((p) => new Set(p).add(`${sourceId}:${channelCode}`)),
    onSettled: (_d, _e, { sourceId, channelCode }) => {
      setSavingChannels((p) => {
        const n = new Set(p);
        n.delete(`${sourceId}:${channelCode}`);
        return n;
      });
    },
    onSuccess: () => {
      toast.success("渠道配置已保存");
      queryClient.invalidateQueries({ queryKey: ["notify-sources"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  /** Save recipients */
  const saveRecipientsMutation = useMutation({
    mutationFn: ({
      sourceId,
      recipients,
    }: {
      sourceId: number;
      recipients: RecipientDraft[];
    }) =>
      authHttp.put(`/admin/notify-source/${sourceId}/recipients`, recipients),
    onMutate: ({ sourceId }) => setSavingRecipients((p) => new Set(p).add(sourceId)),
    onSettled: (_d, _e, { sourceId }) => {
      setSavingRecipients((p) => {
        const n = new Set(p);
        n.delete(sourceId);
        return n;
      });
    },
    onSuccess: () => {
      toast.success("接收人已保存");
      queryClient.invalidateQueries({ queryKey: ["notify-sources"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  /* ---- derived stats ---- */
  const stats = useMemo(() => {
    if (!sources) return { total: 0, enabled: 0, disabled: 0 };
    return {
      total: sources.length,
      enabled: sources.filter((s) => s.sourceEnabled).length,
      disabled: sources.filter((s) => !s.sourceEnabled).length,
    };
  }, [sources]);

  /* ---- channel master switch state (local-only; persisted via existing settings API) ---- */
  const [masterSwitches, setMasterSwitches] = useState<
    Record<string, boolean>
  >({
    EMAIL: true,
    SERVER_CHAN: true,
  });

  const toggleMasterSwitch = (code: string) => {
    setMasterSwitches((prev) => {
      const next = { ...prev, [code]: !prev[code] };
      toast.success(`${code === "EMAIL" ? "邮件" : "Server酱"} 已${next[code] ? "开启" : "关闭"}`);
      return next;
    });
  };

  /* ---- draft updaters ---- */
  const updateChannelDraft = (
    sourceId: number,
    channelId: number,
    patch: Partial<ChannelDraft>,
  ) => {
    setChannelDrafts((prev) => {
      const source = { ...(prev[sourceId] ?? {}) };
      const existing = source[channelId] ?? {
        titleTpl: "",
        contentTpl: "",
        enabled: true,
        quietStart: "",
        quietEnd: "",
        rateLimitSeconds: 300,
      };
      source[channelId] = { ...existing, ...patch };
      return { ...prev, [sourceId]: source };
    });
  };

  const updateRecipientDraft = (
    sourceId: number,
    index: number,
    patch: Partial<RecipientDraft>,
  ) => {
    setRecipientDrafts((prev) => {
      const list = [...(prev[sourceId] ?? [])];
      if (list[index]) {
        list[index] = { ...list[index], ...patch };
      }
      return { ...prev, [sourceId]: list };
    });
  };

  const addRecipientDraft = (sourceId: number, rec?: RecipientDraft) => {
    setRecipientDrafts((prev) => ({
      ...prev,
      [sourceId]: [
        ...(prev[sourceId] ?? []),
        rec ?? { perspective: "STUDENT", scopeType: "ALL", scopeValue: "" },
      ],
    }));
  };

  const removeRecipientDraft = (sourceId: number, index: number) => {
    setRecipientDrafts((prev) => ({
      ...prev,
      [sourceId]: (prev[sourceId] ?? []).filter((_, i) => i !== index),
    }));
  };

  /* ---- render ---- */

  const isSourcesLoading = sourcesLoading && !sources;

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        {/* ================================================================ */}
        {/*  Top bar: title + stats + channel master switches                */}
        {/* ================================================================ */}
        <AdminFormCard className="shrink-0 mb-3">
          {/* Title row */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
            <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">
              {pageLabel}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <AdminButton
                type="button"
                tone="ghost"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["notify-sources"] });
                  queryClient.invalidateQueries({ queryKey: ["push-dashboard-overview"] });
                  refetchSources();
                }}
              >
                <RotateCw className="h-4 w-4" aria-hidden /> 刷新
              </AdminButton>
            </div>
          </div>

          {/* Channel master switches */}
          <div className="flex flex-wrap items-center gap-6 mb-3">
            <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">
              渠道总控
            </span>
            {(["EMAIL", "SERVER_CHAN"] as const).map((code) => {
              const label = code === "EMAIL" ? "邮件" : "Server酱";
              const checked = masterSwitches[code] ?? false;
              return (
                <label
                  key={code}
                  className="inline-flex items-center gap-2 cursor-pointer select-none"
                >
                  <AdminSwitchScaled
                    size="sm"
                    checked={checked}
                    onChange={() => toggleMasterSwitch(code)}
                  />
                  <span className="text-sm text-[var(--app-color-text-primary)]">{label}</span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      checked
                        ? "text-[var(--app-color-feedback-success)]"
                        : "text-[var(--app-color-text-tertiary)]",
                    )}
                  >
                    {checked ? "已开启" : "已关闭"}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[var(--app-color-text-secondary)]">
            <span>
              已注册：<span className="font-semibold text-[var(--app-color-text-primary)]">{stats.total}</span>
            </span>
            <span>
              已启用：<span className="font-semibold text-[var(--app-color-feedback-success)]">{stats.enabled}</span>
            </span>
            <span>
              已禁用：<span className="font-semibold text-[var(--app-color-text-tertiary)]">{stats.disabled}</span>
            </span>
            {overview ? (
              <>
                <span className="text-[var(--app-color-border-default)]">|</span>
                <span>
                  近24h：<span className="font-semibold text-[var(--app-color-text-primary)]">{overview.sent24h}</span>条
                </span>
                <span>
                  成功：<span className="font-semibold text-[var(--app-color-feedback-success)]">{overview.success24h}</span>
                </span>
                <span>
                  失败：<span className="font-semibold text-[var(--app-color-feedback-error)]">{overview.failed24h}</span>
                </span>
              </>
            ) : null}
          </div>
        </AdminFormCard>

        {/* ================================================================ */}
        {/*  Source cards — scrollable                                        */}
        {/* ================================================================ */}
        <AdminFillScrollRegion>
          <div className="space-y-3">
            {isSourcesLoading ? (
              <div
                role="status"
                aria-busy="true"
                className="flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]"
              >
                加载中…
              </div>
            ) : sourcesError ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--app-color-feedback-error)]/30 bg-[var(--app-color-feedback-danger-soft)] p-6 text-center text-sm text-[var(--app-color-feedback-error)]">
                <p>{(sourcesError as Error)?.message ?? "加载失败"}</p>
                <button
                  type="button"
                  onClick={() => refetchSources()}
                  className="rounded-lg border border-[var(--app-color-feedback-error)]/40 bg-[var(--app-color-surface-container)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-feedback-error)] hover:bg-[var(--app-color-surface-hover)]"
                >
                  重试
                </button>
              </div>
            ) : (sources ?? []).length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-sm text-[var(--app-color-text-tertiary)]">
                暂无推送来源配置
              </div>
            ) : (
              (sources ?? []).map((source) => {
                const expanded = expandedIds.has(source.sourceId);
                const isToggling = savingToggles.has(source.sourceId);
                const variables = source.variables ?? {};
                const varKeys = Object.keys(variables);

                return (
                  <AdminFormCard
                    key={source.sourceId}
                    className={cn("transition-all", expanded && "ring-1 ring-[var(--app-color-accent)]/30")}
                  >
                    {/* Header: name + toggle + expand */}
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(source.sourceId)}
                        className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity"
                      >
                        <span className="text-sm font-semibold text-[var(--app-color-text-primary)] truncate">
                          {source.sourceName}
                        </span>
                        {expanded ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
                        )}
                      </button>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Channel badges */}
                        <span className="hidden sm:flex items-center gap-2">
                          {source.channels.map((ch) => (
                            <span
                              key={ch.id}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                ch.enabled
                                  ? "border-[var(--app-color-feedback-success)]/30 bg-[var(--app-color-feedback-success)]/10 text-[var(--app-color-feedback-success)]"
                                  : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)]",
                              )}
                            >
                              {channelIconMap[ch.channelCode] ?? <Bell className="h-3 w-3" />}
                              {ch.channelName}
                            </span>
                          ))}
                        </span>

                        <span
                          className={cn(
                            "text-xs font-medium",
                            source.sourceEnabled
                              ? "text-[var(--app-color-feedback-success)]"
                              : "text-[var(--app-color-text-tertiary)]",
                          )}
                        >
                          {source.sourceEnabled ? "已启用" : "已禁用"}
                        </span>

                        <AdminButton type="button" tone="ghost" size="sm"
                          onClick={() => setTestSource(source.sourceCode)}>
                          <Send className="h-3.5 w-3.5" aria-hidden /> 测试
                        </AdminButton>

                        <AdminSwitchScaled
                          size="sm"
                          checked={source.sourceEnabled}
                          disabled={isToggling}
                          onChange={(checked) =>
                            toggleSourceMutation.mutate({
                              sourceId: source.sourceId,
                              enabled: checked,
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Description (always visible) */}
                    {source.description ? (
                      <p className="mt-1 text-xs text-[var(--app-color-text-tertiary)]">
                        {source.description}
                      </p>
                    ) : null}

                    {/* ================================================ */}
                    {/*  Expanded body                                    */}
                    {/* ================================================ */}
                    {expanded && (
                      <div className="mt-4 space-y-4 border-t border-[var(--app-color-border-default)] pt-4">
                        {/* ---- Recipients ---- */}
                        <RecipientSection
                          source={source}
                          drafts={recipientDrafts[source.sourceId] ?? []}
                          saving={savingRecipients.has(source.sourceId)}
                          onAdd={(rec) => addRecipientDraft(source.sourceId, rec)}
                          onRemove={(idx) => removeRecipientDraft(source.sourceId, idx)}
                          onUpdate={(idx, patch) => updateRecipientDraft(source.sourceId, idx, patch)}
                          onSave={(list) =>
                            saveRecipientsMutation.mutate({
                              sourceId: source.sourceId,
                              recipients: list,
                            })
                          }
                        />

                        {/* ---- Channel configs (collapsed by default) ---- */}
                        <ChannelConfigSection
                          source={source}
                          drafts={channelDrafts[source.sourceId] ?? {}}
                          savingChannels={savingChannels}
                          onUpdate={updateChannelDraft}
                          onSave={(sourceId, channelCode, body) =>
                            saveChannelMutation.mutate({ sourceId, channelCode, body })
                          }
                        />
                      </div>
                    )}
                  </AdminFormCard>
                );
              })
            )}
          </div>
        </AdminFillScrollRegion>
      </div>
      {/* Test-send modal */}
      {testSource && (
        <TestSendModal sourceCode={testSource} onClose={() => setTestSource(null)} />
      )}
    </AdminPageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  TestSendModal                                                       */
/* ------------------------------------------------------------------ */

function TestSendModal({ sourceCode, onClose }: { sourceCode: string; onClose: () => void }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [testNames, setTestNames] = useState<string[]>([]);
  const [testIds, setTestIds] = useState<string[]>([]);

  const doSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = { sourceCode };
      if (testIds.length > 0) body.targetUserIds = testIds;
      const res = await authHttp.post("/admin/push-test/send", body);
      const data = res.data?.data ?? {};
      const sent = (data.sent as number) ?? 0;
      const failed = (data.failed as number) ?? 0;
      const skipped = (data.skipped as number) ?? 0;
      const diagnosis = data.diagnosis as string[] | undefined;
      const names = testNames.length > 0 ? testNames.join("、") : "后台配置的接收人 + 渠道绑定用户";

      const parts: string[] = [];
      if (sent > 0) parts.push(`✅ 成功 ${sent} 条`);
      if (failed > 0) parts.push(`❌ 失败 ${failed} 条`);
      if (skipped > 0) parts.push(`⏭️ 跳过 ${skipped} 条`);
      if (parts.length === 0) parts.push("⚠️ 未发送任何消息");

      let msg = parts.join("，");
      if (diagnosis?.length) msg += "\n诊断: " + diagnosis.join(" → ");
      setResult(msg);
    } catch (e: unknown) {
      setResult(`发送失败 — ${e instanceof Error ? e.message : "未知错误"}`);
    } finally {
      setSending(false);
    }
  };

  const recipientText = testNames.length > 0
    ? `接收人为: ${testNames.join("、")}`
    : "接收人为后台配置的接收人 + 渠道绑定用户";

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">测试发送</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]">
            <X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" />
          </button>
        </div>
        <p className="text-xs text-[var(--app-color-text-secondary)] mb-4">
          将使用模拟数据发送 <code className="text-[11px] bg-[var(--app-color-surface-hover)] px-1 rounded">{sourceCode}</code> 通知。
          {recipientText}
        </p>

        {/* Selected test recipients as name chips */}
        {testNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {testNames.map((name, i) => (
              <span key={testIds[i]} className="inline-flex items-center gap-1 rounded-md bg-[var(--app-color-accent)]/15 border border-[var(--app-color-accent)]/25 px-2 py-1 text-xs font-medium text-[var(--app-color-accent)] max-w-[180px]">
                <span className="truncate">{name}</span>
                <button type="button" onClick={() => {
                  setTestIds(prev => prev.filter((_, j) => j !== i));
                  setTestNames(prev => prev.filter((_, j) => j !== i));
                }} className="rounded-sm p-0.5 hover:bg-[var(--app-color-accent)]/20 transition-colors shrink-0">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <AdminButton type="button" tone="secondary" size="sm" onClick={() => setPickerOpen(true)}>
            <Search className="h-3.5 w-3.5" /> 选择测试接收人
          </AdminButton>
          <div className="flex items-center gap-2">
            <AdminButton type="button" tone="ghost" size="sm" onClick={onClose}>取消</AdminButton>
            <AdminButton type="button" tone="primary" size="sm" loading={sending} onClick={doSend}>
              <Send className="h-3.5 w-3.5" /> 发送
            </AdminButton>
          </div>
        </div>

        {result && (
          <p className="mt-3 text-xs text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-elevated)] rounded-lg p-2 whitespace-pre-wrap">{result}</p>
        )}

        {pickerOpen && (
          <PersonnelPicker
            onClose={() => setPickerOpen(false)}
            onConfirm={(ids, names) => {
              setTestIds(ids);
              setTestNames(names);
              setPickerOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ChannelConfigSection — modal popup                                 */
/* ------------------------------------------------------------------ */

function ChannelConfigSection({
  source,
  drafts,
  savingChannels,
  onUpdate,
  onSave,
}: {
  source: NotifySourceConfig;
  drafts: Record<number, ChannelDraft>;
  savingChannels: Set<string>;
  onUpdate: (sourceId: number, channelId: number, patch: Partial<ChannelDraft>) => void;
  onSave: (sourceId: number, channelCode: string, body: ChannelDraft) => void;
}) {
  const [openChannel, setOpenChannel] = useState<string | null>(null);

  const channelDefs: Array<{ code: string; name: string; icon: React.ReactNode; formatHint: string }> = [
    { code: "EMAIL", name: "邮件通知", icon: <Mail className="h-3.5 w-3.5" />, formatHint: "邮件支持 HTML 格式。" },
    { code: "SERVER_CHAN", name: "Server酱", icon: <MessageSquareText className="h-3.5 w-3.5" />, formatHint: "Server酱支持 Markdown（含表格、图片）。图片语法：![img](https://example.com/a.png)，需公网 URL，不支持 base64。" },
  ];

  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1.5">
        <Bell className="h-3.5 w-3.5 text-[var(--app-color-accent)]" />
        渠道与模板
      </h4>
      <div className="flex flex-wrap gap-2">
        {channelDefs.map((def) => {
          const ch = source.channels.find(c => c.channelCode === def.code);
          const draft = ch ? drafts[ch.id] : null;
          const enabled = draft?.enabled ?? false;
          return (
            <div key={def.code} className="inline-flex items-center gap-0.5">
              <AdminButton type="button" tone={enabled ? "secondary" : "ghost"} size="sm"
                onClick={() => setOpenChannel(def.code)}>
                {def.icon}
                {def.name}
              </AdminButton>
              <AdminSwitchScaled size="sm" checked={enabled}
                onChange={(v) => { const c = source.channels.find(x => x.channelCode === def.code); if (c) onUpdate(source.sourceId, c.id, { enabled: v }); }} />
            </div>
          );
        })}
      </div>

      {/* Per-channel modal */}
      {openChannel && (() => {
        const ch = source.channels.find(c => c.channelCode === openChannel);
        if (!ch) return null;
        const draft = drafts[ch.id];
        if (!draft) return null;
        const def = channelDefs.find(d => d.code === openChannel)!;
        const saveKey = `${source.sourceId}:${ch.channelCode}`;
        const isSaving = savingChannels.has(saveKey);

        return (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={() => setOpenChannel(null)}>
            <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] flex items-center gap-2">
                  {def.icon} {def.name} — {source.sourceName}
                </h3>
                <button onClick={() => setOpenChannel(null)} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]">
                  <X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" />
                </button>
              </div>

              {/* Variables */}
              {Object.keys(source.variables ?? {}).length > 0 && (
                <div className="rounded-lg border border-dashed border-[var(--app-color-accent)]/30 bg-[var(--app-color-accent-soft)] p-2 mb-3">
                  <p className="text-[11px] font-medium text-[var(--app-color-text-primary)] mb-1 flex items-center gap-1">
                    <Variable className="h-3 w-3 text-[var(--app-color-accent)]" /> 可用变量
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(source.variables ?? {}).map(([k, v]) => (
                      <code key={k} className="inline-block rounded bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--app-color-accent)] cursor-pointer hover:bg-[var(--app-color-accent)]/10"
                        onClick={() => onUpdate(source.sourceId, ch.id, { titleTpl: draft.titleTpl + `{${k}}` })} title={`${k}: ${v}`}>
                        {`{${k}}`}
                      </code>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--app-color-text-tertiary)]">
                    {Object.entries(source.variables ?? {}).map(([k, v]) => `${k}: ${v}`).join("；")}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className={adminLabelClass}>标题模板</label>
                  <input className={cn(adminInputClass, "mt-1")} value={draft.titleTpl}
                    onChange={(e) => onUpdate(source.sourceId, ch.id, { titleTpl: e.target.value })} />
                </div>
                <div>
                  <label className={adminLabelClass}>内容模板</label>
                  <textarea className={cn(adminInputClass, "mt-1 min-h-[120px] resize-y")} value={draft.contentTpl}
                    placeholder={def.formatHint}
                    onChange={(e) => onUpdate(source.sourceId, ch.id, { contentTpl: e.target.value })} />
                  <p className="mt-1 text-[10px] text-[var(--app-color-text-tertiary)]">{def.formatHint}</p>
                </div>
                <p className="text-[11px] font-medium text-[var(--app-color-text-secondary)] mt-3 mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> 通知时间段
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={adminLabelClass}>开始</label>
                    <input className={cn(adminInputClass, "mt-1")} type="time" value={draft.quietStart}
                      onChange={(e) => onUpdate(source.sourceId, ch.id, { quietStart: e.target.value })} />
                  </div>
                  <div>
                    <label className={adminLabelClass}>结束</label>
                    <input className={cn(adminInputClass, "mt-1")} type="time" value={draft.quietEnd}
                      onChange={(e) => onUpdate(source.sourceId, ch.id, { quietEnd: e.target.value })} />
                  </div>
                  <div>
                    <label className={adminLabelClass}>频率限制(秒)</label>
                    <input className={cn(adminInputClass, "mt-1")} type="number" min={0} value={draft.rateLimitSeconds}
                      onChange={(e) => onUpdate(source.sourceId, ch.id, { rateLimitSeconds: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <AdminButton type="button" tone="primary" size="sm" loading={isSaving}
                    onClick={() => onSave(source.sourceId, ch.channelCode, draft)}>
                    <Save className="h-3.5 w-3.5" /> 保存
                  </AdminButton>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RecipientSection sub-component                                     */
/* ------------------------------------------------------------------ */

interface PersonnelRow {
  id: string;
  name: string;
  jobNumber: string;
  role: string;
  departmentName: string;
  contactEmail: string;
  sendKey: string;
}

function RecipientSection({
  source,
  drafts,
  onAdd,
  onRemove,
  onUpdate,
  onSave,
}: {
  source: NotifySourceConfig;
  drafts: RecipientDraft[];
  saving: boolean;
  onAdd: (rec?: RecipientDraft) => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, patch: Partial<RecipientDraft>) => void;
  onSave: (list: RecipientDraft[]) => void;
}) {
  const hasAutoResolve = "targetUserId" in (source.variables ?? {});
  const [pickerOpen, setPickerOpen] = useState(false);

  // Each draft holds ONE user ID; display name comes from server-resolved scopeLabel
  const selectedPeople = useMemo(() => {
    return drafts
      .filter(r => r.scopeType === "USER" && r.scopeValue)
      .map((r, idx) => ({
        id: r.scopeValue,
        name: r.scopeLabel || r.scopeValue,
        draftIdx: idx,
      }));
  }, [drafts]);

  const removePerson = (_id: string, draftIdx: number) => {
    const newList = drafts.filter((_, i) => i !== draftIdx);
    if (newList.length === 0) {
      onRemove(draftIdx);
      onSave([]);
    } else {
      onRemove(draftIdx);
      onSave(newList);
    }
  };

  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-[var(--app-color-accent)]" />
        接收人
        {hasAutoResolve && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--app-color-accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--app-color-accent)]">
            <UserPlus className="h-3 w-3" />
            自动索引
          </span>
        )}
      </h4>

      {hasAutoResolve && (
        <p className="text-[11px] text-[var(--app-color-text-tertiary)] mb-2 leading-relaxed">
          此消息源包含 <code className="text-[10px] bg-[var(--app-color-surface-hover)] px-1 rounded">targetUserId</code>，
          系统自动查找该人员的 contact_email / send_key 推送。以下额外接收人将同时收到通知。
        </p>
      )}

      {selectedPeople.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {selectedPeople.map(({ id, name, draftIdx }) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--app-color-accent)]/15 border border-[var(--app-color-accent)]/25 px-2 py-1 text-xs font-medium text-[var(--app-color-accent)] max-w-[200px]"
              title={id}
            >
              <span className="truncate">{name}</span>
              <button
                type="button"
                onClick={() => removePerson(id, draftIdx)}
                className="rounded-sm p-0.5 hover:bg-[var(--app-color-accent)]/20 transition-colors shrink-0"
                title="移除"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <AdminButton
          type="button" tone="primary" size="sm"
          onClick={() => setPickerOpen(true)}
        >
          <Search className="h-3.5 w-3.5" aria-hidden /> {hasAutoResolve ? "添加额外人员" : "添加人员"}
        </AdminButton>
        {selectedPeople.length > 0 && (
          <AdminButton
            type="button" tone="secondary" size="sm"
            onClick={() => onSave(drafts)}
          >
            <Save className="h-3.5 w-3.5" /> 保存
          </AdminButton>
        )}
      </div>

      {pickerOpen && (
        <PersonnelPicker
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids, names) => {
            const newRecs: RecipientDraft[] = ids.map((id, i) => ({
              perspective: "ALL", scopeType: "USER", scopeValue: id,
              scopeLabel: names[i] ?? id,
            }));
            for (const rec of newRecs) onAdd(rec);
            onSave([...drafts, ...newRecs]);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PersonnelPicker — modal with student/staff tabs + search + multi   */
/* ------------------------------------------------------------------ */

function PersonnelPicker({
  initialIds,
  onClose,
  onConfirm,
}: {
  perspective?: string;
  initialIds?: string[];
  onClose: () => void;
  onConfirm: (ids: string[], names: string[]) => void;
}) {
  const [tab, setTab] = useState<"STUDENT" | "STAFF">("STUDENT");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [selected, setSelected] = useState<Map<string, PersonnelRow>>(new Map());
  const [allRows, setAllRows] = useState<PersonnelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [systemRows, setSystemRows] = useState<PersonnelRow[]>([]);
  const [sysLoading, setSysLoading] = useState(false);
  const PAGE_SIZE = 50;

  // Debounce keyword input to avoid firing API on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword.trim()), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  const fetchPage = useCallback(async (kw: string, pg: number, reset: boolean) => {
    setLoading(true);
    try {
      const res = await authHttp.get("/admin/personnel", { params: { keyword: kw || undefined, page: pg, size: PAGE_SIZE } });
      const paged: any = res.data?.data;
      const rows: PersonnelRow[] = Array.isArray(paged?.data) ? paged.data : (Array.isArray(paged) ? paged : []);
      setAllRows(prev => {
        const merged = reset ? rows : [...prev, ...rows];
        const seen = new Set<string>();
        return merged.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
      });
      setTotal(paged?.total ?? rows.length);
    } catch { if (reset) setAllRows([]); }
    finally { setLoading(false); }
  }, []);

  // Fetch personnel when on STUDENT tab and debounced keyword changes
  useEffect(() => {
    if (tab !== "STUDENT") return;
    fetchPage(debouncedKeyword, 1, true);
  }, [fetchPage, debouncedKeyword, tab]);

  // Fetch system-only users (staff accounts not in personnel library) via backend search
  useEffect(() => {
    if (tab !== "STAFF") return;
    let cancelled = false;
    (async () => {
      setSysLoading(true);
      try {
        const res = await authHttp.get("/admin/system-users", {
          params: { keyword: debouncedKeyword || undefined, page: 1, size: 200 },
        });
        if (cancelled) return;
        const paged: any = res.data?.data;
        const rows: any[] = Array.isArray(paged?.data) ? paged.data : (Array.isArray(paged) ? paged : []);
        const mapped: PersonnelRow[] = rows.map((r: any) => ({
          id: r.id,
          name: r.displayNickname || r.username || "",
          jobNumber: r.username || "",
          role: r.role || "STAFF",
          departmentName: "",
          contactEmail: "",
          sendKey: "",
        }));
        setSystemRows(mapped);
      } catch { if (!cancelled) setSystemRows([]); }
      finally { if (!cancelled) setSysLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [debouncedKeyword, tab]);

  const nextPage = Math.floor(allRows.length / PAGE_SIZE) + 1;
  const hasMore = tab === "STUDENT" && allRows.length < total;

  const filtered = useMemo(() => {
    if (tab === "STUDENT") {
      // All aro_personnel records are students (see bootstrap-add-account-source.sql).
      return allRows;
    }
    // STAFF tab: system-only users (staff accounts without personnel records)
    return systemRows;
  }, [allRows, systemRows, tab]);

  const toggle = (row: PersonnelRow) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] mb-3">从人员库选择</h3>

        <div className="flex gap-1 mb-3 rounded-lg bg-[var(--app-color-surface-hover)] p-0.5">
          {(["STUDENT", "STAFF"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t ? "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] shadow-sm"
                          : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]")}>
              {t === "STUDENT" ? "学生" : "教职工"}
            </button>
          ))}
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--app-color-text-tertiary)]" />
          <input className={cn(adminInputClass, "pl-8")} placeholder="搜索姓名或工号"
            value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>

        <div className="max-h-[300px] overflow-auto space-y-1 mb-3">
          {(loading || sysLoading) && filtered.length === 0 ? (
            <p className="text-xs text-[var(--app-color-text-tertiary)] text-center py-8">搜索中…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-[var(--app-color-text-tertiary)] text-center py-8">无结果</p>
          ) : (
            <>
              {filtered.map((row) => {
                const checked = selected.has(row.id);
                return (
                  <label key={row.id} className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors text-xs",
                    checked ? "bg-[var(--app-color-accent)]/10" : "hover:bg-[var(--app-color-surface-hover)]")}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(row)}
                      className="h-3.5 w-3.5 rounded accent-[var(--app-color-accent)]" />
                    <span className="font-medium min-w-[60px]">{row.name}</span>
                    <span className="text-[var(--app-color-text-tertiary)]">{row.jobNumber}</span>
                    <span className="text-[var(--app-color-text-tertiary)] truncate">{row.departmentName}</span>
                    {row.contactEmail && <Mail className="h-3 w-3 text-[var(--app-color-feedback-success)] shrink-0" />}
                    {row.sendKey && <MessageSquareText className="h-3 w-3 text-[var(--app-color-feedback-success)] shrink-0" />}
                  </label>
                );
              })}
              {hasMore && (
                <button type="button" onClick={() => fetchPage(debouncedKeyword, nextPage, false)} disabled={loading}
                  className="w-full py-1.5 text-xs text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)] rounded transition-colors">
                  {loading ? "加载中…" : `加载更多 (${allRows.length}/${total})`}
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--app-color-border-default)] pt-3">
          <span className="text-xs text-[var(--app-color-text-tertiary)]">已选 {selected.size} 人</span>
          <div className="flex gap-2">
            <AdminButton type="button" tone="ghost" size="sm" onClick={onClose}>取消</AdminButton>
            <AdminButton type="button" tone="primary" size="sm"
              onClick={() => onConfirm(Array.from(selected.keys()), Array.from(selected.values()).map(r => r.name))}>
              <Check className="h-3.5 w-3.5" /> 确定
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}
