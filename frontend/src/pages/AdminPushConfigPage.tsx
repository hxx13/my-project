import { useMemo, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFormCard, AdminPageShell, AdminFillScrollRegion } from "@/components/admin/AdminPageShell";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { authHttp } from "@/api/core/authHttp";
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
    queryFn: () => authHttp.get("/api/admin/push-dashboard/overview").then((r) => r.data.data),
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

  useMemo(() => {
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
      authHttp.put(`/api/admin/notify-source/${sourceId}/enabled?enabled=${enabled}`),
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
    }) => authHttp.put(`/api/admin/notify-source/${sourceId}/channels/${channelCode}`, body),
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
      authHttp.put(`/api/admin/notify-source/${sourceId}/recipients`, recipients),
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

  const addRecipientDraft = (sourceId: number) => {
    setRecipientDrafts((prev) => ({
      ...prev,
      [sourceId]: [
        ...(prev[sourceId] ?? []),
        { perspective: "STUDENT", scopeType: "ALL", scopeValue: "" },
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
                        {/* ---- Channel configs ---- */}
                        <div>
                          <h4 className="text-xs font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5 text-[var(--app-color-accent)]" />
                            渠道配置
                          </h4>
                          <div className="space-y-3">
                            {source.channels.map((ch) => {
                              const draft = channelDrafts[source.sourceId]?.[ch.id];
                              if (!draft) return null;
                              const saveKey = `${source.sourceId}:${ch.channelCode}`;
                              const isSaving = savingChannels.has(saveKey);

                              return (
                                <div
                                  key={ch.id}
                                  className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-3"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-[var(--app-color-text-primary)] flex items-center gap-1.5">
                                      {channelIconMap[ch.channelCode] ?? null}
                                      {ch.channelName}
                                    </span>
                                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                                      <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
                                        {draft.enabled ? "启用" : "停用"}
                                      </span>
                                      <AdminSwitchScaled
                                        size="3"
                                        checked={draft.enabled}
                                        onChange={(v) =>
                                          updateChannelDraft(source.sourceId, ch.id, {
                                            enabled: v,
                                          })
                                        }
                                      />
                                    </label>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Title template */}
                                    <div>
                                      <label className={adminLabelClass}>标题模板</label>
                                      <input
                                        className={cn(adminInputClass, "mt-1")}
                                        value={draft.titleTpl}
                                        placeholder="通知标题，支持变量"
                                        onChange={(e) =>
                                          updateChannelDraft(source.sourceId, ch.id, {
                                            titleTpl: e.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                    {/* Content template */}
                                    <div>
                                      <label className={adminLabelClass}>内容模板</label>
                                      <input
                                        className={cn(adminInputClass, "mt-1")}
                                        value={draft.contentTpl}
                                        placeholder="通知正文，支持变量"
                                        onChange={(e) =>
                                          updateChannelDraft(source.sourceId, ch.id, {
                                            contentTpl: e.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                    {/* Quiet start */}
                                    <div>
                                      <label className={adminLabelClass}>
                                        <Clock className="h-3 w-3 inline mr-1" />
                                        静默开始
                                      </label>
                                      <input
                                        className={cn(adminInputClass, "mt-1")}
                                        type="time"
                                        value={draft.quietStart}
                                        onChange={(e) =>
                                          updateChannelDraft(source.sourceId, ch.id, {
                                            quietStart: e.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                    {/* Quiet end */}
                                    <div>
                                      <label className={adminLabelClass}>
                                        <Clock className="h-3 w-3 inline mr-1" />
                                        静默结束
                                      </label>
                                      <input
                                        className={cn(adminInputClass, "mt-1")}
                                        type="time"
                                        value={draft.quietEnd}
                                        onChange={(e) =>
                                          updateChannelDraft(source.sourceId, ch.id, {
                                            quietEnd: e.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                    {/* Rate limit */}
                                    <div>
                                      <label className={adminLabelClass}>频率限制（秒）</label>
                                      <input
                                        className={cn(adminInputClass, "mt-1")}
                                        type="number"
                                        min={0}
                                        value={draft.rateLimitSeconds}
                                        onChange={(e) =>
                                          updateChannelDraft(source.sourceId, ch.id, {
                                            rateLimitSeconds: Number(e.target.value),
                                          })
                                        }
                                      />
                                    </div>
                                  </div>

                                  <div className="mt-3 flex items-center justify-end">
                                    <AdminButton
                                      type="button"
                                      tone="primary"
                                      size="sm"
                                      loading={isSaving}
                                      onClick={() =>
                                        saveChannelMutation.mutate({
                                          sourceId: source.sourceId,
                                          channelCode: ch.channelCode,
                                          body: draft,
                                        })
                                      }
                                    >
                                      <Save className="h-3.5 w-3.5" aria-hidden /> 保存渠道
                                    </AdminButton>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* ---- Variable hints ---- */}
                        {varKeys.length > 0 && (
                          <div className="rounded-lg border border-dashed border-[var(--app-color-accent)]/30 bg-[var(--app-color-accent-soft)] p-3">
                            <p className="text-xs font-medium text-[var(--app-color-text-primary)] mb-1 flex items-center gap-1">
                              <Variable className="h-3.5 w-3.5 text-[var(--app-color-accent)]" />
                              可用变量
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {varKeys.map((k) => (
                                <code
                                  key={k}
                                  className="inline-block rounded bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--app-color-accent)]"
                                >
                                  {`{${k}}`}
                                </code>
                              ))}
                            </div>
                            {Object.keys(variables).length > 0 && (
                              <p className="mt-1.5 text-[11px] text-[var(--app-color-text-tertiary)]">
                                {Object.entries(variables)
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join("；")}
                              </p>
                            )}
                          </div>
                        )}

                        {/* ---- Recipients ---- */}
                        <div>
                          <h4 className="text-xs font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-[var(--app-color-accent)]" />
                            接收人
                          </h4>

                          <div className="space-y-2">
                            {(recipientDrafts[source.sourceId] ?? []).map(
                              (rec, idx) => (
                                <div
                                  key={idx}
                                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3 py-2"
                                >
                                  {/* Perspective */}
                                  <select
                                    className={cn(
                                      "rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none",
                                    )}
                                    value={rec.perspective}
                                    onChange={(e) =>
                                      updateRecipientDraft(source.sourceId, idx, {
                                        perspective: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="STUDENT">学生</option>
                                    <option value="STAFF">教职工</option>
                                  </select>

                                  {/* Scope type */}
                                  <select
                                    className={cn(
                                      "rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none",
                                    )}
                                    value={rec.scopeType}
                                    onChange={(e) =>
                                      updateRecipientDraft(source.sourceId, idx, {
                                        scopeType: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="ALL">全部</option>
                                    <option value="ROLE">指定角色</option>
                                    <option value="DEPARTMENT">指定部门</option>
                                    <option value="SPECIFIC">指定人员</option>
                                  </select>

                                  {/* Scope value */}
                                  {rec.scopeType !== "ALL" && (
                                    <input
                                      className={cn(
                                        "flex-1 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none",
                                        "min-w-[120px]",
                                      )}
                                      placeholder={
                                        rec.scopeType === "ROLE"
                                          ? "角色标识"
                                          : rec.scopeType === "DEPARTMENT"
                                            ? "部门ID"
                                            : "用户ID"
                                      }
                                      value={rec.scopeValue}
                                      onChange={(e) =>
                                        updateRecipientDraft(source.sourceId, idx, {
                                          scopeValue: e.target.value,
                                        })
                                      }
                                    />
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeRecipientDraft(source.sourceId, idx)
                                    }
                                    className="ml-auto rounded p-1 text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-feedback-error)] transition-colors"
                                    title="移除"
                                  >
                                    <AlertCircle className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ),
                            )}
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            <AdminButton
                              type="button"
                              tone="ghost"
                              size="sm"
                              onClick={() => addRecipientDraft(source.sourceId)}
                            >
                              + 添加接收人
                            </AdminButton>
                            <AdminButton
                              type="button"
                              tone="secondary"
                              size="sm"
                              loading={savingRecipients.has(source.sourceId)}
                              onClick={() =>
                                saveRecipientsMutation.mutate({
                                  sourceId: source.sourceId,
                                  recipients:
                                    recipientDrafts[source.sourceId] ?? [],
                                })
                              }
                            >
                              <Save className="h-3.5 w-3.5" aria-hidden /> 保存接收人
                            </AdminButton>
                          </div>
                        </div>
                      </div>
                    )}
                  </AdminFormCard>
                );
              })
            )}
          </div>
        </AdminFillScrollRegion>
      </div>
    </AdminPageShell>
  );
}
