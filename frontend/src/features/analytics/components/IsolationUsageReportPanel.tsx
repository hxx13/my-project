import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Pencil, Plus, Settings2, Share2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  deleteAnalyticsView,
  fetchAnalyticsViews,
  fetchAuditLogDetail,
  generateAnalyticsLlmInsightBatch,
  previewIsolationUsage,
  saveAnalyticsView,
  scopeFilterOnly,
  setAnalyticsViewSubscription,
  updateAnalyticsView,
  type AnalyticsAuditLog,
  type AnalyticsUserView,
  type IsolationUsageQueryResult,
} from "@/api/domains/analytics.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";

import { EditAnalyticsViewModal } from "@/features/analytics/components/EditAnalyticsViewModal";
import {
  AnalyticsLlmInsightDialog,
  type InsightDialogTarget,
} from "@/features/analytics/components/AnalyticsLlmInsightDialog";
import { LatestSnapshotsDashboard } from "@/features/analytics/components/LatestSnapshotsDashboard";
import {
  SaveAnalyticsConfigModal,
  type SaveConfigOptions,
} from "@/features/analytics/components/SaveAnalyticsConfigModal";
import { SettlementRecordsPanel } from "@/features/analytics/components/SettlementRecordsPanel";
import { AnalyticsViewShareModal } from "@/features/analytics/components/AnalyticsViewShareModal";
import {
  defaultAnalyticsDraftFilter,
  draftFromSavedFilter,
  type AnalyticsDraftFilter,
} from "@/features/analytics/analyticsPipelineFilter";
import {
  draftDiffersFromSaved,
  formatSavedChannelScope,
} from "@/features/analytics/analyticsChannelScopeHint";
import { useGroupedAuditLogs } from "@/features/analytics/hooks/useGroupedAuditLogs";
import { cn } from "@/lib/utils";
import { fetchStatsTasksHealth } from "@/api/domains/dahuaSwingStats.api";

const REPORT_KEY = "isolation_usage";

function formatPreviewTime(v?: string): string {
  if (!v) return "";
  const s = v.trim().replace("T", " ");
  if (s.length === 10) return `${s} 00:00:00`;
  if (s.length === 16) return `${s}:00`;
  return s.length >= 19 ? s.slice(0, 19) : s;
}

