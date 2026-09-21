import { useMemo, useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
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
  type TagNode,
  type RoomNode,
  type TagAlarmOverridePatch,
  type AlarmPreset,
} from "@/api/domains/telemetryAlarmConfig.api";
import { fetchWinccTelemetrySnapshot, type TelemetryTagItem } from "@/api/telemetryApi";
import { SwipeAlertRuleList } from "@/features/swipe-alert/SwipeAlertRuleList";
import { SwipeAlertRuleForm } from "@/features/swipe-alert/SwipeAlertRuleForm";
import type { SwipeAlertRuleRow } from "@/api/domains/swipeAlert.api";
import {
  listDoorTempUnlockRules,
  createDoorTempUnlockRule,
  updateDoorTempUnlockRule,
  deleteDoorTempUnlockRule,
  toggleDoorTempUnlockRule,
  type DoorTempUnlockRuleRow,
} from "@/api/domains/doorTempUnlock.api";
import { fetchDoorControlChannels } from "@/api/twinApi";
import { DahuaChannelListPicker } from "@/components/admin/DahuaChannelListPicker";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Gauge,
  Pencil,
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
  Trash2,
  X,
  Check,
  UserPlus,
  Send,
  Smartphone,
  SlidersHorizontal,
  Thermometer,
} from "lucide-react";

import { appConfirm } from "@/lib/appDialog";
import { mergeChannelDrafts, toChannelDraft, type ChannelDraft } from "./pushConfigDrafts";
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
  const [pushTab, setPushTab] = useState<"sources" | "animal-alarm" | "swipe-alarm" | "door-unlock">("sources");

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
  // 渠道草稿「只补不覆盖」：保存/刷新都会重新拉列表，整体重建会把用户刚拨动、
  // 还没保存的开关和模板一起打回服务端默认值（详见 pushConfigDrafts.ts）。
  const initDrafts = useCallback((list: NotifySourceConfig[]) => {
    const rd: Record<number, RecipientDraft[]> = {};
    for (const s of list) {
      rd[s.sourceId] = (s.recipients ?? []).map(toRecipientDraft);
    }
    setRecipientDrafts(rd);
    setChannelDrafts((prev) => mergeChannelDrafts(prev, list));
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
            { id: "door-unlock", label: "门禁临时解锁" },
          ]}
          value={pushTab}
          onChange={(id) => setPushTab(id as "sources" | "animal-alarm" | "swipe-alarm" | "door-unlock")}
          className="shrink-0 mb-0"
        />

        {/* ================================================================ */}
        {/*  Tab panels — scrollable content area                             */}
        {/* ================================================================ */}
        <div className="flex-1 min-h-0 flex flex-col rounded-b-xl border border-t-0 border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] overflow-hidden">
          <div className="flex flex-1 min-h-0 flex-col">
            <AdminTabPanel tabId="sources" activeTab={pushTab} id="admin-tab-panel-sources" className="min-h-0 flex-1 overflow-auto">
              <div className="space-y-3 p-3">
                {isSourcesLoading ? (
              <div
                role="status"
                aria-busy="true"
                className="flex min-h-[200px] items-center justify-center rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]"
              >
                加载中…
              </div>
            ) : sourcesError ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-[color-mix(in_srgb,var(--app-color-feedback-error)_30%,transparent)] bg-[var(--app-color-feedback-danger-soft)] p-6 text-center text-sm text-[var(--app-color-feedback-error)]">
                <p>{(sourcesError as Error)?.message ?? "加载失败"}</p>
                <button
                  type="button"
                  onClick={() => refetchSources()}
                  className="rounded-lg border border-[color-mix(in_srgb,var(--app-color-feedback-error)_40%,transparent)] bg-[var(--app-color-surface-container)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-feedback-error)] hover:bg-[var(--app-color-surface-hover)]"
                >
                  重试
                </button>
              </div>
            ) : (sources ?? []).length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-sm text-[var(--app-color-text-tertiary)]">
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
                    className={cn("transition-all", expanded && "ring-1 ring-[color-mix(in_srgb,var(--app-color-accent)_30%,transparent)]")}
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
                                    ? "border-[color-mix(in_srgb,var(--app-color-feedback-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--app-color-feedback-success)_10%,transparent)] text-[var(--app-color-feedback-success)]"
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

            <AdminTabPanel tabId="animal-alarm" activeTab={pushTab} id="admin-tab-panel-animal-alarm" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <AnimalRoomAlarmTab />
              </div>
            </AdminTabPanel>

            <AdminTabPanel tabId="swipe-alarm" activeTab={pushTab} id="admin-tab-panel-swipe-alarm" className="min-h-0 flex-1 overflow-auto">
              <div className="p-3">
                <SwipeAlarmTab sourceEnabled={sources?.find(s => s.sourceCode === "SWIPE_FAILURE_ALERT")?.sourceEnabled} />
              </div>
            </AdminTabPanel>

            <AdminTabPanel tabId="door-unlock" activeTab={pushTab} id="admin-tab-panel-door-unlock" className="min-h-0 flex-1 overflow-auto">
              <div className="p-3">
                <DoorUnlockTab />
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
      <div className="w-full max-w-sm rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
              <span key={testIds[i]} className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--app-color-accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--app-color-accent)_25%,transparent)] px-2 py-1 text-xs font-medium text-[var(--app-color-accent)] max-w-[180px]">
                <span className="truncate">{name}</span>
                <button type="button" onClick={() => {
                  setTestIds(prev => prev.filter((_, j) => j !== i));
                  setTestNames(prev => prev.filter((_, j) => j !== i));
                }} className="rounded-sm p-0.5 hover:bg-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)] transition-colors shrink-0">
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
          const hasTemplate = ch && (ch.titleTpl || ch.contentTpl);
          const noTemplateHint = !ch ? "渠道未创建，请点击按钮进入配置" : !hasTemplate ? "无模板，请先配置模板内容" : undefined;
          return (
            <div key={def.code} className="inline-flex items-center gap-0.5">
              <AdminButton type="button" tone={enabled ? "secondary" : "ghost"} size="sm"
                onClick={() => setOpenChannel(def.code)}>
                {def.icon}
                {def.name}
                {!hasTemplate && <span className="ml-0.5 text-[10px] text-[var(--app-color-feedback-warning)]" title={noTemplateHint}>⚠</span>}
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
          draft = toChannelDraft(ch);
        }
        const saveKey = `${source.sourceId}:${ch.channelCode}`;
        const isSaving = savingChannels.has(saveKey);

        return (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={() => setOpenChannel(null)}>
            <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
                <div className="rounded-lg border border-dashed border-[color-mix(in_srgb,var(--app-color-accent)_30%,transparent)] bg-[var(--app-color-accent-soft)] p-2 mb-3">
                  <p className="text-[11px] font-medium text-[var(--app-color-text-primary)] mb-1 flex items-center gap-1">
                    <Variable className="h-3 w-3 text-[var(--app-color-accent)]" /> 可用变量
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(source.variables ?? {}).map(([k, v]) => (
                      <code key={k} className="inline-block rounded bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--app-color-accent)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--app-color-accent)_10%,transparent)]"
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
  // draftIdx 必须是 drafts 里的原始下标（先带下标过滤），否则删第 2 个人会删错行
  const selectedPeople = useMemo(() => {
    return drafts
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.scopeType === "USER" && r.scopeValue)
      .map(({ r, idx }) => ({
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
          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--app-color-accent)_10%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--app-color-accent)]">
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
              className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--app-color-accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--app-color-accent)_25%,transparent)] px-2 py-1 text-xs font-medium text-[var(--app-color-accent)] max-w-[200px]"
              title={id}
            >
              <span className="truncate">{name}</span>
              <button
                type="button"
                onClick={() => removePerson(id, draftIdx)}
                className="rounded-sm p-0.5 hover:bg-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)] transition-colors shrink-0"
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

function AnimalRoomAlarmTab() {
  return <FloorSuiteAlarmPanel />;
}

/* ------------------------------------------------------------------ */
/*  GlobalLimitsModal — 全局环境报警限设置弹窗                           */
/* ------------------------------------------------------------------ */

function GlobalLimitsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [limitsDraft, setLimitsDraft] = useState<TelemetryGlobalAlarmLimits | null>(null);
  const [savingLimits, setSavingLimits] = useState(false);

  const limitsQ = useQuery({
    queryKey: ["telemetry-global-alarm-limits"],
    queryFn: getTelemetryGlobalAlarmLimits,
    staleTime: 30_000,
    enabled: open,
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
          className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]"
          placeholder="下限"
          value={limitsDraft[loKey] ?? ""}
          onChange={(e) => setLimitsDraft((p) => p ? { ...p, [loKey]: e.target.value } : null)}
        />
        <span className="text-[11px] text-[var(--app-color-text-tertiary)]">~</span>
        <input
          type="text"
          inputMode="decimal"
          className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]"
          placeholder="上限"
          value={limitsDraft[hiKey] ?? ""}
          onChange={(e) => setLimitsDraft((p) => p ? { ...p, [hiKey]: e.target.value } : null)}
        />
        <span className="text-[11px] text-[var(--app-color-text-tertiary)] w-[1.5rem] text-right">{unit}</span>
      </div>
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[var(--app-color-accent)]" />
            全局环境报警限
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]">
            <X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" />
          </button>
        </div>
        <p className="text-[11px] text-[var(--app-color-text-tertiary)] mb-2">
          各楼层套间无自定义阈值时使用此全局值；每个测点可逐点覆盖。所有输入框留空表示不限。
        </p>
        <p className="text-[11px] text-[var(--app-color-text-tertiary)] mb-3">
          死区（滞回）：报警与恢复之间留的缓冲，防止值在阈值附近抖动时反复报警。
        </p>
        {limitsQ.isLoading ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)] py-4">加载中…</p>
        ) : limitsQ.isError ? (
          <p className="text-xs text-[var(--app-color-feedback-error)] py-2">
            加载失败：{(limitsQ.error as Error)?.message ?? "未知错误"}
          </p>
        ) : (
          <div className="space-y-0.5">
            {limitRow(<Thermometer className="h-3.5 w-3.5 text-[var(--app-color-feedback-warning)]" />, "温度", "tempMin", "tempMax", "℃")}
            {limitRow(<Droplets className="h-3.5 w-3.5 text-[var(--app-color-feedback-info)]" />, "湿度", "humMin", "humMax", "%")}
            {limitRow(<Gauge className="h-3.5 w-3.5 text-[var(--app-color-feedback-success)]" />, "压强", "pressureMin", "pressureMax", "Pa")}
            {/* Hysteresis rows — single value per metric */}
            <div className="flex items-center gap-3 py-1.5">
              <span className="inline-flex items-center gap-1.5 w-[80px] shrink-0 text-xs font-medium text-[var(--app-color-text-secondary)]">
                <Thermometer className="h-3.5 w-3.5 text-[var(--app-color-feedback-warning)]" />温度死区
              </span>
              <input type="text" inputMode="decimal"
                className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]"
                placeholder="0.3"
                value={limitsDraft?.hysteresisTemp ?? ""}
                onChange={(e) => setLimitsDraft((p) => p ? { ...p, hysteresisTemp: e.target.value } : null)} />
              <span className="text-[11px] text-[var(--app-color-text-tertiary)] w-[1.5rem] text-right">℃</span>
            </div>
            <div className="flex items-center gap-3 py-1.5">
              <span className="inline-flex items-center gap-1.5 w-[80px] shrink-0 text-xs font-medium text-[var(--app-color-text-secondary)]">
                <Droplets className="h-3.5 w-3.5 text-[var(--app-color-feedback-info)]" />湿度死区
              </span>
              <input type="text" inputMode="decimal"
                className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]"
                placeholder="2.0"
                value={limitsDraft?.hysteresisHum ?? ""}
                onChange={(e) => setLimitsDraft((p) => p ? { ...p, hysteresisHum: e.target.value } : null)} />
              <span className="text-[11px] text-[var(--app-color-text-tertiary)] w-[1.5rem] text-right">%</span>
            </div>
            <div className="flex items-center gap-3 py-1.5">
              <span className="inline-flex items-center gap-1.5 w-[80px] shrink-0 text-xs font-medium text-[var(--app-color-text-secondary)]">
                <Gauge className="h-3.5 w-3.5 text-[var(--app-color-feedback-success)]" />压差死区
              </span>
              <input type="text" inputMode="decimal"
                className="w-[5.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]"
                placeholder="5.0"
                value={limitsDraft?.hysteresisPressure ?? ""}
                onChange={(e) => setLimitsDraft((p) => p ? { ...p, hysteresisPressure: e.target.value } : null)} />
              <span className="text-[11px] text-[var(--app-color-text-tertiary)] w-[1.5rem] text-right">Pa</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-color-border-default)] pt-3 mt-3">
          <AdminButton type="button" tone="primary" size="sm" loading={savingLimits} onClick={saveLimits}>
            <Save className="h-3.5 w-3.5" /> 保存
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

