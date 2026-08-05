import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminPageTabs, AdminTabPanel } from "@/components/admin/AdminPageTabs";
import { PersonnelPicker, type PersonnelRow } from "@/components/admin/PersonnelPicker";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { authHttp } from "@/api/core/authHttp";
import { adminHttp } from "@/api/core/adminHttp";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import {
  getTelemetryGlobalAlarmLimits,
  putTelemetryGlobalAlarmLimits,
  type TelemetryGlobalAlarmLimits,
} from "@/api/domains/telemetryWatchlistAdmin.api";
import {
  fetchAlarmConfigTree,
  saveFloorConfig,
  saveSuiteConfig,
  setTagAlarmEnabled,
  setTagAlarmOverrides,
  batchSetTagAlarmOverrides,
  fetchAlarmPresets,
  createAlarmPreset,
  updateAlarmPreset,
  deleteAlarmPreset,
  type AlarmConfigTree,
  type FloorNode,
  type SuiteNode,
  type TagAlarmOverridePatch,
  type AlarmPreset,
} from "@/api/domains/telemetryAlarmConfig.api";
import { SwipeAlertRuleList } from "@/features/swipe-alert/SwipeAlertRuleList";
import { SwipeAlertRuleForm } from "@/features/swipe-alert/SwipeAlertRuleForm";
import type { SwipeAlertRuleRow } from "@/api/domains/swipeAlert.api";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Gauge,
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
  Smartphone,
  SlidersHorizontal,
  Thermometer,
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
  visibleTo: string;
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
  WXPUSHER: <Smartphone className="h-4 w-4" aria-hidden />,
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

  /* ---- tab navigation ---- */
  const [pushTab, setPushTab] = useState<"sources" | "animal-alarm" | "swipe-alarm">("sources");

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
    }) => authHttp.put(`/admin/notify-source/${sourceId}/channels/${channelCode}`, {
        ...body,
        quietStart: body.quietStart || null,
        quietEnd: body.quietEnd || null,
      }),
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

  /* ---- telemetry-only sources for animal-room alarm tab ---- */
  const telemetrySources = useMemo(() => {
    if (!sources) return [];
    return sources.filter((s) =>
      s.sourceCode === "TELEMETRY_ALARM" || s.sourceCode === "TELEMETRY_RECOVERY"
    );
  }, [sources]);

  /* ---- channel master switch state (local-only; persisted via existing settings API) ---- */
  /* ---- channel master switches ---- */
  const { data: channelMasters } = useQuery<{ channel_code: string; enabled: number }[]>({
    queryKey: ["channel-masters"],
    queryFn: () => authHttp.get("/admin/notify-source/channel-masters").then(r => r.data.data),
    staleTime: 30_000,
  });

  const toggleChannelMasterMutation = useMutation({
    mutationFn: ({ code, enabled }: { code: string; enabled: boolean }) =>
      authHttp.put(`/admin/notify-source/channel-masters/${code}?enabled=${enabled}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channel-masters"] }),
  });

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
            <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">渠道总控</span>
            {(["EMAIL", "SERVER_CHAN", "WXPUSHER"] as const).map((code) => {
              const label = code === "EMAIL" ? "邮件" : code === "SERVER_CHAN" ? "Server酱" : "WxPusher";
              const master = (channelMasters ?? []).find(c => c.channel_code === code);
              const checked = master ? master.enabled === 1 : true;
              return (
                <label key={code} className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <AdminSwitchScaled size="sm" checked={checked}
                    onChange={() => toggleChannelMasterMutation.mutate({ code, enabled: !checked })} />
                  <span className="text-sm text-[var(--app-color-text-primary)]">{label}</span>
                  <span className={cn("text-xs font-medium", checked ? "text-[var(--app-color-feedback-success)]" : "text-[var(--app-color-text-tertiary)]")}>
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
        {/*  Page tabs                                                        */}
        {/* ================================================================ */}
        <AdminPageTabs
          tabs={[
            { id: "sources", label: "信息源配置" },
            { id: "animal-alarm", label: "动物房环境报警" },
            { id: "swipe-alarm", label: "刷卡失败报警" },
          ]}
          value={pushTab}
          onChange={(id) => setPushTab(id as "sources" | "animal-alarm" | "swipe-alarm")}
          className="shrink-0 mb-0"
        />

        {/* ================================================================ */}
        {/*  Tab panels — scrollable content area                             */}
        {/* ================================================================ */}
        <div className="flex-1 min-h-0 flex flex-col rounded-b-xl border border-t-0 border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            <AdminTabPanel tabId="sources" activeTab={pushTab} id="admin-tab-panel-sources">
              <div className="space-y-3 p-3">
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
                        {/* Channel badges — read from local draft so toggle changes reflect instantly */}
                        <span className="hidden sm:flex items-center gap-2">
                          {source.channels.map((ch) => {
                            const draft = channelDrafts[source.sourceId]?.[ch.id];
                            const enabled = draft ? draft.enabled : ch.enabled;
                            return (
                              <span
                                key={ch.id}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                  enabled
                                    ? "border-[var(--app-color-feedback-success)]/30 bg-[var(--app-color-feedback-success)]/10 text-[var(--app-color-feedback-success)]"
                                    : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)]",
                                )}
                              >
                                {channelIconMap[ch.channelCode] ?? <Bell className="h-3 w-3" />}
                                {ch.channelName}
                              </span>
                            );
                          })}
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

                        <select
                          className="rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1.5 py-1 text-[10px] text-[var(--app-color-text-primary)]"
                          value={source.visibleTo ?? "ALL"}
                          onChange={async (e) => {
                            try {
                              await authHttp.put(`/admin/notify-source/${source.sourceId}/visible-to`, { visibleTo: e.target.value });
                              queryClient.invalidateQueries({ queryKey: ["notify-sources"] });
                            } catch (err: any) { toast.error(err?.message || "保存失败"); }
                          }}
                        >
                          <option value="ALL">全部可见</option>
                          <option value="STAFF">仅教职工</option>
                          <option value="STUDENT">仅学生</option>
                        </select>

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
            </AdminTabPanel>

            <AdminTabPanel tabId="animal-alarm" activeTab={pushTab} id="admin-tab-panel-animal-alarm">
              <div className="p-3">
                <AnimalRoomAlarmTab
                  telemetrySources={telemetrySources}
                  sourcesLoading={sourcesLoading}
                />
              </div>
            </AdminTabPanel>

            <AdminTabPanel tabId="swipe-alarm" activeTab={pushTab} id="admin-tab-panel-swipe-alarm">
              <div className="p-3">
                <SwipeAlarmTab sourceEnabled={sources?.find(s => s.sourceCode === "SWIPE_FAILURE_ALERT")?.sourceEnabled} />
              </div>
            </AdminTabPanel>
          </div>
        </div>
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
    { code: "WXPUSHER", name: "WxPusher", icon: <Smartphone className="h-3.5 w-3.5" />, formatHint: "WxPusher 支持文字消息。用户需安装 WxPusher App 并关注应用，消息通过厂商推送到达。" },
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
        const def = channelDefs.find(d => d.code === openChannel)!;
        let ch = source.channels.find(c => c.channelCode === openChannel);
        // 渠道尚未在 DB 创建（如首次配置 WXPUSHER）→ 合成默认对象
        if (!ch) {
          ch = { id: 0, channelCode: openChannel, channelName: def.name, enabled: false, titleTpl: "", contentTpl: "", quietStart: "", quietEnd: "", rateLimitSeconds: 300 };
        }
        let draft = drafts[ch.id];
        if (!draft) {
          draft = { titleTpl: ch.titleTpl ?? "", contentTpl: ch.contentTpl ?? "", enabled: ch.enabled ?? true, quietStart: ch.quietStart ?? "", quietEnd: ch.quietEnd ?? "", rateLimitSeconds: ch.rateLimitSeconds ?? 300 };
        }
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
/*  AnimalRoomAlarmTab — 动物房环境报警配置子页面                         */
/* ------------------------------------------------------------------ */

function AnimalRoomAlarmTab({
  telemetrySources,
  sourcesLoading,
}: {
  telemetrySources: NotifySourceConfig[];
  sourcesLoading: boolean;
}) {
  const [limitsDraft, setLimitsDraft] = useState<TelemetryGlobalAlarmLimits | null>(null);
  const [savingLimits, setSavingLimits] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const limitsQ = useQuery({
    queryKey: ["telemetry-global-alarm-limits"],
    queryFn: getTelemetryGlobalAlarmLimits,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!limitsQ.data || limitsDraft) return;
    setLimitsDraft({
      tempMin: limitsQ.data.tempMin ?? "",
      tempMax: limitsQ.data.tempMax ?? "",
      humMin: limitsQ.data.humMin ?? "",
      humMax: limitsQ.data.humMax ?? "",
      pressureMin: limitsQ.data.pressureMin ?? "",
      pressureMax: limitsQ.data.pressureMax ?? "",
      hysteresisTemp: limitsQ.data.hysteresisTemp ?? "0.3",
      hysteresisHum: limitsQ.data.hysteresisHum ?? "2.0",
      hysteresisPressure: limitsQ.data.hysteresisPressure ?? "5.0",
    });
  }, [limitsQ.data, limitsDraft]);

  const saveLimits = async () => {
    if (!limitsDraft) return;
    setSavingLimits(true);
    try {
      await putTelemetryGlobalAlarmLimits(limitsDraft);
      toast.success("全局报警限已保存，下次告警检测生效");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingLimits(false);
    }
  };

  const limitRow = (
    icon: React.ReactNode,
    label: string,
    loKey: keyof TelemetryGlobalAlarmLimits,
    hiKey: keyof TelemetryGlobalAlarmLimits,
    unit: string,
  ) => {
    if (!limitsDraft) return null;
    return (
      <div className="flex items-center gap-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 w-[80px] shrink-0 text-xs font-medium text-[var(--app-color-text-secondary)]">
          {icon}
          {label}
        </span>
        <input
          type="text"
          inputMode="decimal"
          className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
          placeholder="下限"
          value={limitsDraft[loKey] ?? ""}
          onChange={(e) => setLimitsDraft((p) => p ? { ...p, [loKey]: e.target.value } : null)}
        />
        <span className="text-[11px] text-[var(--app-color-text-tertiary)]">~</span>
        <input
          type="text"
          inputMode="decimal"
          className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
          placeholder="上限"
          value={limitsDraft[hiKey] ?? ""}
          onChange={(e) => setLimitsDraft((p) => p ? { ...p, [hiKey]: e.target.value } : null)}
        />
        <span className="text-[11px] text-[var(--app-color-text-tertiary)] w-[1.5rem] text-right">{unit}</span>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* ── 全局报警限配置 ── */}
      <AdminFormCard>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)] flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-[var(--app-color-accent)]" />
            全局环境报警限
          </h3>
          <AdminButton type="button" tone="primary" size="sm" loading={savingLimits} onClick={saveLimits}>
            <Save className="h-3.5 w-3.5" /> 保存
          </AdminButton>
        </div>
        <p className="text-[11px] text-[var(--app-color-text-tertiary)] mb-2">
          各楼层套间无自定义阈值时使用此全局值。每个测点可在动物房温湿度监测页面逐点覆盖。
        </p>
        {limitsQ.isLoading ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)] py-4">加载中…</p>
        ) : limitsQ.isError ? (
          <p className="text-xs text-[var(--app-color-feedback-error)] py-2">
            加载失败：{(limitsQ.error as Error)?.message ?? "未知错误"}
          </p>
        ) : (
          <div className="space-y-0.5">
            {limitRow(<Thermometer className="h-3.5 w-3.5 text-orange-500" />, "温度", "tempMin", "tempMax", "℃")}
            {limitRow(<Droplets className="h-3.5 w-3.5 text-blue-500" />, "湿度", "humMin", "humMax", "%")}
            {limitRow(<Gauge className="h-3.5 w-3.5 text-emerald-500" />, "压强", "pressureMin", "pressureMax", "Pa")}
            {/* Hysteresis rows — single value per metric */}
            <div className="flex items-center gap-3 py-1.5">
              <span className="inline-flex items-center gap-1.5 w-[80px] shrink-0 text-xs font-medium text-[var(--app-color-text-secondary)]">
                <Thermometer className="h-3.5 w-3.5 text-orange-400" />温度死区
              </span>
              <input type="text" inputMode="decimal"
                className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
                placeholder="0.3"
                value={limitsDraft?.hysteresisTemp ?? ""}
                onChange={(e) => setLimitsDraft((p) => p ? { ...p, hysteresisTemp: e.target.value } : null)} />
              <span className="text-[11px] text-[var(--app-color-text-tertiary)] w-[1.5rem] text-right">℃</span>
            </div>
            <div className="flex items-center gap-3 py-1.5">
              <span className="inline-flex items-center gap-1.5 w-[80px] shrink-0 text-xs font-medium text-[var(--app-color-text-secondary)]">
                <Droplets className="h-3.5 w-3.5 text-blue-400" />湿度死区
              </span>
              <input type="text" inputMode="decimal"
                className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
                placeholder="2.0"
                value={limitsDraft?.hysteresisHum ?? ""}
                onChange={(e) => setLimitsDraft((p) => p ? { ...p, hysteresisHum: e.target.value } : null)} />
              <span className="text-[11px] text-[var(--app-color-text-tertiary)] w-[1.5rem] text-right">%</span>
            </div>
            <div className="flex items-center gap-3 py-1.5">
              <span className="inline-flex items-center gap-1.5 w-[80px] shrink-0 text-xs font-medium text-[var(--app-color-text-secondary)]">
                <Gauge className="h-3.5 w-3.5 text-emerald-400" />压差死区
              </span>
              <input type="text" inputMode="decimal"
                className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
                placeholder="5.0"
                value={limitsDraft?.hysteresisPressure ?? ""}
                onChange={(e) => setLimitsDraft((p) => p ? { ...p, hysteresisPressure: e.target.value } : null)} />
              <span className="text-[11px] text-[var(--app-color-text-tertiary)] w-[1.5rem] text-right">Pa</span>
            </div>
          </div>
        )}
      </AdminFormCard>

      {/* ── 已注册推送源 ── */}
      <AdminFormCard>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-[var(--app-color-text-primary)] hover:opacity-80 transition-opacity w-full text-left"
        >
          <Bell className="h-4 w-4 text-[var(--app-color-accent)]" />
          推送源绑定
          <span className="text-[11px] font-normal text-[var(--app-color-text-tertiary)]">
            （{telemetrySources.length} 个已注册）
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)] ml-auto" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)] ml-auto" />
          )}
        </button>
        <p className="text-[11px] text-[var(--app-color-text-tertiary)] mt-1">
          以下信息源在「信息源配置」Tab 中统一管理渠道和接收人。此处仅展示与动物房环境报警相关的源。
        </p>

        {expanded && (
          <div className="mt-3 space-y-2 border-t border-[var(--app-color-border-default)] pt-3">
            {sourcesLoading ? (
              <p className="text-xs text-[var(--app-color-text-tertiary)]">加载中…</p>
            ) : telemetrySources.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3 py-4 text-center text-xs text-[var(--app-color-text-tertiary)]">
                <p>尚未注册动物房环境报警信息源</p>
                <p className="mt-1">请确保 NotifySourceRegistry 中已注册 TELEMETRY_ALARM 与 TELEMETRY_RECOVERY</p>
              </div>
            ) : (
              telemetrySources.map((src) => {
                const variables = src.variables ?? {};
                return (
                  <div
                    key={src.sourceId}
                    className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3 py-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "inline-block h-2 w-2 rounded-full shrink-0",
                          src.sourceCode === "TELEMETRY_ALARM"
                            ? "bg-[var(--app-color-feedback-error)]"
                            : "bg-[var(--app-color-feedback-success)]",
                        )}
                      />
                      <span className="text-xs font-semibold text-[var(--app-color-text-primary)]">
                        {src.sourceName}
                      </span>
                      <code className="text-[10px] bg-[var(--app-color-surface-hover)] px-1.5 py-0.5 rounded font-mono text-[var(--app-color-text-tertiary)]">
                        {src.sourceCode}
                      </code>
                      <span className="text-[11px] text-[var(--app-color-text-tertiary)] ml-auto">
                        {src.sourceEnabled ? "已启用" : "已禁用"}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--app-color-text-tertiary)] mb-1.5">
                      {src.description}
                    </p>
                    {Object.keys(variables).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {Object.entries(variables).map(([k, v]) => (
                          <code
                            key={k}
                            className="inline-flex items-center gap-1 rounded bg-[var(--app-color-accent)]/10 border border-[var(--app-color-accent)]/20 px-1.5 py-0.5 text-[10px] font-mono text-[var(--app-color-accent)]"
                            title={`${k}: ${v}`}
                          >
                            {`{${k}}`}
                            <span className="text-[var(--app-color-text-tertiary)]">— {v}</span>
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </AdminFormCard>

      {/* ── 楼层/套间管控 ── */}
      <FloorSuiteAlarmPanel />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FloorSuiteAlarmPanel — 楼层→套间→房间→变量 四级管控树               */
/* ------------------------------------------------------------------ */

function FloorSuiteAlarmPanel() {
  const queryClient = useQueryClient();

  const treeQ = useQuery({
    queryKey: ["telemetry-alarm-config-tree"],
    queryFn: fetchAlarmConfigTree,
    staleTime: 15_000,
  });

  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set());
  const [editingSuite, setEditingSuite] = useState<SuiteNode | null>(null);
  const [savingFloor, setSavingFloor] = useState<string | null>(null);
  const [savingSuite, setSavingSuite] = useState(false);
  const [togglingTag, setTogglingTag] = useState<number | null>(null);

  /* ---- tag override drafts & batch selection ---- */
  interface TagOverrideDraft { min: string; max: string; cooldown: number; }
  const [tagDrafts, setTagDrafts] = useState<Record<number, TagOverrideDraft>>({});
  const [savingTags, setSavingTags] = useState<Set<number>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set());
  const [presets, setPresets] = useState<AlarmPreset[]>([]);
  const [presetsExpanded, setPresetsExpanded] = useState(false);
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  const [presetEditor, setPresetEditor] = useState<AlarmPreset | null | undefined>(undefined);

  const [floorDrafts, setFloorDrafts] = useState<Record<string, { resetMin: number; notifyRecovery: boolean; bufferFlush: number }>>({});

  useEffect(() => {
    if (!treeQ.data) return;
    const d: Record<string, { resetMin: number; notifyRecovery: boolean; bufferFlush: number }> = {};
    for (const f of treeQ.data.floors) {
      d[f.floorCode] = { resetMin: f.cooldownMinutes, notifyRecovery: f.notifyOnRecovery, bufferFlush: f.bufferFlushMinutes ?? 5 };
    }
    setFloorDrafts((prev) => ({ ...d, ...prev }));
  }, [treeQ.data]);

  /* ---- presets ---- */
  useEffect(() => { fetchAlarmPresets().then(setPresets).catch(() => {}); }, []);

  /* ---- tag draft helpers ---- */
  const updateTagDraft = (tagId: number, patch: Partial<TagOverrideDraft>) => {
    setTagDrafts(prev => ({
      ...prev,
      [tagId]: { ...(prev[tagId] ?? { min: '', max: '', cooldown: 0 }), ...patch }
    }));
  };

  const saveTagOverride = async (tagId: number) => {
    const draft = tagDrafts[tagId];
    if (!draft) return;
    setSavingTags(prev => new Set(prev).add(tagId));
    try {
      await setTagAlarmOverrides(tagId, {
        tagId, alarmOverrideMin: draft.min || null, alarmOverrideMax: draft.max || null,
        alarmCooldownMinutes: draft.cooldown || null,
      });
      toast.success('已保存');
      queryClient.invalidateQueries({ queryKey: ['telemetry-alarm-config-tree'] });
    } catch (e: any) { toast.error(e?.message || '保存失败'); }
    finally { setSavingTags(prev => { const n = new Set(prev); n.delete(tagId); return n; }); }
  };

  const allAlarmTagsInSuite = (suite: SuiteNode) =>
    suite.rooms.flatMap(r => r.tags).filter(t => t.isAlarmMetric);

  const toggleSelectAll = (checked: boolean, suite: SuiteNode) => {
    const alarmTags = allAlarmTagsInSuite(suite);
    setSelectedTags(prev => {
      const next = new Set(prev);
      alarmTags.forEach(t => checked ? next.add(t.tagId) : next.delete(t.tagId));
      return next;
    });
  };

  const applyPresetToSelected = async () => {
    const preset = presets.find(p => p.id === activePresetId);
    if (!preset || selectedTags.size === 0) return;
    const newDrafts = { ...tagDrafts };
    for (const tagId of selectedTags) {
      newDrafts[tagId] = {
        min: preset.tempMin ?? preset.humMin ?? preset.pressureMin ?? '',
        max: preset.tempMax ?? preset.humMax ?? preset.pressureMax ?? '',
        cooldown: preset.alarmCooldownMinutes ?? 0,
      };
    }
    setTagDrafts(newDrafts);
    toast.success(`已应用模板到 ${selectedTags.size} 个变量（请逐个保存或使用批量保存）`);
  };

  const resetSelectedToInherit = async () => {
    const batch: TagAlarmOverridePatch[] = [];
    for (const tagId of selectedTags) {
      batch.push({ tagId, alarmOverrideMin: null, alarmOverrideMax: null, alarmCooldownMinutes: null });
    }
    try {
      await batchSetTagAlarmOverrides(batch);
      toast.success(`已重置 ${selectedTags.size} 个变量为继承`);
      setSelectedTags(new Set());
      setTagDrafts(prev => {
        const next = { ...prev };
        for (const tagId of selectedTags) delete next[tagId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['telemetry-alarm-config-tree'] });
    } catch (e: any) { toast.error(e?.message || '重置失败'); }
  };

  const toggleFloor = (fc: string) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(fc)) next.delete(fc); else next.add(fc);
      return next;
    });
  };

  const toggleSuite = (key: string) => {
    setExpandedSuites((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSaveFloor = async (fc: string, enabled: boolean) => {
    const d = floorDrafts[fc];
    if (!d) return;
    const floor = treeQ.data?.floors.find((f) => f.floorCode === fc);
    setSavingFloor(fc);
    try {
      await saveFloorConfig({ id: floor?.configId ?? undefined, floorCode: fc, enabled, cooldownMinutes: d.resetMin, notifyOnRecovery: d.notifyRecovery, bufferFlushMinutes: d.bufferFlush });
      toast.success(`${fc} 已保存`);
      queryClient.invalidateQueries({ queryKey: ["telemetry-alarm-config-tree"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSavingFloor(null); }
  };

  const handleToggleTag = async (tagId: number, currentEnabled: boolean | null) => {
    setTogglingTag(tagId);
    const next = currentEnabled === false ? null : false; // cycle: false→null(inherit), null/true→false
    try {
      await setTagAlarmEnabled(tagId, next);
      queryClient.invalidateQueries({ queryKey: ["telemetry-alarm-config-tree"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "切换失败"); }
    finally { setTogglingTag(null); }
  };

  if (treeQ.isLoading) return <AdminFormCard><p className="text-xs text-[var(--app-color-text-tertiary)] py-4">加载楼层套间数据…</p></AdminFormCard>;
  if (treeQ.isError) return <AdminFormCard><p className="text-xs text-[var(--app-color-feedback-error)] py-2">加载失败：{(treeQ.error as Error)?.message}</p></AdminFormCard>;

  const tree = treeQ.data;
  if (!tree || tree.floors.length === 0) {
    return (
      <AdminFormCard>
        <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)] flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4 text-[var(--app-color-accent)]" />楼层与套间管控
        </h3>
        <div className="rounded-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3 py-4 text-center text-xs text-[var(--app-color-text-tertiary)]">
          <p>尚未导入 WinCC 变量清单，或清单中无可监控的变量。</p>
        </div>
      </AdminFormCard>
    );
  }

  const metricKindBadge = (code: string, label?: string | null) => {
    const c = code.toUpperCase();
    const colors: Record<string, string> = { TEMP: "bg-orange-100 text-orange-700", HUM: "bg-blue-100 text-blue-700", RH: "bg-blue-100 text-blue-700", PRESSURE: "bg-emerald-100 text-emerald-700" };
    const names: Record<string, string> = { TEMP: "温", HUM: "湿", PRESSURE: "压" };
    return (
      <span className={cn("inline-flex items-center rounded px-1 py-0 text-[10px] font-medium shrink-0", colors[c] ?? "bg-zinc-100 text-zinc-600")}>
        {names[c] ?? (label ?? c)}
      </span>
    );
  };

  return (
    <>
      <AdminFormCard>
        <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)] flex items-center gap-2 mb-3">
          <Building2 className="h-4 w-4 text-[var(--app-color-accent)]" />
          楼层与套间管控
          <span className="text-[11px] font-normal text-[var(--app-color-text-tertiary)]">
            （{tree.totalFloors} 层 · {tree.totalSuites} 套间 · {tree.totalRooms} 房间 · {tree.totalVariables} 变量）
          </span>
        </h3>

        <div className="space-y-2">
          {tree.floors.map((floor) => {
            const fexp = expandedFloors.has(floor.floorCode);
            const draft = floorDrafts[floor.floorCode] ?? { resetMin: floor.cooldownMinutes, notifyRecovery: floor.notifyOnRecovery };
            const isSaving = savingFloor === floor.floorCode;

            return (
              <div key={floor.floorCode} className={cn("rounded-lg border transition-all",
                fexp ? "border-[var(--app-color-accent)]/40 bg-[var(--app-color-surface-elevated)] ring-1 ring-[var(--app-color-accent)]/15"
                      : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]")}>
                {/* Floor header */}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <button type="button" onClick={() => toggleFloor(floor.floorCode)}
                    className="flex items-center gap-2 min-w-0 text-left hover:opacity-80">
                    <Building2 className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
                    <span className="text-sm font-semibold">{floor.floorCode}</span>
                    <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{floor.suiteCount}套间 · {floor.variableCount}变量</span>
                    {fexp ? <ChevronUp className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" /> : <ChevronDown className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {fexp && (<>
                      <label className="text-[11px] text-[var(--app-color-text-secondary)]">重置<input type="number" min={5} max={1440}
                        className="w-[3.5rem] ml-1 rounded border border-[var(--app-color-border-default)] px-1 py-0.5 text-xs font-mono text-center"
                        value={draft.resetMin} onChange={(e) => setFloorDrafts((p) => ({ ...p, [floor.floorCode]: { ...draft, resetMin: Math.max(5, Number(e.target.value) || 60) } }))} />min</label>
                      <label className="text-[11px] text-[var(--app-color-text-secondary)]">缓冲<input type="number" min={1} max={60}
                        className="w-[3.5rem] ml-1 rounded border border-[var(--app-color-border-default)] px-1 py-0.5 text-xs font-mono text-center"
                        value={draft.bufferFlush}
                        onChange={(e) => setFloorDrafts((p) => ({ ...p, [floor.floorCode]: { ...draft, bufferFlush: Math.max(1, Number(e.target.value) || 5) } }))} />min</label>
                      <label className="inline-flex items-center gap-1 text-[11px] text-[var(--app-color-text-secondary)] cursor-pointer select-none">
                        <input type="checkbox" className="h-3 w-3 rounded accent-[var(--app-color-accent)]" checked={draft.notifyRecovery}
                          onChange={(e) => setFloorDrafts((p) => ({ ...p, [floor.floorCode]: { ...draft, notifyRecovery: e.target.checked } }))} />恢复通知</label>
                    </>)}
                    <AdminSwitchScaled size="sm" checked={floor.enabled} onChange={() => handleSaveFloor(floor.floorCode, !floor.enabled)} />
                    {fexp && <AdminButton type="button" tone="primary" size="sm" loading={isSaving} onClick={() => handleSaveFloor(floor.floorCode, floor.enabled)}><Save className="h-3.5 w-3.5" />保存</AdminButton>}
                  </div>
                </div>

                {/* Suites (expanded) */}
                {fexp && (
                  <div className="border-t border-[var(--app-color-border-default)] px-3 py-2 space-y-1.5">
                    {floor.suites.length === 0 ? (
                      <p className="text-[11px] text-[var(--app-color-text-tertiary)] py-2 text-center">此楼层暂无套间</p>
                    ) : floor.suites.map((suite) => {
                      const seKey = `${floor.floorCode}/${suite.suiteNorm}`;
                      const sexp = expandedSuites.has(seKey);
                      const alarmVars = suite.rooms.flatMap(r => r.tags).filter(t => t.isAlarmMetric);
                      const refVars = suite.rooms.flatMap(r => r.tags).filter(t => !t.isAlarmMetric);
                      return (
                        <div key={suite.suiteNorm} className="rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
                          <div className="flex items-center gap-3 px-2.5 py-1.5">
                            <button type="button" onClick={() => toggleSuite(seKey)}
                              className="flex items-center gap-1.5 min-w-0 text-left hover:opacity-80">
                              <span className="text-xs font-medium">{suite.suiteNorm}</span>
                              <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{suite.roomCount}间 · {suite.variableCount}变量</span>
                              {alarmVars.length > 0 && <span className="text-[10px] text-[var(--app-color-text-tertiary)]">({alarmVars.length}报警{refVars.length > 0 ? `+${refVars.length}参考` : ""})</span>}
                              {sexp ? <ChevronUp className="h-3 w-3 text-[var(--app-color-text-tertiary)]" /> : <ChevronDown className="h-3 w-3 text-[var(--app-color-text-tertiary)]" />}
                            </button>
                            {suite.hasCustomThresholds && <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--app-color-accent)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-color-accent)]"><SlidersHorizontal className="h-3 w-3" />自定义</span>}
                            <div className="flex-1" />
                            <button type="button" className="inline-flex items-center gap-1 rounded-md border border-[var(--app-color-border-default)] px-2 py-1 text-[11px] font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                              onClick={() => setEditingSuite({ ...suite })}><SlidersHorizontal className="h-3 w-3" />阈值</button>
                            <AdminSwitchScaled size="sm" checked={suite.enabled !== false}
                              onChange={async () => {
                                const next = suite.enabled === false ? null : false;
                                try {
                                  await saveSuiteConfig({ id: suite.configId ?? undefined, floorCode: suite.floorCode, suiteNorm: suite.suiteNorm, enabled: next, tempMin: suite.tempMin, tempMax: suite.tempMax, humMin: suite.humMin, humMax: suite.humMax, pressureMin: suite.pressureMin, pressureMax: suite.pressureMax });
                                  queryClient.invalidateQueries({ queryKey: ["telemetry-alarm-config-tree"] });
                                } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "切换失败"); }
                              }} />
                          </div>

                          {/* Rooms (expanded under suite) */}
                          {sexp && (
                            <div className="border-t border-[var(--app-color-border-default)] px-2.5 py-1.5 space-y-1">
                              {/* Batch operations bar */}
                              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--app-color-border-default)]/60 bg-[var(--app-color-surface-elevated)]/30 rounded-t">
                                <label className="inline-flex items-center gap-1 text-[10px] text-[var(--app-color-text-secondary)] cursor-pointer select-none">
                                  <input type="checkbox" className="h-3 w-3 rounded accent-[var(--app-color-accent)]"
                                    checked={allAlarmTagsInSuite(suite).length > 0 && allAlarmTagsInSuite(suite).every(t => selectedTags.has(t.tagId))}
                                    onChange={(e) => toggleSelectAll(e.target.checked, suite)}
                                  />
                                  全选报警变量
                                </label>
                                <select className="rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1.5 py-0.5 text-[10px] text-[var(--app-color-text-primary)]"
                                  value={activePresetId ?? ''}
                                  onChange={(e) => setActivePresetId(e.target.value ? Number(e.target.value) : null)}>
                                  <option value="">阈值模板...</option>
                                  {(presets ?? []).map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                                <AdminButton type="button" tone="secondary" size="sm"
                                  disabled={selectedTags.size === 0}
                                  onClick={applyPresetToSelected}>
                                  应用模板到选中 ({selectedTags.size})
                                </AdminButton>
                                <AdminButton type="button" tone="ghost" size="sm"
                                  disabled={selectedTags.size === 0}
                                  onClick={resetSelectedToInherit}>
                                  重置为继承
                                </AdminButton>
                              </div>
                              {suite.rooms.map((room) => (
                                <div key={room.roomCanonical} className="rounded border border-[var(--app-color-border-default)]/60 bg-[var(--app-color-surface-elevated)]/50 px-2 py-1">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[11px] font-medium text-[var(--app-color-text-primary)]">{room.roomDisplay}</span>
                                    <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{room.variableCount}变量</span>
                                    {room.hasAlarmMetrics && <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--app-color-feedback-error)]" title="含报警指标" />}
                                  </div>
                                  <div className="space-y-0.5">
                                    {room.tags.map((tag) => {
                                      const isRef = !tag.isAlarmMetric;
                                      const alarmOn = tag.alarmEnabled;
                                      const isToggling = togglingTag === tag.tagId;
                                      const statusColors: Record<string, string> = { SETPOINT: "bg-purple-100 text-purple-700", SWITCH: "bg-amber-100 text-amber-700" };
                                      return (
                                        <div key={tag.tagId ?? tag.variableName} className={cn("flex items-center gap-1.5 text-[10px] py-0.5", isRef && "opacity-70")}>
                                          {metricKindBadge(tag.metricKindCode, tag.metricKindLabel)}
                                          {tag.kindRole === "SETPOINT" && <span className={cn("rounded px-1 py-0 text-[9px] font-medium", statusColors.SETPOINT)}>设定值</span>}
                                          {tag.kindRole === "SWITCH" && <span className={cn("rounded px-1 py-0 text-[9px] font-medium", statusColors.SWITCH)}>开关</span>}
                                          <span className="font-medium text-[var(--app-color-text-primary)] truncate max-w-[200px]" title={tag.variableName}>{tag.displayLabel}</span>
                                          {isRef && <span className="text-[var(--app-color-text-tertiary)] italic">参考</span>}
                                          {!isRef && tag.effectiveMinValue && tag.effectiveMaxValue && (
                                            <span className="text-[var(--app-color-text-tertiary)] ml-auto">{tag.effectiveMinValue}~{tag.effectiveMaxValue}</span>
                                          )}
                                          {tag.alarmOverrideMin || tag.alarmOverrideMax ? <span className="text-[var(--app-color-accent)] ml-auto text-[9px]">已覆盖</span> : null}
                                          {tag.isAlarmMetric && (
                                            <div className="flex items-center gap-1 ml-auto">
                                              <input type="checkbox"
                                                className="h-3 w-3 rounded accent-[var(--app-color-accent)] shrink-0"
                                                checked={selectedTags.has(tag.tagId)}
                                                onChange={(e) => {
                                                  setSelectedTags(prev => {
                                                    const next = new Set(prev);
                                                    e.target.checked ? next.add(tag.tagId) : next.delete(tag.tagId);
                                                    return next;
                                                  });
                                                }}
                                                title="选择此变量" />
                                              <input
                                                className="w-[4rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1 py-0 text-[10px] font-mono text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none"
                                                placeholder={tag.effectiveMinValue ?? "min"}
                                                value={tagDrafts[tag.tagId]?.min ?? ''}
                                                onChange={(e) => updateTagDraft(tag.tagId, { min: e.target.value })} />
                                              <span className="text-[10px] text-[var(--app-color-text-tertiary)]">~</span>
                                              <input
                                                className="w-[4rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1 py-0 text-[10px] font-mono text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none"
                                                placeholder={tag.effectiveMaxValue ?? "max"}
                                                value={tagDrafts[tag.tagId]?.max ?? ''}
                                                onChange={(e) => updateTagDraft(tag.tagId, { max: e.target.value })} />
                                              <input
                                                className="w-[3rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1 py-0 text-[10px] font-mono text-[var(--app-color-text-primary)]"
                                                placeholder="冷却"
                                                value={tagDrafts[tag.tagId]?.cooldown || ''}
                                                onChange={(e) => updateTagDraft(tag.tagId, { cooldown: Number(e.target.value) || 0 })}
                                                title="重报警冷却(分钟)" />
                                              <AdminButton type="button" tone="primary" size="sm"
                                                loading={savingTags.has(tag.tagId)}
                                                onClick={() => saveTagOverride(tag.tagId)}>
                                                <Save className="h-3 w-3" />
                                              </AdminButton>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Preset management */}
        <div className="border-t border-[var(--app-color-border-default)] pt-3 mt-3">
          <button type="button" onClick={() => setPresetsExpanded(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-[var(--app-color-text-primary)] hover:opacity-80 w-full text-left">
            <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--app-color-accent)]" />
            阈值预设模板 ({presets.length})
            {presetsExpanded ? <ChevronUp className="h-3.5 w-3.5 ml-auto text-[var(--app-color-text-tertiary)]" />
                              : <ChevronDown className="h-3.5 w-3.5 ml-auto text-[var(--app-color-text-tertiary)]" />}
          </button>
          {presetsExpanded && (
            <div className="mt-2 space-y-1.5">
              {presets.map(p => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5">
                  <span className="text-xs font-medium min-w-[80px] text-[var(--app-color-text-primary)]">{p.name}</span>
                  <span className="text-[10px] text-[var(--app-color-text-tertiary)]">
                    温{p.tempMin ?? '-'}~{p.tempMax ?? '-'}℃ 湿{p.humMin ?? '-'}~{p.humMax ?? '-'}% 冷{p.alarmCooldownMinutes ?? 0}min
                  </span>
                  <div className="flex-1" />
                  <AdminButton type="button" tone="ghost" size="sm" onClick={() => setPresetEditor(p)}>编辑</AdminButton>
                  <AdminButton type="button" tone="ghost" size="sm" onClick={async () => {
                    if (!p.id || !confirm(`删除模板「${p.name}」？`)) return;
                    try {
                      await deleteAlarmPreset(p.id);
                      setPresets(prev => prev.filter(x => x.id !== p.id));
                      toast.success('已删除');
                    } catch (e: any) { toast.error(e?.message || '删除失败'); }
                  }}>删除</AdminButton>
                </div>
              ))}
              <AdminButton type="button" tone="secondary" size="sm" onClick={() => setPresetEditor(null)}>
                + 新建模板
              </AdminButton>
            </div>
          )}
        </div>
      </AdminFormCard>

      {editingSuite && (
        <SuiteThresholdModal suite={editingSuite} saving={savingSuite} onChange={setEditingSuite}
          onSave={async () => {
            if (!editingSuite) return;
            setSavingSuite(true);
            try {
              await saveSuiteConfig({
                id: editingSuite.configId ?? undefined, floorCode: editingSuite.floorCode, suiteNorm: editingSuite.suiteNorm,
                enabled: editingSuite.enabled, tempMin: editingSuite.tempMin, tempMax: editingSuite.tempMax,
                humMin: editingSuite.humMin, humMax: editingSuite.humMax, pressureMin: editingSuite.pressureMin, pressureMax: editingSuite.pressureMax,
                hysteresisTemp: editingSuite.hysteresisTemp, hysteresisHum: editingSuite.hysteresisHum, hysteresisPressure: editingSuite.hysteresisPressure,
              });
              toast.success(`${editingSuite.suiteNorm} 已保存`);
              setEditingSuite(null);
              queryClient.invalidateQueries({ queryKey: ["telemetry-alarm-config-tree"] });
            } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "保存失败"); }
            finally { setSavingSuite(false); }
          }}
          onClose={() => setEditingSuite(null)} />
      )}

      {presetEditor !== undefined && (
        <PresetEditorModal preset={presetEditor} onClose={() => setPresetEditor(undefined)}
          onSaved={() => {
            setPresetEditor(undefined);
            fetchAlarmPresets().then(setPresets).catch(() => {});
          }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  SuiteThresholdModal — 套间阈值编辑弹窗（含房间变量预览）              */
/* ------------------------------------------------------------------ */

function SuiteThresholdModal({ suite, saving, onChange, onSave, onClose }: {
  suite: SuiteNode; saving: boolean; onChange: (s: SuiteNode) => void; onSave: () => void; onClose: () => void;
}) {
  const metrics: Array<{ key: string; label: string; icon: React.ReactNode; unit: string; minKey: keyof SuiteNode; maxKey: keyof SuiteNode }> = [
    { key: "temp", label: "温度", icon: <Thermometer className="h-3.5 w-3.5 text-orange-500" />, unit: "℃", minKey: "tempMin", maxKey: "tempMax" },
    { key: "hum", label: "湿度", icon: <Droplets className="h-3.5 w-3.5 text-blue-500" />, unit: "%", minKey: "humMin", maxKey: "humMax" },
    { key: "pressure", label: "压强", icon: <Gauge className="h-3.5 w-3.5 text-emerald-500" />, unit: "Pa", minKey: "pressureMin", maxKey: "pressureMax" },
  ];

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-[var(--app-color-accent)]" />套间 · {suite.suiteNorm}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]"><X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" /></button>
        </div>
        <p className="text-[11px] text-[var(--app-color-text-tertiary)] mb-3">楼层：{suite.floorCode} · {suite.roomCount} 房间 · {suite.variableCount} 变量</p>

        {/* Suite enable */}
        <div className="flex items-center gap-3 mb-4 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3 py-2">
          <span className="text-xs font-medium">套间报警</span>
          <div className="flex-1" />
          <select className="rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs"
            value={suite.enabled === null ? "inherit" : suite.enabled ? "on" : "off"}
            onChange={(e) => onChange({ ...suite, enabled: e.target.value === "inherit" ? null : e.target.value === "on" })}>
            <option value="inherit">继承楼层</option>
            <option value="on">强制启用</option>
            <option value="off">强制禁用</option>
          </select>
        </div>

        {/* Thresholds */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold">自定义阈值</span><span className="text-[10px] text-[var(--app-color-text-tertiary)]">留空=继承全局</span></div>
          {metrics.map((m) => (
            <div key={m.key} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 w-[56px] shrink-0 text-[11px] font-medium text-[var(--app-color-text-secondary)]">{m.icon}{m.label}</span>
              <input type="text" inputMode="decimal" className="w-[5rem] rounded border border-[var(--app-color-border-default)] px-2 py-1 font-mono text-xs focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20" placeholder="下限"
                value={(suite[m.minKey] as string) ?? ""} onChange={(e) => onChange({ ...suite, [m.minKey]: e.target.value || null })} />
              <span className="text-[11px] text-[var(--app-color-text-tertiary)]">~</span>
              <input type="text" inputMode="decimal" className="w-[5rem] rounded border border-[var(--app-color-border-default)] px-2 py-1 font-mono text-xs focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20" placeholder="上限"
                value={(suite[m.maxKey] as string) ?? ""} onChange={(e) => onChange({ ...suite, [m.maxKey]: e.target.value || null })} />
              <span className="text-[10px] text-[var(--app-color-text-tertiary)] w-[1.25rem] text-right">{m.unit}</span>
            </div>
          ))}
        </div>

        {/* Hysteresis section */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">死区设置</span>
            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">防止阈值边界振荡</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 w-[56px] shrink-0 text-[11px] font-medium text-[var(--app-color-text-secondary)]">
              <Thermometer className="h-3.5 w-3.5 text-orange-400" />温度
            </span>
            <input type="text" inputMode="decimal"
              className="w-[5rem] rounded border border-[var(--app-color-border-default)] px-2 py-1 font-mono text-xs focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
              placeholder="0.3"
              value={(suite.hysteresisTemp as string) ?? ""}
              onChange={(e) => onChange({ ...suite, hysteresisTemp: e.target.value || null })} />
            <span className="text-[10px] text-[var(--app-color-text-tertiary)] w-[1.25rem] text-right">℃</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 w-[56px] shrink-0 text-[11px] font-medium text-[var(--app-color-text-secondary)]">
              <Droplets className="h-3.5 w-3.5 text-blue-400" />湿度
            </span>
            <input type="text" inputMode="decimal"
              className="w-[5rem] rounded border border-[var(--app-color-border-default)] px-2 py-1 font-mono text-xs focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
              placeholder="2.0"
              value={(suite.hysteresisHum as string) ?? ""}
              onChange={(e) => onChange({ ...suite, hysteresisHum: e.target.value || null })} />
            <span className="text-[10px] text-[var(--app-color-text-tertiary)] w-[1.25rem] text-right">%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 w-[56px] shrink-0 text-[11px] font-medium text-[var(--app-color-text-secondary)]">
              <Gauge className="h-3.5 w-3.5 text-emerald-400" />压差
            </span>
            <input type="text" inputMode="decimal"
              className="w-[5rem] rounded border border-[var(--app-color-border-default)] px-2 py-1 font-mono text-xs focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
              placeholder="5.0"
              value={(suite.hysteresisPressure as string) ?? ""}
              onChange={(e) => onChange({ ...suite, hysteresisPressure: e.target.value || null })} />
            <span className="text-[10px] text-[var(--app-color-text-tertiary)] w-[1.25rem] text-right">Pa</span>
          </div>
        </div>

        {/* Room/variable preview */}
        <div className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3 py-2 max-h-[240px] overflow-auto">
          <p className="text-[10px] font-semibold text-[var(--app-color-text-secondary)] mb-1.5">本套间房间与变量</p>
          {suite.rooms.map((room) => (
            <div key={room.roomCanonical} className="mb-1 last:mb-0">
              <p className="text-[10px] font-medium text-[var(--app-color-text-primary)]">{room.roomDisplay} <span className="font-normal text-[var(--app-color-text-tertiary)]">({room.variableCount}变量)</span></p>
              <div className="ml-2 space-y-0.5">
                {room.tags.map((tag) => (
                  <div key={tag.tagId ?? tag.variableName} className="flex items-center gap-1.5 text-[10px]">
                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0",
                      tag.metricKindCode === "TEMP" ? "bg-orange-500" : tag.metricKindCode === "HUM" ? "bg-blue-500" : tag.metricKindCode === "PRESSURE" ? "bg-emerald-500" : "bg-purple-400")} />
                    <span className="font-medium truncate max-w-[160px]" title={tag.variableName}>{tag.displayLabel}</span>
                    {!tag.isAlarmMetric && <span className="text-[var(--app-color-text-tertiary)] italic text-[9px]">{tag.kindRole === "SETPOINT" ? "设定值" : tag.kindRole}</span>}
                    {tag.isAlarmMetric && tag.effectiveMinValue && <span className="text-[var(--app-color-text-tertiary)] ml-auto">{tag.effectiveMinValue}~{tag.effectiveMaxValue}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-color-border-default)] pt-3 mt-3">
          <AdminButton type="button" tone="ghost" size="sm" onClick={onClose}>取消</AdminButton>
          <AdminButton type="button" tone="primary" size="sm" loading={saving} onClick={onSave}><Save className="h-3.5 w-3.5" />保存套间配置</AdminButton>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PresetEditorModal — 阈值预设模板编辑弹窗                              */
/* ------------------------------------------------------------------ */

function PresetEditorModal({ preset, onClose, onSaved }: {
  preset: AlarmPreset | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AlarmPreset>(preset ?? {
    name: '', description: '', isGlobal: 1,
    tempMin: null, tempMax: null, humMin: null, humMax: null, pressureMin: null, pressureMax: null,
    hysteresisTemp: null, hysteresisHum: null, hysteresisPressure: null,
    alarmCooldownMinutes: 0,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name?.trim()) { toast.error('请输入模板名称'); return; }
    setSaving(true);
    try {
      if (form.id) {
        await updateAlarmPreset(form.id, form);
      } else {
        await createAlarmPreset(form);
      }
      toast.success('已保存');
      onSaved();
    } catch (e: any) { toast.error(e?.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/20";

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] overflow-auto rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">{form.id ? '编辑模板' : '新建模板'}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]"><X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={adminLabelClass}>名称</label>
            <input className={cn(inputCls, "mt-1")} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="如：标准鼠房" />
          </div>
          <div>
            <label className={adminLabelClass}>描述</label>
            <input className={cn(inputCls, "mt-1")} value={form.description ?? ''} onChange={e => setForm({...form, description: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={adminLabelClass}>温度下限</label><input className={cn(inputCls, "mt-1")} placeholder="20.0" value={form.tempMin ?? ''} onChange={e => setForm({...form, tempMin: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>温度上限</label><input className={cn(inputCls, "mt-1")} placeholder="26.0" value={form.tempMax ?? ''} onChange={e => setForm({...form, tempMax: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>湿度下限</label><input className={cn(inputCls, "mt-1")} placeholder="40.0" value={form.humMin ?? ''} onChange={e => setForm({...form, humMin: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>湿度上限</label><input className={cn(inputCls, "mt-1")} placeholder="70.0" value={form.humMax ?? ''} onChange={e => setForm({...form, humMax: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>温度死区</label><input className={cn(inputCls, "mt-1")} placeholder="0.3" value={form.hysteresisTemp ?? ''} onChange={e => setForm({...form, hysteresisTemp: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>湿度死区</label><input className={cn(inputCls, "mt-1")} placeholder="2.0" value={form.hysteresisHum ?? ''} onChange={e => setForm({...form, hysteresisHum: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>冷却(分钟)</label><input className={cn(inputCls, "mt-1")} placeholder="10" type="number" value={form.alarmCooldownMinutes ?? 0} onChange={e => setForm({...form, alarmCooldownMinutes: Number(e.target.value) || 0})} /></div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <AdminButton type="button" tone="ghost" size="sm" onClick={onClose}>取消</AdminButton>
            <AdminButton type="button" tone="primary" size="sm" loading={saving} onClick={save}><Save className="h-3.5 w-3.5" />保存</AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SwipeAlarmTab — 刷卡失败报警配置                                     */
/* ------------------------------------------------------------------ */

function SwipeAlarmTab({ sourceEnabled }: { sourceEnabled?: boolean }) {
  const [editingSwipeRule, setEditingSwipeRule] = useState<SwipeAlertRuleRow | null | undefined>(undefined);
  const [swipeRefreshKey, setSwipeRefreshKey] = useState(0);

  return (
    <div className="space-y-3">
      {sourceEnabled === false && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ SWIPE_FAILURE_ALERT 信息源已关闭。规则即使配置了站外推送也不会生效，请在「信息源配置」Tab 中启用该源。
        </div>
      )}
      <SwipeAlertRuleList
        onEdit={setEditingSwipeRule}
        onAdd={() => setEditingSwipeRule(null)}
        onClose={() => setEditingSwipeRule(undefined)}
        formOpen={editingSwipeRule !== undefined}
        refreshKey={swipeRefreshKey}
      />
      {editingSwipeRule !== undefined && (
        <SwipeAlertRuleForm
          editing={editingSwipeRule}
          onSaved={() => {
            setEditingSwipeRule(undefined);
            setSwipeRefreshKey(k => k + 1);
          }}
          onCancel={() => setEditingSwipeRule(undefined)}
        />
      )}
    </div>
  );
}