export function IsolationUsageReportPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AnalyticsDraftFilter>(() => defaultAnalyticsDraftFilter());
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [selectedLog, setSelectedLog] = useState<AnalyticsAuditLog | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editView, setEditView] = useState<AnalyticsUserView | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [insightDialog, setInsightDialog] = useState<InsightDialogTarget | null>(null);
  const [shareModal, setShareModal] = useState<"create" | "import" | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<IsolationUsageQueryResult | null>(null);
  const [applyingConfig, setApplyingConfig] = useState(false);

  const { data: views = [] } = useQuery({
    queryKey: ["analytics", "views", REPORT_KEY],
    queryFn: () => fetchAnalyticsViews(REPORT_KEY),
  });

  const { data: pullHealth } = useQuery({
    queryKey: ["dahua-stats-tasks", "health"],
    queryFn: fetchStatsTasksHealth,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId]
  );

  const savedDraft = useMemo(
    () => (activeView ? draftFromSavedFilter(activeView.filter as Record<string, unknown>) : defaultAnalyticsDraftFilter()),
    [activeView]
  );

  const activeFilterKey = activeView ? JSON.stringify(activeView.filter ?? {}) : "";

  const configDirty = useMemo(
    () => (activeView ? draftDiffersFromSaved(draft, savedDraft) : false),
    [activeView, draft, savedDraft]
  );

  const savedChannelLabel = useMemo(() => formatSavedChannelScope(savedDraft), [savedDraft]);

  const { compareCycles, latestByCycle, grouped } = useGroupedAuditLogs(REPORT_KEY, activeView);

  const latestIdsByCycle = useMemo(
    () => new Set([...latestByCycle.values()].map((l) => l.id)),
    [latestByCycle]
  );

  const openInsightDialog = (
    auditLogId: number,
    periodLabel: string,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    const r = e.currentTarget.getBoundingClientRect();
    setInsightDialog({
      reportKey: REPORT_KEY,
      auditLogId,
      periodLabel,
      anchor: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
    });
  };

  useEffect(() => {
    if (activeViewId == null && views.length > 0) {
      setActiveViewId(views[0].id);
    }
  }, [views, activeViewId]);

  useEffect(() => {
    if (activeView) {
      setDraft(draftFromSavedFilter(activeView.filter as Record<string, unknown>));
    } else {
      setDraft(defaultAnalyticsDraftFilter());
    }
  }, [activeViewId, activeFilterKey]);

  useEffect(() => {
    setSelectedLogId(null);
    setSelectedLog(null);
  }, [activeViewId]);

  // Keep selectedLog reference fresh when grouped data updates via polling
  useEffect(() => {
    if (selectedLogId == null) return;
    for (const list of grouped.values()) {
      const hit = list.find((l) => l.id === selectedLogId);
      if (hit) {
        setSelectedLog(hit);
        return;
      }
    }
  }, [grouped, selectedLogId]);

  useEffect(() => {
    if (selectedLogId == null && latestByCycle.size > 0) {
      const first = [...latestByCycle.values()][0];
      if (first) {
        setSelectedLogId(first.id);
        setSelectedLog(first);
      }
    }
  }, [latestByCycle, activeViewId, selectedLogId]);

  const applyView = (v: AnalyticsUserView) => {
    setActiveViewId(v.id);
    setDraft(draftFromSavedFilter(v.filter as Record<string, unknown>));
    setSelectedLogId(null);
  };


  const openEditView = (v: AnalyticsUserView) => {
    setActiveViewId(v.id);
    setDraft(draftFromSavedFilter(v.filter as Record<string, unknown>));
    setEditView(v);
  };

  const applyToActiveView = async () => {
    if (!activeView) {
      toast.error("请先在左侧选择一条统计配置");
      return;
    }
    if (!activeView.subscribed) {
      toast.error("该配置未订阅，请先开启订阅或使用「另存为新配置」并勾选订阅");
      return;
    }
    setApplyingConfig(true);
    try {
      const filter = scopeFilterOnly(draft);
      if (draft.isPublic) {
        (filter as any).isPublic = true;
      }
      const updated = await updateAnalyticsView(activeView.id, {
        name: activeView.name,
        filter,
        forceRecalcSnapshots: true,
      });
      qc.setQueryData<AnalyticsUserView[]>(["analytics", "views", REPORT_KEY], (prev) =>
        (prev ?? []).map((v) => (v.id === updated.id ? updated : v))
      );
      setDraft(draftFromSavedFilter(updated.filter as Record<string, unknown>));
      setSelectedLogId(null);
      // 保存后仅合并/刷新快照与明细，禁止整表无关 reload（post-save-no-full-refresh.mdc）
      const invalidateSnapshots = () => {
        void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY] });
        void qc.invalidateQueries({ queryKey: ["analytics", "audit-detail"] });
      };
      invalidateSnapshots();
      for (const delay of [2500, 6000, 12000]) {
        window.setTimeout(invalidateSnapshots, delay);
      }
      toast.success("已保存配置，正在强制重算全部已有快照（约数秒后可刷新查看）", { duration: 7000 });
      setConfigOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setApplyingConfig(false);
    }
  };

  const handleSaveConfig = async (opts: SaveConfigOptions) => {
    try {
      const filter = scopeFilterOnly({ ...draft, compareCycles: opts.compareCycles, startDate: opts.backfillUntil || draft.startDate });
      if (opts.isPublic) {
        (filter as any).isPublic = true;
      }
      const created = await saveAnalyticsView({ reportKey: REPORT_KEY, name: opts.name, filter });
      let saved = created;
      if (opts.subscribe) {
        saved = await setAnalyticsViewSubscription(created.id, true, {
          backfillHistory: true,
          backfillUntil: opts.backfillUntil,
        });
      }
      qc.setQueryData<AnalyticsUserView[]>(["analytics", "views", REPORT_KEY], (prev) => [
        ...(prev ?? []),
        saved,
      ]);
      setActiveViewId(saved.id);
      setDraft(draftFromSavedFilter(saved.filter as Record<string, unknown>));
      if (opts.subscribe) {
        void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY] });
      }
      toast.success(opts.subscribe ? "已保存并订阅" : "已保存", { duration: 5000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleUpdateView = async (
    id: number,
    name: string,
    filter: Record<string, unknown>,
    subscribed: boolean,
    backfillHistory: boolean,
    backfillUntil: string
  ) => {
    try {
      const updated = await updateAnalyticsView(id, { name, filter });
      const wasSubscribed = updated.subscribed;
      const withSub =
        updated.subscribed !== subscribed
          ? await setAnalyticsViewSubscription(id, subscribed, {
              backfillHistory: subscribed && backfillHistory,
              backfillUntil,
            })
          : subscribed && backfillHistory && wasSubscribed
            ? await setAnalyticsViewSubscription(id, true, { backfillHistory: true, backfillUntil })
            : updated;
      qc.setQueryData<AnalyticsUserView[]>(["analytics", "views", REPORT_KEY], (prev) =>
        (prev ?? []).map((v) => (v.id === id ? withSub : v))
      );
      if (activeViewId === id) {
        setDraft(draftFromSavedFilter(withSub.filter as Record<string, unknown>));
      }
      void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY] });
      setEditView(null);
      toast.success("配置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    }
  };

  const toggleSubscription = async (v: AnalyticsUserView) => {
    try {
      const updated = await setAnalyticsViewSubscription(v.id, !v.subscribed);
      qc.setQueryData<AnalyticsUserView[]>(["analytics", "views", REPORT_KEY], (prev) =>
        (prev ?? []).map((row) => (row.id === v.id ? updated : row))
      );
      void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY] });
      toast.success(updated.subscribed ? "已开启订阅" : "已取消订阅");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleDeleteView = async (id: number) => {
    const view = views.find((v) => v.id === id);
    if (view?.isPublic) {
      const confirmed = window.confirm(
        `删除「${view.name}」将同时删除所有用户通过分享码导入的副本。\n\n此操作不可撤销，是否继续？`
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(`确认删除「${view.name}」？`);
      if (!confirmed) return;
    }
    try {
      await deleteAnalyticsView(id);
      qc.setQueryData<AnalyticsUserView[]>(["analytics", "views", REPORT_KEY], (prev) =>
        (prev ?? []).filter((v) => v.id !== id)
      );
      if (activeViewId === id) setActiveViewId(null);
      setSelectedLogId(null);
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const runConfigPreview = async () => {
    const log = selectedLog ?? [...latestByCycle.values()][0];
    if (!log) {
      toast.error("请先选择或生成一条清算快照");
      return;
    }
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const detail = await fetchAuditLogDetail(log.id);
      const start = formatPreviewTime(detail.currentStart);
      const end = formatPreviewTime(detail.currentEnd);
      if (!start || !end) {
        toast.error("无法解析快照时间窗");
        return;
      }
      const live = await previewIsolationUsage(scopeFilterOnly(draft), start, end);
      setPreviewResult(live);
      const liveTotal = live.summary?.totalEvents ?? live.summary?.totalPersonTimes ?? 0;
      const snapTotal = log.currentRounds;
      const diff = liveTotal - snapTotal;
      toast.success(
        `当前配置试算 ${liveTotal} 条 · 快照 ${snapTotal} 条${diff !== 0 ? `（差 ${diff > 0 ? "+" : ""}${diff}）` : ""}`,
        { duration: 6000 }
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "试算失败");
    } finally {
      setPreviewing(false);
    }
  };

  const runBatchInsight = async () => {
    if (!activeView?.id) {
      toast.error("请先选择统计配置");
      return;
    }
    setBatchGenerating(true);
    try {
      const res = await generateAnalyticsLlmInsightBatch({
        reportKey: REPORT_KEY,
        viewId: activeView.id,
        limit: 5,
        forceRefresh: false,
      });
      toast.success(`批量解读：成功 ${res.success}/${res.total} 条`);
      if (selectedLogId) {
        void qc.invalidateQueries({ queryKey: ["analytics", "llm-insight", selectedLogId] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量生成失败");
    } finally {
      setBatchGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      {activeView ? (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            configDirty
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-violet-200 bg-violet-50/80 text-violet-950"
          )}
        >
          <p>
            <strong>已保存配置</strong>：{savedChannelLabel}
            {configDirty ? (
              <>
                {" "}
                · 当前草稿与已保存不一致，请使用铅笔编辑按钮修改后点击<strong>「强制重算全部快照」</strong>，否则快照仍按旧通道口径。
              </>
            ) : (
              " · 修改通道或周期后请点击铅笔编辑按钮修改，然后使用「强制重算全部快照」。"
            )}
          </p>
          <p className="mt-1 text-[10px] text-neutral-600">
            数据前置：各通道须已在{" "}
            <a href="#/admin/dahua-swing-tasks?tab=audit" className="text-indigo-700 underline">
              定时审计拉取
            </a>{" "}
            完成拉取并清洗入库；总库按通道合并，与「门禁统计清洗」按任务查看维度不同。
          </p>
        </div>
      ) : null}

      {pullHealth && pullHealth.failed > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          ⚠️ 门禁拉取任务：{pullHealth.failed} 个失败 — 可能导致统计缺数据。
          <a href="#/admin/dahua-swing-tasks?tab=audit" className="ml-2 underline font-medium">
            前往修复 →
          </a>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 shadow-sm hover:bg-violet-100"
          onClick={() => setShowSaveModal(true)}
        >
          <Plus className="h-4 w-4" />
          新增配置
        </button>
        {activeView?.subscribed ? (
          <button
            type="button"
            disabled={applyingConfig}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            onClick={() => void applyToActiveView()}
          >
            {applyingConfig ? "重算中…" : "强制重算全部快照"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={previewing}
          className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
          onClick={() => void runConfigPreview()}
        >
          {previewing ? "试算中…" : "按当前配置试算（对比选中快照）"}
        </button>
        {previewResult ? (
          <span className="text-[11px] text-neutral-500">
            试算 {previewResult.summary?.totalEvents ?? previewResult.summary?.totalPersonTimes ?? 0} 条
          </span>
        ) : null}
      </div>


      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <aside className="w-full shrink-0 space-y-3 xl:w-72 xl:sticky xl:top-20 xl:z-10 xl:self-start">
          <AdminFormCard title="统计配置">
            <div className="-mt-1 mb-2 flex justify-end gap-1">
              <button
                type="button"
                title="导入分享码"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
                onClick={() => setShareModal("import")}
              >
                <Upload className="h-3 w-3" />
                导入
              </button>
              {views.length > 0 ? (
                <button
                  type="button"
                  title="分享全部统计配置"
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100"
                  onClick={() => setShareModal("create")}
                >
                  <Share2 className="h-3 w-3" />
                  分享
                </button>
              ) : null}
            </div>
            {views.length === 0 ? (
              <p className="text-xs text-neutral-400">暂无，请保存配置</p>
            ) : (
              <ul className="space-y-1">
                {views.map((v) => (
                  <li
                    key={v.id}
                    className={cn(
                      "group flex items-center gap-0.5 rounded-lg border px-2 py-1.5 text-sm",
                      activeViewId === v.id
                        ? "border-violet-400 bg-violet-50"
                        : v.subscribed
                          ? "border-violet-200 bg-violet-50/50"
                          : "border-neutral-200 bg-white"
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left font-medium"
                      onClick={() => applyView(v)}
                    >
                      {v.subscribed ? <Bell className="mr-1 inline h-3 w-3 text-violet-600" /> : null}
                      {v.name}
                    </button>
                    <button type="button" className="shrink-0 p-1 text-neutral-400" onClick={() => openEditView(v)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="shrink-0 p-1 text-neutral-400" onClick={() => void toggleSubscription(v)}>
                      {v.subscribed ? <Bell className="h-3.5 w-3.5 text-violet-600" /> : <BellOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 p-1 text-neutral-400 opacity-0 group-hover:opacity-100"
                      onClick={() => void handleDeleteView(v.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AdminFormCard>

          <SettlementRecordsPanel
            reportKey={REPORT_KEY}
            view={activeView}
            selectedLogId={selectedLogId}
            selectedLog={selectedLog}
            latestByCycle={latestByCycle}
            latestIdsByCycle={latestIdsByCycle}
            onSelectLog={(log) => {
              setSelectedLogId(log.id);
              setSelectedLog(log);
              void qc.invalidateQueries({ queryKey: ["analytics", "audit-detail", log.id] });
            }}
          />
          {activeView ? (
            <button
              type="button"
              disabled={batchGenerating}
              className="w-full rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60"
              onClick={() => void runBatchInsight()}
            >
              {batchGenerating ? "批量生成中…" : "批量 AI 解读（最近 5 条无缓存）"}
            </button>
          ) : null}
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          <LatestSnapshotsDashboard
            compareCycles={compareCycles}
            latestByCycle={latestByCycle}
            grouped={grouped}
            selectedLogId={selectedLogId}
            selectedLog={selectedLog}
            onOpenInsight={openInsightDialog}
            viewName={activeView?.name}
            metricUnit="条"
          />
        </main>
      </div>

      <SaveAnalyticsConfigModal
        open={showSaveModal}
        initialCompareCycles={draft.compareCycles}
        onClose={() => setShowSaveModal(false)}
        onConfirm={handleSaveConfig}
      />

      <EditAnalyticsViewModal
        view={editView}
        open={editView != null}
        onClose={() => setEditView(null)}
        onSave={handleUpdateView}
      />

      <AnalyticsLlmInsightDialog
        target={insightDialog}
        onClose={() => {
          const id = insightDialog?.auditLogId;
          setInsightDialog(null);
          if (id) void qc.invalidateQueries({ queryKey: ["analytics", "llm-insight", id] });
        }}
      />

      <AnalyticsViewShareModal
        mode={shareModal === "import" ? "import" : "create"}
        open={shareModal != null}
        reportKey={REPORT_KEY}
        viewCount={views.length}
        onClose={() => setShareModal(null)}
        onImported={(imported) => {
          qc.setQueryData<AnalyticsUserView[]>(["analytics", "views", REPORT_KEY], (prev) => [
            ...(prev ?? []),
            ...imported,
          ]);
          if (imported[0]) applyView(imported[0]);
          void qc.invalidateQueries({ queryKey: ["analytics", "views", REPORT_KEY] });
          void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY] });
        }}
      />

    </div>
  );
}
