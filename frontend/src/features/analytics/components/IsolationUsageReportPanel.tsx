import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Pencil, Share2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  deleteAnalyticsView,
  fetchAnalyticsViews,
  fetchAuditLogDetail,
  generateAnalyticsLlmInsightBatch,
  saveAnalyticsView,
  scopeFilterOnly,
  setAnalyticsViewSubscription,
  updateAnalyticsView,
  type AnalyticsUserView,
} from "@/api/domains/analytics.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AnalyticsConfigCollapsible } from "@/features/analytics/components/AnalyticsConfigCollapsible";
import { EditAnalyticsViewModal } from "@/features/analytics/components/EditAnalyticsViewModal";
import { IsolationUsageReportLayout } from "@/features/analytics/components/IsolationUsageReportLayout";
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
  migrateAnalyticsFilter,
  type AnalyticsDraftFilter,
} from "@/features/analytics/analyticsPipelineFilter";
import { useGroupedAuditLogs } from "@/features/analytics/hooks/useGroupedAuditLogs";
import { cn } from "@/lib/utils";

const REPORT_KEY = "isolation_usage";

export function IsolationUsageReportPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AnalyticsDraftFilter>(() => defaultAnalyticsDraftFilter());
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editView, setEditView] = useState<AnalyticsUserView | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [insightDialog, setInsightDialog] = useState<InsightDialogTarget | null>(null);
  const [shareModal, setShareModal] = useState<"create" | "import" | null>(null);

  const { data: views = [] } = useQuery({
    queryKey: ["analytics", "views", REPORT_KEY],
    queryFn: () => fetchAnalyticsViews(REPORT_KEY),
  });

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId]
  );

  const { compareCycles, latestByCycle, grouped } = useGroupedAuditLogs(REPORT_KEY, activeView);

  const latestIdsByCycle = useMemo(
    () => new Set([...latestByCycle.values()].map((l) => l.id)),
    [latestByCycle]
  );

  const isHistoricalSelection =
    selectedLogId != null && !latestIdsByCycle.has(selectedLogId);

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

  const { data: historicalDetail, isLoading: historicalLoading, error: historicalError } = useQuery({
    queryKey: ["analytics", "audit-detail", "historical", selectedLogId],
    queryFn: () => fetchAuditLogDetail(selectedLogId!),
    enabled: isHistoricalSelection,
  });

  useEffect(() => {
    if (activeViewId == null && views.length > 0) {
      setActiveViewId(views[0].id);
    }
  }, [views, activeViewId]);

  useEffect(() => {
    setSelectedLogId(null);
  }, [activeViewId]);

  useEffect(() => {
    if (selectedLogId == null && latestByCycle.size > 0) {
      const first = [...latestByCycle.values()][0];
      if (first) setSelectedLogId(first.id);
    }
  }, [latestByCycle, activeViewId, selectedLogId]);

  const applyView = (v: AnalyticsUserView) => {
    setActiveViewId(v.id);
    setDraft(migrateAnalyticsFilter(v.filter as Record<string, unknown>));
    setSelectedLogId(null);
  };

  const handleSaveConfig = async (opts: SaveConfigOptions) => {
    try {
      const filter = scopeFilterOnly({ ...draft, compareCycles: opts.compareCycles });
      const created = await saveAnalyticsView({ reportKey: REPORT_KEY, name: opts.name, filter });
      let saved = created;
      if (opts.subscribe) {
        saved = await setAnalyticsViewSubscription(created.id, true, {
          backfillHistory: opts.backfillHistory,
          backfillUntil: opts.backfillUntil,
        });
      }
      qc.setQueryData<AnalyticsUserView[]>(["analytics", "views", REPORT_KEY], (prev) => [
        ...(prev ?? []),
        saved,
      ]);
      setActiveViewId(saved.id);
      setDraft(migrateAnalyticsFilter(saved.filter as Record<string, unknown>));
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
    filter: ReturnType<typeof scopeFilterOnly>,
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
        setDraft(migrateAnalyticsFilter(withSub.filter as Record<string, unknown>));
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
      <AnalyticsConfigCollapsible
        draft={draft}
        onDraftChange={setDraft}
        onSaveClick={() => setShowSaveModal(true)}
        defaultOpen={false}
      />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <aside
          className={cn(
            "w-full shrink-0 space-y-3 xl:w-72",
            "xl:sticky xl:top-20 xl:z-10 xl:self-start",
            "xl:max-h-[calc(100dvh-5rem)] xl:overflow-y-auto xl:overscroll-y-contain xl:pr-0.5",
            "[scrollbar-width:thin]"
          )}
        >
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
                    <button type="button" className="shrink-0 p-1 text-neutral-400" onClick={() => setEditView(v)}>
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
            latestIdsByCycle={latestIdsByCycle}
            onSelectLog={setSelectedLogId}
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
            onOpenInsight={openInsightDialog}
            viewName={activeView?.name}
          />

          {isHistoricalSelection ? (
            <section className="rounded-2xl border border-amber-200/80 bg-amber-50/30 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-amber-900">
                  历史期次明细 · {historicalDetail?.periodLabel ?? "…"}
                </h3>
                {selectedLogId != null ? (
                  <button
                    type="button"
                    onClick={(e) =>
                      openInsightDialog(selectedLogId, historicalDetail?.periodLabel ?? "", e)
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2.5 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    AI 解读
                  </button>
                ) : null}
              </div>
              {historicalLoading ? (
                <p className="text-sm text-neutral-500">加载中…</p>
              ) : historicalError ? (
                <p className="text-sm text-rose-700">{(historicalError as Error).message}</p>
              ) : historicalDetail ? (
                <>
                  <IsolationUsageReportLayout
                    report={historicalDetail}
                    fromSnapshot
                    periodLabel={historicalDetail.periodLabel}
                  />
                </>
              ) : null}
            </section>
          ) : null}
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
          void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY] });
        }}
      />

    </div>
  );
}