/** 布尔量不显示 true/false：开关量 → 开/关，状态量 → 是/否；非布尔返回 null。 */
const boolLabel = (raw: string | null | undefined, code: string | null | undefined): string | null => {
  if (raw == null) return null;
  const v = raw.trim().toLowerCase();
  if (v !== "true" && v !== "false") return null;
  const on = v === "true";
  return (code ?? "").toUpperCase() === "SWITCH" ? (on ? "开" : "关") : (on ? "是" : "否");
};

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

  const snapQ = useQuery({
    queryKey: ["telemetry-wincc-snapshot"],
    queryFn: () => fetchWinccTelemetrySnapshot({ sync: false }),
    staleTime: 30_000,
  });

  /* ---- selection & nav ---- */
  const [search, setSearch] = useState("");
  const [activeFloor, setActiveFloor] = useState<string | null>(null);
  const [activeSuiteKey, setActiveSuiteKey] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set());

  /* ---- tag override drafts & batch selection ---- */
  interface TagOverrideDraft { min: string; max: string; cooldown: string; }
  const [tagDrafts, setTagDrafts] = useState<Record<number, TagOverrideDraft>>({});
  const [savingTags, setSavingTags] = useState<Set<number>>(new Set());
  const [togglingTag, setTogglingTag] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set());

  /* ---- presets & suite editing ---- */
  const [presets, setPresets] = useState<AlarmPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  const [editingSuite, setEditingSuite] = useState<SuiteNode | null>(null);
  const [savingSuite, setSavingSuite] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [applyCooldown, setApplyCooldown] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);

  /* ---- floor config (retained, corrected copy) ---- */
  const [floorDrafts, setFloorDrafts] = useState<Record<string, { cooldown: number; notifyRecovery: boolean; bufferFlush: number }>>({});
  const [savingFloor, setSavingFloor] = useState<string | null>(null);

  useEffect(() => {
    if (!treeQ.data) return;
    const d: Record<string, { cooldown: number; notifyRecovery: boolean; bufferFlush: number }> = {};
    for (const f of treeQ.data.floors) {
      d[f.floorCode] = { cooldown: f.cooldownMinutes, notifyRecovery: f.notifyOnRecovery, bufferFlush: f.bufferFlushMinutes ?? 5 };
    }
    setFloorDrafts(prev => ({ ...d, ...prev }));
  }, [treeQ.data]);

  useEffect(() => { fetchAlarmPresets().then(setPresets).catch(() => {}); }, []);

  /* ---- current value lookup ---- */
  const valueByVar = useMemo(() => {
    const m = new Map<string, TelemetryTagItem>();
    for (const it of snapQ.data?.items ?? []) if (it.variableName) m.set(it.variableName, it);
    return m;
  }, [snapQ.data]);

  /* ---- 类型分流 ---- */
  const classify = (code?: string | null): "analog" | "switch" | "status" | "wind" | "reference" => {
    const c = (code ?? "").toUpperCase();
    if (c === "TEMP" || c === "HUM" || c === "RH" || c === "PRESSURE") return "analog";
    if (c === "SWITCH") return "switch";
    if (c === "STATUS") return "status";
    if (c === "WIND") return "wind";
    return "reference";
  };

  const kindBadge = (tag: TagNode) => {
    const c = (tag.metricKindCode ?? "").toUpperCase();
    const map: Record<string, { label: string; bg: string; fg: string }> = {
      TEMP: { label: "温", bg: "var(--app-color-feedback-warning)", fg: "#fff" },
      HUM: { label: "湿", bg: "var(--app-color-feedback-info)", fg: "#fff" },
      RH: { label: "湿", bg: "var(--app-color-feedback-info)", fg: "#fff" },
      PRESSURE: { label: "压", bg: "var(--app-color-feedback-success)", fg: "#fff" },
      SWITCH: { label: "开关", bg: "var(--app-color-feedback-warning)", fg: "#fff" },
      STATUS: { label: "状态", bg: "var(--app-color-feedback-info)", fg: "#fff" },
      WIND: { label: "风", bg: "var(--app-color-border-strong)", fg: "#fff" },
      SETPOINT: { label: "设定", bg: "var(--app-color-feedback-info)", fg: "#fff" },
    };
    const b = map[c] ?? { label: c || "参考", bg: "var(--app-color-surface-container)", fg: "var(--app-color-text-tertiary)" };
    return <span className="inline-flex items-center rounded px-1 py-0 text-[9px] font-medium shrink-0" style={{ background: b.bg, color: b.fg }}>{b.label}</span>;
  };

  /* ---- flattened rows ---- */
  type TagRow = { tag: TagNode; floor: FloorNode; suite: SuiteNode; room: RoomNode };
  const rows = useMemo<TagRow[]>(() => {
    if (!treeQ.data) return [];
    const q = search.trim().toLowerCase();
    const out: TagRow[] = [];
    for (const f of treeQ.data.floors) {
      if (activeFloor && f.floorCode !== activeFloor) continue;
      for (const s of f.suites) {
        const sk = `${f.floorCode}/${s.suiteNorm}`;
        if (activeSuiteKey && sk !== activeSuiteKey) continue;
        for (const r of s.rooms) {
          if (activeRoom && r.roomCanonical !== activeRoom) continue;
          for (const t of r.tags) {
            if (q && !`${t.displayLabel} ${t.variableName} ${r.roomDisplay} ${s.suiteNorm} ${f.floorCode}`.toLowerCase().includes(q)) continue;
            out.push({ tag: t, floor: f, suite: s, room: r });
          }
        }
      }
    }
    return out;
  }, [treeQ.data, activeFloor, activeSuiteKey, activeRoom, search]);

  const alarmRows = useMemo(() => rows.filter(r => r.tag.isAlarmMetric), [rows]);
  const allSelected = alarmRows.length > 0 && alarmRows.every(r => selectedTags.has(r.tag.tagId));

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

  /* ---- actions ---- */
  const updateTagDraft = (tagId: number, patch: Partial<TagOverrideDraft>) => {
    setTagDrafts(prev => ({ ...prev, [tagId]: { ...(prev[tagId] ?? { min: '', max: '', cooldown: '' }), ...patch } }));
  };

  const saveTagOverride = async (row: TagRow) => {
    const tag = row.tag;
    if (classify(tag.metricKindCode) !== "analog") return;
    const draft = tagDrafts[tag.tagId] ?? { min: '', max: '', cooldown: '' };
    const min = draft.min.trim() || null;
    const max = draft.max.trim() || null;
    const cooldown = draft.cooldown.trim() ? Number(draft.cooldown) : null;
    setSavingTags(prev => new Set(prev).add(tag.tagId));
    try {
      await setTagAlarmOverrides(tag.tagId, { tagId: tag.tagId, alarmOverrideMin: min, alarmOverrideMax: max, alarmCooldownMinutes: cooldown });
      toast.success('已保存');
      setTagDrafts(prev => { const n = { ...prev }; delete n[tag.tagId]; return n; });
      queryClient.invalidateQueries({ queryKey: ['telemetry-alarm-config-tree'] });
    } catch (e: any) { toast.error(e?.message || '保存失败'); }
    finally { setSavingTags(prev => { const n = new Set(prev); n.delete(tag.tagId); return n; }); }
  };

  const toggleSelectAll = () => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (allSelected) alarmRows.forEach(r => next.delete(r.tag.tagId));
      else alarmRows.forEach(r => next.add(r.tag.tagId));
      return next;
    });
  };

  const applyPresetToSelected = async () => {
    const preset = presets.find(p => p.id === activePresetId);
    if (!preset) { toast.error('请先选择阈值模板'); return; }
    if (selectedTags.size === 0) { toast.error('请先选择变量'); return; }
    const batch: TagAlarmOverridePatch[] = [];
    let applied = 0, skipped = 0;
    for (const row of rows) {
      if (!selectedTags.has(row.tag.tagId)) continue;
      if (classify(row.tag.metricKindCode) !== "analog") { skipped++; continue; }
      const c = (row.tag.metricKindCode ?? "").toUpperCase();
      let min: string | null = null, max: string | null = null;
      if (c === "TEMP") { min = preset.tempMin ?? null; max = preset.tempMax ?? null; }
      else if (c === "HUM" || c === "RH") { min = preset.humMin ?? null; max = preset.humMax ?? null; }
      else if (c === "PRESSURE") { min = preset.pressureMin ?? null; max = preset.pressureMax ?? null; }
      const item: TagAlarmOverridePatch = { tagId: row.tag.tagId, alarmOverrideMin: min, alarmOverrideMax: max };
      if (applyCooldown) item.alarmCooldownMinutes = preset.alarmCooldownMinutes ?? null;
      batch.push(item);
      applied++;
    }
    if (batch.length === 0) { toast.error('选中的变量中没有可设置阈值的模拟量'); return; }
    setBatchBusy(true);
    try {
      await batchSetTagAlarmOverrides(batch);
      toast.success(`已应用阈值到 ${applied} 个变量${skipped ? `，跳过 ${skipped} 个非模拟量` : ''}${applyCooldown ? `（含冷却 ${preset.alarmCooldownMinutes ?? 0} 分钟）` : '（未改动冷却）'}`);
      setSelectedTags(new Set());
      setTagDrafts({});
      queryClient.invalidateQueries({ queryKey: ['telemetry-alarm-config-tree'] });
    } catch (e: any) { toast.error(e?.message || '应用失败'); }
    finally { setBatchBusy(false); }
  };

  const batchSetAlarmSwitch = async (value: boolean | null) => {
    if (selectedTags.size === 0) { toast.error('请先选择变量'); return; }
    setBatchBusy(true);
    try {
      if (value === null) {
        for (const row of rows) if (selectedTags.has(row.tag.tagId)) await setTagAlarmEnabled(row.tag.tagId, null);
      } else {
        const batch: TagAlarmOverridePatch[] = [];
        for (const row of rows) if (selectedTags.has(row.tag.tagId)) {
          batch.push({
            tagId: row.tag.tagId,
            alarmOverrideMin: row.tag.alarmOverrideMin,
            alarmOverrideMax: row.tag.alarmOverrideMax,
            alarmCooldownMinutes: row.tag.alarmCooldownMinutes,
            alarmEnabled: value ? 1 : 0,
          });
        }
        await batchSetTagAlarmOverrides(batch);
      }
      toast.success(`已${value === null ? '继承' : value ? '启用' : '停用'} ${selectedTags.size} 个变量`);
      setSelectedTags(new Set());
      queryClient.invalidateQueries({ queryKey: ['telemetry-alarm-config-tree'] });
    } catch (e: any) { toast.error(e?.message || '操作失败'); }
    finally { setBatchBusy(false); }
  };

  const resetSelectedToInherit = async () => {
    if (selectedTags.size === 0) { toast.error('请先选择变量'); return; }
    const batch: TagAlarmOverridePatch[] = [];
    for (const row of rows) if (selectedTags.has(row.tag.tagId)) {
      batch.push({ tagId: row.tag.tagId, alarmOverrideMin: null, alarmOverrideMax: null, alarmCooldownMinutes: null });
    }
    setBatchBusy(true);
    try {
      await batchSetTagAlarmOverrides(batch);
      toast.success(`已重置 ${selectedTags.size} 个变量为继承`);
      setSelectedTags(new Set());
      setTagDrafts({});
      queryClient.invalidateQueries({ queryKey: ['telemetry-alarm-config-tree'] });
    } catch (e: any) { toast.error(e?.message || '重置失败'); }
    finally { setBatchBusy(false); }
  };

  const handleToggleTag = async (tagId: number, next: boolean | null) => {
    setTogglingTag(tagId);
    try {
      await setTagAlarmEnabled(tagId, next);
      queryClient.invalidateQueries({ queryKey: ["telemetry-alarm-config-tree"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "切换失败"); }
    finally { setTogglingTag(null); }
  };

  const handleSaveFloor = async (fc: string) => {
    const d = floorDrafts[fc];
    const floor = tree.floors.find(f => f.floorCode === fc);
    if (!d || !floor) return;
    setSavingFloor(fc);
    try {
      await saveFloorConfig({ id: floor.configId ?? undefined, floorCode: fc, enabled: floor.enabled, cooldownMinutes: d.cooldown, notifyOnRecovery: d.notifyRecovery, bufferFlushMinutes: d.bufferFlush });
      toast.success(`${fc} 已保存`);
      queryClient.invalidateQueries({ queryKey: ["telemetry-alarm-config-tree"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSavingFloor(null); }
  };

  const toggleFloorEnabled = async (fc: string) => {
    const floor = tree.floors.find(f => f.floorCode === fc);
    if (!floor) return;
    try {
      await saveFloorConfig({ id: floor.configId ?? undefined, floorCode: fc, enabled: !floor.enabled, cooldownMinutes: floor.cooldownMinutes, notifyOnRecovery: floor.notifyOnRecovery, bufferFlushMinutes: floor.bufferFlushMinutes ?? 5 });
      queryClient.invalidateQueries({ queryKey: ["telemetry-alarm-config-tree"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "切换失败"); }
  };

  const bandDot = (band?: string | null) =>
    band === "HIGH" ? "var(--app-color-feedback-danger)" : band === "LOW" ? "var(--app-color-feedback-info)" : "var(--app-color-feedback-success)";

  const suiteKey = (f: FloorNode, s: SuiteNode) => `${f.floorCode}/${s.suiteNorm}`;

  const activeFloorNode = activeFloor ? tree.floors.find(f => f.floorCode === activeFloor) : undefined;
  const showFloorConfig = activeFloorNode && !activeSuiteKey && !activeRoom;

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {/* Left nav */}
      <aside className="flex w-[260px] shrink-0 min-h-0 flex-col rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--app-color-border-default)] p-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-tertiary)]" />
          <input className="min-w-0 flex-1 bg-transparent text-xs text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:outline-none"
            placeholder="搜索楼层/套间/房间" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--app-color-border-default)] px-2.5 py-1.5">
          <button type="button" onClick={() => { setActiveFloor(null); setActiveSuiteKey(null); setActiveRoom(null); }}
            className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", !activeFloor ? "bg-[var(--app-color-accent)] text-white" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]")}>全部</button>
          <button type="button" className="text-[11px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"
            onClick={() => {
              const allFloors = tree.floors.map(f => f.floorCode);
              const allOpen = allFloors.length > 0 && allFloors.every(f => expandedFloors.has(f));
              setExpandedFloors(new Set(allOpen ? [] : allFloors));
              const allSuiteKeys = tree.floors.flatMap(f => f.suites.map(s => suiteKey(f, s)));
              const allSOpen = allSuiteKeys.length > 0 && allSuiteKeys.every(k => expandedSuites.has(k));
              setExpandedSuites(new Set(allSOpen ? [] : allSuiteKeys));
            }}>
            {tree.floors.length > 0 && tree.floors.every(f => expandedFloors.has(f.floorCode)) ? "全部收起" : "全部展开"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {tree.floors.map(floor => {
            const fexp = expandedFloors.has(floor.floorCode);
            const fActive = activeFloor === floor.floorCode;
            return (
              <div key={floor.floorCode} className="mb-0.5">
                <div className={cn("flex items-center gap-1 rounded-md px-1.5 py-1 cursor-pointer hover:bg-[var(--app-color-surface-hover)]", fActive && "bg-[color-mix(in_srgb,var(--app-color-accent)_10%,transparent)]")}
                  onClick={() => { setActiveFloor(floor.floorCode); setActiveSuiteKey(null); setActiveRoom(null); setExpandedFloors(prev => new Set(prev).add(floor.floorCode)); }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedFloors(prev => { const n = new Set(prev); fexp ? n.delete(floor.floorCode) : n.add(floor.floorCode); return n; }); }}
                    className="shrink-0 text-[var(--app-color-text-tertiary)]">{fexp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button>
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-tertiary)]" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--app-color-text-primary)]">{floor.floorCode}</span>
                  <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{floor.variableCount}</span>
                </div>
                {fexp && floor.suites.map(suite => {
                  const sk = suiteKey(floor, suite);
                  const sexp = expandedSuites.has(sk);
                  const sActive = activeSuiteKey === sk && !activeRoom;
                  return (
                    <div key={sk} className="ml-2">
                      <div className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 cursor-pointer hover:bg-[var(--app-color-surface-hover)]", sActive && "bg-[color-mix(in_srgb,var(--app-color-accent)_10%,transparent)]")}
                        onClick={() => { setActiveSuiteKey(sk); setActiveRoom(null); setExpandedSuites(prev => new Set(prev).add(sk)); }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedSuites(prev => { const n = new Set(prev); sexp ? n.delete(sk) : n.add(sk); return n; }); }}
                          className="shrink-0 text-[var(--app-color-text-tertiary)]">{sexp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button>
                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--app-color-text-secondary)]">{suite.suiteNorm}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setEditingSuite({ ...suite }); }}
                          className="shrink-0 rounded p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)]" title="套间阈值">
                          <SlidersHorizontal className="h-3 w-3" />
                        </button>
                      </div>
                      {sexp && suite.rooms.map(room => {
                        const rActive = activeRoom === room.roomCanonical;
                        return (
                          <button key={room.roomCanonical} type="button"
                            onClick={() => { setActiveRoom(room.roomCanonical); }}
                            className={cn("flex w-full items-center gap-1 rounded-md py-0.5 pl-7 pr-1.5 text-left hover:bg-[var(--app-color-surface-hover)]", rActive && "bg-[color-mix(in_srgb,var(--app-color-accent)_10%,transparent)]")}>
                            <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--app-color-text-tertiary)]">{room.roomDisplay}</span>
                            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{room.variableCount}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right pane */}
      <section className="flex min-w-0 min-h-0 flex-1 flex-col gap-2">
        {showFloorConfig && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5">
            <span className="text-xs font-semibold text-[var(--app-color-text-primary)]">{activeFloorNode!.floorCode}</span>
            <label className="inline-flex items-center gap-1 text-[11px] text-[var(--app-color-text-secondary)]">冷却
              <input type="number" min={5} max={1440} className="w-[3.5rem] rounded border border-[var(--app-color-border-default)] px-1 py-0.5 text-xs font-mono text-center text-[var(--app-color-text-primary)]"
                value={floorDrafts[activeFloorNode!.floorCode]?.cooldown ?? activeFloorNode!.cooldownMinutes}
                onChange={e => setFloorDrafts(p => ({ ...p, [activeFloorNode!.floorCode]: { ...(p[activeFloorNode!.floorCode] ?? { cooldown: activeFloorNode!.cooldownMinutes, notifyRecovery: activeFloorNode!.notifyOnRecovery, bufferFlush: activeFloorNode!.bufferFlushMinutes ?? 5 }), cooldown: Math.max(5, Number(e.target.value) || 60) } }))} />min</label>
            <label className="inline-flex items-center gap-1 text-[11px] text-[var(--app-color-text-secondary)]">缓冲刷新
              <input type="number" min={1} max={60} className="w-[3.5rem] rounded border border-[var(--app-color-border-default)] px-1 py-0.5 text-xs font-mono text-center text-[var(--app-color-text-primary)]"
                value={floorDrafts[activeFloorNode!.floorCode]?.bufferFlush ?? (activeFloorNode!.bufferFlushMinutes ?? 5)}
                onChange={e => setFloorDrafts(p => ({ ...p, [activeFloorNode!.floorCode]: { ...(p[activeFloorNode!.floorCode] ?? { cooldown: activeFloorNode!.cooldownMinutes, notifyRecovery: activeFloorNode!.notifyOnRecovery, bufferFlush: activeFloorNode!.bufferFlushMinutes ?? 5 }), bufferFlush: Math.max(1, Number(e.target.value) || 5) } }))} />min</label>
            <label className="inline-flex items-center gap-1 text-[11px] text-[var(--app-color-text-secondary)] cursor-pointer select-none">
              <input type="checkbox" className="h-3 w-3 rounded accent-[var(--app-color-accent)]"
                checked={floorDrafts[activeFloorNode!.floorCode]?.notifyRecovery ?? activeFloorNode!.notifyOnRecovery}
                onChange={e => setFloorDrafts(p => ({ ...p, [activeFloorNode!.floorCode]: { ...(p[activeFloorNode!.floorCode] ?? { cooldown: activeFloorNode!.cooldownMinutes, notifyRecovery: activeFloorNode!.notifyOnRecovery, bufferFlush: activeFloorNode!.bufferFlushMinutes ?? 5 }), notifyRecovery: e.target.checked } }))} />恢复通知</label>
            <div className="flex-1" />
            <AdminSwitchScaled size="sm" checked={activeFloorNode!.enabled} onChange={() => toggleFloorEnabled(activeFloorNode!.floorCode)} />
            <AdminButton type="button" tone="primary" size="sm" loading={savingFloor === activeFloorNode!.floorCode} onClick={() => handleSaveFloor(activeFloorNode!.floorCode)}><Save className="h-3.5 w-3.5" />保存</AdminButton>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5">
          <button type="button" onClick={() => setGlobalOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--app-color-accent)]" />
            全局设置
          </button>
          <span className="text-[var(--app-color-border-default)]">│</span>
          <span className="text-xs font-semibold text-[var(--app-color-text-primary)]">阈值模板</span>
          <select className="rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1.5 py-0.5 text-[11px] text-[var(--app-color-text-primary)]"
            value={activePresetId ?? ''}
            onChange={e => setActivePresetId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">选择模板...</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <AdminButton type="button" tone="secondary" size="sm" disabled={selectedTags.size === 0} loading={batchBusy} onClick={applyPresetToSelected}>应用模板 ({selectedTags.size})</AdminButton>
          <label className="inline-flex items-center gap-1 text-[11px] text-[var(--app-color-text-secondary)] cursor-pointer select-none">
            <input type="checkbox" className="h-3 w-3 rounded accent-[var(--app-color-accent)]" checked={applyCooldown} onChange={e => setApplyCooldown(e.target.checked)} />
            同时应用模板冷却
          </label>
          <button type="button" onClick={() => setPresetManagerOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]">
            管理模板…
          </button>
          <span className="text-[var(--app-color-border-default)]">│</span>
          <span className="text-xs font-semibold text-[var(--app-color-text-primary)]">批量：</span>
          <AdminButton type="button" tone="secondary" size="sm" disabled={selectedTags.size === 0} loading={batchBusy} onClick={() => batchSetAlarmSwitch(true)}>启用</AdminButton>
          <AdminButton type="button" tone="secondary" size="sm" disabled={selectedTags.size === 0} loading={batchBusy} onClick={() => batchSetAlarmSwitch(false)}>停用</AdminButton>
          <AdminButton type="button" tone="ghost" size="sm" disabled={selectedTags.size === 0} loading={batchBusy} onClick={() => batchSetAlarmSwitch(null)}>继承</AdminButton>
          <AdminButton type="button" tone="ghost" size="sm" disabled={selectedTags.size === 0} loading={batchBusy} onClick={resetSelectedToInherit}>重置阈值</AdminButton>
        </div>

        <p className="shrink-0 text-[11px] text-[var(--app-color-text-secondary)]">
          输入框留空＝继承（灰色提示为当前生效值）；填写即逐点覆盖。
        </p>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
          <table className="twin-table text-xs">
            <thead>
              <tr>
                <th className="w-8"><input type="checkbox" className="h-3.5 w-3.5 accent-[var(--app-color-accent)]" checked={allSelected} onChange={toggleSelectAll} /></th>
                <th>变量</th>
                <th className="w-[88px]">当前值</th>
                <th className="w-[130px]">生效阈值</th>
                <th className="w-[96px]">报警开关</th>
                <th>阈值覆盖</th>
                <th className="w-[72px]" title="逐点覆盖的“持续未恢复时重提醒间隔”（分钟）；留空继承楼层配置">重提醒</th>
                <th className="w-[56px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="py-6 text-center text-xs text-[var(--app-color-text-tertiary)]">无匹配变量</td></tr>
              ) : rows.map(row => {
                const { tag, room } = row;
                const kind = classify(tag.metricKindCode);
                const snap = valueByVar.get(tag.variableName);
                const isRef = !tag.isAlarmMetric;
                const overridden = tag.alarmOverrideMin != null || tag.alarmOverrideMax != null;
                const draft = tagDrafts[tag.tagId] ?? { min: '', max: '', cooldown: '' };
                const dirty =
                  draft.min !== (tag.alarmOverrideMin ?? '') ||
                  draft.max !== (tag.alarmOverrideMax ?? '') ||
                  String(draft.cooldown || '') !== String(tag.alarmCooldownMinutes || '');
                return (
                  <tr key={tag.tagId ?? tag.variableName} className={cn(isRef && "opacity-60")}>
                    <td>{tag.isAlarmMetric ? <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--app-color-accent)]" checked={selectedTags.has(tag.tagId)} onChange={e => setSelectedTags(prev => { const n = new Set(prev); e.target.checked ? n.add(tag.tagId) : n.delete(tag.tagId); return n; })} /> : null}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {kindBadge(tag)}
                        <span className="truncate font-medium text-[var(--app-color-text-primary)]" title={tag.variableName}>{tag.displayLabel}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--app-color-text-tertiary)]">{room.roomDisplay}</div>
                    </td>
                    <td>
                      {snap?.value != null ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[var(--app-color-text-primary)]">
                          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: bandDot(snap.alarmBand) }} />
                          {boolLabel(snap.value, tag.metricKindCode) ?? snap.value}
                        </span>
                      ) : <span className="text-[var(--app-color-text-tertiary)]">—</span>}
                    </td>
                    <td>
                      {kind === "analog" ? (tag.effectiveMinValue || tag.effectiveMaxValue) ? (
                        <div>
                          <div className="font-mono text-[var(--app-color-text-primary)]">{tag.effectiveMinValue ?? '—'}~{tag.effectiveMaxValue ?? '—'}</div>
                          <div className="text-[9px] text-[var(--app-color-accent)]">{overridden ? '逐点覆盖' : '继承楼层/套间'}</div>
                        </div>
                      ) : <span className="text-[var(--app-color-text-tertiary)]">未设置</span>
                        : kind === "wind" ? <span className="text-[var(--app-color-text-tertiary)]">不支持</span>
                        : kind === "switch" || kind === "status" ? <span className="text-[var(--app-color-text-tertiary)]">值变化即报警</span>
                        : <span className="text-[var(--app-color-text-tertiary)]">参考，不报警</span>}
                    </td>
                    <td>
                      {isRef ? <span className="text-[var(--app-color-text-tertiary)]">—</span> : (
                        <select className="rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1 py-0.5 text-[11px] text-[var(--app-color-text-primary)]"
                          disabled={togglingTag === tag.tagId || kind === "wind"}
                          title={kind === "wind" ? "风量限值后端暂未支持，开关不生效" : undefined}
                          value={tag.alarmEnabled === true ? '1' : tag.alarmEnabled === false ? '0' : 'inherit'}
                          onChange={e => handleToggleTag(tag.tagId, e.target.value === '1' ? true : e.target.value === '0' ? false : null)}>
                          <option value="inherit">继承</option>
                          <option value="1">启用</option>
                          <option value="0">禁用</option>
                        </select>
                      )}
                    </td>
                    <td>
                      {kind === "analog" ? (
                        <div className="flex items-center gap-1">
                          <input className="w-[3.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1 py-0.5 font-mono text-[11px] text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-secondary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]"
                            placeholder={tag.effectiveMinValue ?? "min"} value={draft.min}
                            onChange={e => updateTagDraft(tag.tagId, { min: e.target.value })} />
                          <span className="text-[var(--app-color-text-tertiary)]">~</span>
                          <input className="w-[3.5rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1 py-0.5 font-mono text-[11px] text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-secondary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]"
                            placeholder={tag.effectiveMaxValue ?? "max"} value={draft.max}
                            onChange={e => updateTagDraft(tag.tagId, { max: e.target.value })} />
                        </div>
                      ) : kind === "switch" || kind === "status" ? (
                        <div className="text-[11px] text-[var(--app-color-text-tertiary)]">
                          <div>值变化即报警</div>
                          <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{kind === "switch" ? "true=开 / false=关" : "true=是 / false=否"}</div>
                        </div>
                      ) : kind === "wind" ? <span className="text-[11px] text-[var(--app-color-text-tertiary)]">不支持报警</span>
                        : <span className="text-[11px] text-[var(--app-color-text-tertiary)]">参考，不报警</span>}
                    </td>
                    <td>
                      {kind === "analog" ? (
                        <input className="w-[3rem] rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1 py-0.5 font-mono text-[11px] text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-secondary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]"
                          placeholder={tag.alarmCooldownMinutes ? String(tag.alarmCooldownMinutes) : "继承"}
                          value={draft.cooldown}
                          onChange={e => updateTagDraft(tag.tagId, { cooldown: e.target.value })} />
                      ) : <span className="text-[var(--app-color-text-tertiary)]">—</span>}
                    </td>
                    <td>
                      {kind === "analog" ? (
                        <AdminButton type="button" tone="primary" size="sm" loading={savingTags.has(tag.tagId)} disabled={!dirty} onClick={() => saveTagOverride(row)}>
                          <Save className="h-3 w-3" /> 保存
                        </AdminButton>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

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

      <GlobalLimitsModal open={globalOpen} onClose={() => setGlobalOpen(false)} />
      <PresetManagerModal open={presetManagerOpen} presets={presets} onClose={() => setPresetManagerOpen(false)}
        onChanged={() => { fetchAlarmPresets().then(setPresets).catch(() => {}); }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SuiteThresholdModal — 套间阈值编辑弹窗（含房间变量预览）              */
/* ------------------------------------------------------------------ */

function SuiteThresholdModal({ suite, saving, onChange, onSave, onClose }: {
  suite: SuiteNode; saving: boolean; onChange: (s: SuiteNode) => void; onSave: () => void; onClose: () => void;
}) {
  const metrics: Array<{ key: string; label: string; icon: React.ReactNode; unit: string; minKey: keyof SuiteNode; maxKey: keyof SuiteNode; accent: string }> = [
    { key: "temp", label: "温度", icon: <Thermometer className="h-3.5 w-3.5" />, unit: "℃", minKey: "tempMin", maxKey: "tempMax", accent: "var(--app-color-feedback-warning)" },
    { key: "hum", label: "湿度", icon: <Droplets className="h-3.5 w-3.5" />, unit: "%", minKey: "humMin", maxKey: "humMax", accent: "var(--app-color-feedback-info)" },
    { key: "pressure", label: "压强", icon: <Gauge className="h-3.5 w-3.5" />, unit: "Pa", minKey: "pressureMin", maxKey: "pressureMax", accent: "var(--app-color-feedback-success)" },
  ];

  const inputCls = "w-[5rem] rounded border border-[var(--app-color-border-default)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]";

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-[var(--app-color-accent)]" />套间阈值 · {suite.suiteNorm}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]"><X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" /></button>
        </div>
        <p className="text-[11px] text-[var(--app-color-text-tertiary)] mb-3">楼层：{suite.floorCode} · {suite.roomCount} 房间 · {suite.variableCount} 变量</p>

        {/* Suite enable */}
        <div className="flex items-center gap-3 mb-4 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--app-color-text-primary)]">套间报警</span>
          <div className="flex-1" />
          <select className="rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs text-[var(--app-color-text-primary)]"
            value={suite.enabled === null ? "inherit" : suite.enabled ? "on" : "off"}
            onChange={(e) => onChange({ ...suite, enabled: e.target.value === "inherit" ? null : e.target.value === "on" })}>
            <option value="inherit">继承楼层</option>
            <option value="on">启用</option>
            <option value="off">停用</option>
          </select>
        </div>

        {/* Thresholds */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-[var(--app-color-text-primary)]">自定义阈值</span><span className="text-[10px] text-[var(--app-color-text-tertiary)]">留空=继承楼层</span></div>
          {metrics.map((m) => (
            <div key={m.key} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 w-[56px] shrink-0 text-[11px] font-medium" style={{ color: m.accent }}>{m.icon}{m.label}</span>
              <input type="text" inputMode="decimal" className={inputCls} placeholder="下限"
                value={(suite[m.minKey] as string) ?? ""} onChange={(e) => onChange({ ...suite, [m.minKey]: e.target.value || null })} />
              <span className="text-[11px] text-[var(--app-color-text-tertiary)]">~</span>
              <input type="text" inputMode="decimal" className={inputCls} placeholder="上限"
                value={(suite[m.maxKey] as string) ?? ""} onChange={(e) => onChange({ ...suite, [m.maxKey]: e.target.value || null })} />
              <span className="text-[10px] text-[var(--app-color-text-tertiary)] w-[1.25rem] text-right">{m.unit}</span>
            </div>
          ))}
        </div>

        {/* Hysteresis section */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--app-color-text-primary)]">死区（滞回）</span>
            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">报警与恢复之间留的缓冲，防止值在阈值附近抖动时反复报警</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 w-[56px] shrink-0 text-[11px] font-medium" style={{ color: "var(--app-color-feedback-warning)" }}>
              <Thermometer className="h-3.5 w-3.5" />温度
            </span>
            <input type="text" inputMode="decimal" className={inputCls} placeholder="0.3"
              value={(suite.hysteresisTemp as string) ?? ""}
              onChange={(e) => onChange({ ...suite, hysteresisTemp: e.target.value || null })} />
            <span className="text-[10px] text-[var(--app-color-text-tertiary)] w-[1.25rem] text-right">℃</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 w-[56px] shrink-0 text-[11px] font-medium" style={{ color: "var(--app-color-feedback-info)" }}>
              <Droplets className="h-3.5 w-3.5" />湿度
            </span>
            <input type="text" inputMode="decimal" className={inputCls} placeholder="2.0"
              value={(suite.hysteresisHum as string) ?? ""}
              onChange={(e) => onChange({ ...suite, hysteresisHum: e.target.value || null })} />
            <span className="text-[10px] text-[var(--app-color-text-tertiary)] w-[1.25rem] text-right">%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 w-[56px] shrink-0 text-[11px] font-medium" style={{ color: "var(--app-color-feedback-success)" }}>
              <Gauge className="h-3.5 w-3.5" />压差
            </span>
            <input type="text" inputMode="decimal" className={inputCls} placeholder="5.0"
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
                    <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: tag.metricKindCode === "TEMP" ? "var(--app-color-feedback-warning)" : tag.metricKindCode === "HUM" || tag.metricKindCode === "RH" ? "var(--app-color-feedback-info)" : tag.metricKindCode === "PRESSURE" ? "var(--app-color-feedback-success)" : "var(--app-color-border-strong)" }} />
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

  const inputCls = "w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 font-mono text-xs text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent)_20%,transparent)]";

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">{form.id ? '编辑模板' : '新建模板'}</h3>
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
            <div><label className={adminLabelClass}>压差下限</label><input className={cn(inputCls, "mt-1")} placeholder="10.0" value={form.pressureMin ?? ''} onChange={e => setForm({...form, pressureMin: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>压差上限</label><input className={cn(inputCls, "mt-1")} placeholder="30.0" value={form.pressureMax ?? ''} onChange={e => setForm({...form, pressureMax: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>温度死区</label><input className={cn(inputCls, "mt-1")} placeholder="0.3" value={form.hysteresisTemp ?? ''} onChange={e => setForm({...form, hysteresisTemp: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>湿度死区</label><input className={cn(inputCls, "mt-1")} placeholder="2.0" value={form.hysteresisHum ?? ''} onChange={e => setForm({...form, hysteresisHum: e.target.value || null})} /></div>
            <div><label className={adminLabelClass}>压差死区</label><input className={cn(inputCls, "mt-1")} placeholder="5.0" value={form.hysteresisPressure ?? ''} onChange={e => setForm({...form, hysteresisPressure: e.target.value || null})} /></div>
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
/*  PresetManagerModal — 阈值预设模板管理弹窗                             */
/* ------------------------------------------------------------------ */

function PresetManagerModal({ open, presets, onClose, onChanged }: {
  open: boolean;
  presets: AlarmPreset[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AlarmPreset | null | undefined>(undefined);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[var(--app-color-accent)]" />
            阈值预设模板
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]">
            <X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" />
          </button>
        </div>

        <div className="flex justify-end mb-3">
          <AdminButton type="button" tone="primary" size="sm" onClick={() => setEditing(null)}>+ 新建模板</AdminButton>
        </div>

        {presets.length === 0 ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)] py-4 text-center">暂无阈值预设模板</p>
        ) : (
          <div className="space-y-1.5">
            {presets.map(p => (
              <div key={p.id} className="flex items-center gap-2 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--app-color-text-primary)]">{p.name}</span>
                    {p.description ? <span className="truncate text-[10px] text-[var(--app-color-text-tertiary)]">{p.description}</span> : null}
                  </div>
                  <div className="text-[10px] text-[var(--app-color-text-tertiary)]">
                    温{p.tempMin ?? '-'}~{p.tempMax ?? '-'}℃ 湿{p.humMin ?? '-'}~{p.humMax ?? '-'}% 压{p.pressureMin ?? '-'}~{p.pressureMax ?? '-'}Pa 冷{p.alarmCooldownMinutes ?? 0}min
                  </div>
                </div>
                <AdminButton type="button" tone="ghost" size="sm" onClick={() => setEditing(p)}>编辑</AdminButton>
                <AdminButton type="button" tone="ghost" size="sm" onClick={async () => {
                  if (!p.id || !await appConfirm(`删除模板「${p.name}」？`)) return;
                  try {
                    await deleteAlarmPreset(p.id);
                    toast.success('已删除');
                    onChanged();
                  } catch (e: any) { toast.error(e?.message || '删除失败'); }
                }}>删除</AdminButton>
              </div>
            ))}
          </div>
        )}

        {editing !== undefined && (
          <PresetEditorModal preset={editing} onClose={() => setEditing(undefined)}
            onSaved={() => { setEditing(undefined); onChanged(); }} />
        )}
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
        <div className="rounded-lg border border-[var(--app-color-feedback-warning)] bg-[color-mix(in_srgb,var(--app-color-feedback-warning)_10%,transparent)] px-3 py-2 text-xs text-[var(--app-color-feedback-warning)]">
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

/* ------------------------------------------------------------------ */
/*  DoorUnlockTab — 门禁临时解锁配置                                    */
/* ------------------------------------------------------------------ */

function DoorUnlockTab() {
  const [rows, setRows] = useState<DoorTempUnlockRuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<DoorTempUnlockRuleRow | null | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = async () => {
    setLoading(true);
    try { setRows(await listDoorTempUnlockRules()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [refreshKey]);

  const onDelete = async (id: number) => {
    if (!await appConfirm("确定删除？")) return;
    try { await deleteDoorTempUnlockRule(id); toast.success("已删除"); setRows(prev => prev.filter(r => r.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "删除失败"); }
  };

  const onToggle = async (r: DoorTempUnlockRuleRow) => {
    try {
      const updated = await toggleDoorTempUnlockRule(r.id);
      setRows(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch (e) { toast.error(e instanceof Error ? e.message : "切换失败"); }
  };

  return (
    <div className="space-y-3">
      <AdminFormCard title="临时解锁规则"
        actions={
          <div className="flex gap-2">
            <AdminButton type="button" tone={editing !== undefined ? "secondary" : "primary"}
              onClick={editing !== undefined ? () => setEditing(undefined) : () => setEditing(null)}>
              {editing !== undefined ? "关闭" : "+ 新增规则"}
            </AdminButton>
            <AdminButton type="button" tone="secondary" loading={loading} onClick={load}>
              <RotateCw className="h-4 w-4" />
            </AdminButton>
          </div>}
      >
        <AdminTableShell loading={loading} empty={!loading && rows.length === 0} emptyMessage="暂无规则" scrollable>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2">通道数</th>
                <th className="px-3 py-2">阈值</th>
                <th className="px-3 py-2">时长</th>
                <th className="px-3 py-2">冷却</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-xs">{((): number => { try { return JSON.parse(r.channelCodes ?? "[]").length; } catch { return 0; } })()} 个通道</td>
                  <td className="px-3 py-2 text-xs">{r.thresholdCount}次 / {r.thresholdWindowSec}秒</td>
                  <td className="px-3 py-2 text-xs">{r.unlockDurationSec}秒</td>
                  <td className="px-3 py-2 text-xs">{r.cooldownSec}秒</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => onToggle(r)}
                      style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 999, border: "none", cursor: "pointer",
                        background: r.enabled ? "#dcfce7" : "#f1f5f9", color: r.enabled ? "#166534" : "#94a3b8" }}>
                      {r.enabled ? "启用" : "停用"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <AdminButton type="button" tone="secondary" size="sm" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></AdminButton>
                      <AdminButton type="button" tone="destructive" size="sm" onClick={() => onDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </AdminFormCard>

      {editing !== undefined && (
        <DoorUnlockRuleForm
          key={editing?.id ?? "new"}
          editing={editing}
          onSaved={() => { setEditing(undefined); setRefreshKey(k => k + 1); }}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DoorUnlockRuleForm — 新增/编辑规则表单                               */
/* ------------------------------------------------------------------ */

function DoorUnlockRuleForm({ editing, onSaved, onCancel }: {
  editing: DoorTempUnlockRuleRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isNew = !editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [selectedChannelCodes, setSelectedChannelCodes] = useState<string[]>(() => {
    if (editing?.channelCodes) {
      try { return JSON.parse(editing.channelCodes) as string[]; } catch { return []; }
    }
    return [];
  });
  const [thresholdCount, setThresholdCount] = useState(editing?.thresholdCount ?? 5);
  const [thresholdWindowSec, setThresholdWindowSec] = useState(editing?.thresholdWindowSec ?? 60);
  const [unlockDurationSec, setUnlockDurationSec] = useState(editing?.unlockDurationSec ?? 120);
  const [cooldownSec, setCooldownSec] = useState(editing?.cooldownSec ?? 300);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) { toast.error("请输入规则名称"); return; }
    if (selectedChannelCodes.length === 0) { toast.error("请选择至少一个通道"); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        enabled: editing?.enabled ?? true,
        channelCodes: JSON.stringify(selectedChannelCodes),
        thresholdCount,
        thresholdWindowSec,
        unlockDurationSec,
        cooldownSec,
      };
      if (isNew) {
        await createDoorTempUnlockRule(payload);
        toast.success("规则已创建");
      } else {
        await updateDoorTempUnlockRule(editing!.id, payload);
        toast.success("规则已更新");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormCard title={isNew ? "新增临时解锁规则" : `编辑：${editing!.name}`}>
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className={adminLabelClass}>规则名称</label>
          <input className={cn(adminInputClass, "w-full")} value={name} onChange={e => setName(e.target.value)} placeholder="如：北门临时解锁" />
        </div>

        {/* Channel picker */}
        <div>
          <label className={adminLabelClass}>监控通道（多选）</label>
          <div className="mt-1">
            <DahuaChannelListPicker
              selected={selectedChannelCodes}
              onChange={setSelectedChannelCodes}
              fetchChannels={fetchDoorControlChannels}
              idPrefix="door-unlock"
            />
          </div>
        </div>

        {/* Threshold */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={adminLabelClass}>失败次数阈值</label>
            <input className={cn(adminInputClass, "w-full")} type="number" min={1} value={thresholdCount}
              onChange={e => setThresholdCount(Number(e.target.value) || 1)} />
          </div>
          <div>
            <label className={adminLabelClass}>时间窗口(秒)</label>
            <input className={cn(adminInputClass, "w-full")} type="number" min={1} value={thresholdWindowSec}
              onChange={e => setThresholdWindowSec(Number(e.target.value) || 1)} />
          </div>
        </div>

        {/* Duration & Cooldown */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={adminLabelClass}>常开持续时长(秒)</label>
            <input className={cn(adminInputClass, "w-full")} type="number" min={1} value={unlockDurationSec}
              onChange={e => setUnlockDurationSec(Number(e.target.value) || 1)} />
          </div>
          <div>
            <label className={adminLabelClass}>冷却时间(秒)</label>
            <input className={cn(adminInputClass, "w-full")} type="number" min={0} value={cooldownSec}
              onChange={e => setCooldownSec(Number(e.target.value) || 0)} />
            <p className={adminHintClass}>按人+门维度冷却</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <AdminButton type="button" tone="primary" loading={saving} onClick={save}>
            <Save className="h-4 w-4" />保存
          </AdminButton>
          <AdminButton type="button" tone="secondary" onClick={onCancel}>取消</AdminButton>
        </div>
      </div>
    </AdminFormCard>
  );
}
