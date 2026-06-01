import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Pencil, Plus, Settings2, Share2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  deleteAnalyticsView,
  fetchAnalyticsViews,
  fetchAuditLogDetail,
  fetchCageAuditProgress,
  generateAnalyticsLlmInsightBatch,
  saveAnalyticsView,
  setAnalyticsViewSubscription,
  updateAnalyticsView,
  type AnalyticsAuditLog,
  type AnalyticsUserView,
} from "@/api/domains/analytics.api";
import { CageAuditProgressBanner } from "@/features/analytics/components/CageAuditProgressBanner";
import { AdminFormCard } from "@/components/admin/AdminPageShell";

import { EditAnalyticsViewModal } from "@/features/analytics/components/EditAnalyticsViewModal";
import { CageOccupancyReportLayout } from "@/features/analytics/components/CageOccupancyReportLayout";
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
  cageScopeFilterOnly,
  defaultCageAnalyticsDraftFilter,
  migrateCageAnalyticsFilter,
  type CageAnalyticsDraftFilter,
} from "@/features/analytics/cageAnalyticsFilter";
import { useGroupedAuditLogs } from "@/features/analytics/hooks/useGroupedAuditLogs";
import { cn } from "@/lib/utils";

const REPORT_KEY = "cage_occupancy";

export function CageOccupancyReportPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CageAnalyticsDraftFilter>(() => defaultCageAnalyticsDraftFilter());
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [selectedLog, setSelectedLog] = useState<AnalyticsAuditLog | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editView, setEditView] = useState<AnalyticsUserView | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [insightDialog, setInsightDialog] = useState<InsightDialogTarget | null>(null);
  const [shareModal, setShareModal] = useState<"create" | "import" | null>(null);
  const [awaitingCageAudit, setAwaitingCageAudit] = useState(false);

  const { data: views = [] } = useQuery({
    queryKey: ["analytics", "views", REPORT_KEY],
    queryFn: () => fetchAnalyticsViews(REPORT_KEY),
  });

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId]
  );

  const { compareCycles, latestByCycle, grouped } = useGroupedAuditLogs(REPORT_KEY, activeView);

  const { data: cageAuditProgress } = useQuery({
    queryKey: ["analytics", "cage-audit-progress", activeViewId],
    queryFn: () => fetchCageAuditProgress(activeViewId!),
    enabled: activeViewId != null && (awaitingCageAudit || activeView?.subscribed === true),
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      return awaitingCageAudit || st === "running" ? 1500 : false;
    },
  });

  const snapshotsReady = useMemo(() => {
    if (compareCycles.length === 0) return false;
    return compareCycles.every((c) => latestByCycle.has(c));
  }, [compareCycles, latestByCycle]);

  useEffect(() => {
    if (!awaitingCageAudit) return;
    const st = cageAuditProgress?.status;
    if (snapshotsReady && (st === "done" || st === "idle" || st === "failed")) {
      setAwaitingCageAudit(false);
    }
  }, [awaitingCageAudit, cageAuditProgress?.status, snapshotsReady]);

  useEffect(() => {
    if (!awaitingCageAudit || activeViewId == null) return;
    const timer = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY, activeViewId] });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [awaitingCageAudit, activeViewId, qc]);

  const showCageAuditProgress =
    awaitingCageAudit ||
    cageAuditProgress?.status === "running" ||
    (awaitingCageAudit && !snapshotsReady && cageAuditProgress?.status === "done");

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
    setDraft(migrateCageAnalyticsFilter(v.filter as Record<string, unknown>));
    setSelectedLogId(null);
  };

  const handleSaveConfig = async (opts: SaveConfigOptions) => {
    try {
      const filter = cageScopeFilterOnly({ ...draft, compareCycles: opts.compareCycles });
      if (opts.isPublic) {
        (filter as any).isPublic = true;
      }
      const created = await saveAnalyticsView({ reportKey: REPORT_KEY, name: opts.name, filter });
      let saved = created;
      if (opts.subscribe) {
        saved = await setAnalyticsViewSubscription(created.id, true);
      }
      qc.setQueryData<AnalyticsUserView[]>(["analytics", "views", REPORT_KEY], (prev) => [
        ...(prev ?? []),
        saved,
      ]);
      setActiveViewId(saved.id);
      setDraft(migrateCageAnalyticsFilter(saved.filter as Record<string, unknown>));
      if (opts.subscribe) {
        setAwaitingCageAudit(true);
        void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY] });
        void qc.invalidateQueries({ queryKey: ["analytics", "cage-audit-progress", saved.id] });
      }
      toast.success(opts.subscribe ? "已保存并订阅，正在拉取笼架数据…" : "已保存", { duration: 5000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleUpdateView = async (
    id: number,
    name: string,
    filter: Record<string, unknown>,
    subscribed: boolean
  ) => {
    try {
      const updated = await updateAnalyticsView(id, { name, filter, reportKey: REPORT_KEY });
      const withSub =
        updated.subscribed !== subscribed
          ? await setAnalyticsViewSubscription(id, subscribed)
          : updated;
      qc.setQueryData<AnalyticsUserView[]>(["analytics", "views", REPORT_KEY], (prev) =>
        (prev ?? []).map((v) => (v.id === id ? withSub : v))
      );
      if (activeViewId === id) {
        setDraft(migrateCageAnalyticsFilter(withSub.filter as Record<string, unknown>));
      }
      if (subscribed) {
        setAwaitingCageAudit(true);
        void qc.invalidateQueries({ queryKey: ["analytics", "cage-audit-progress", id] });
      }
      void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY] });
      setEditView(null);
      toast.success(subscribed ? "配置已更新，正在拉取笼架数据…" : "配置已更新");
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
      if (updated.subscribed) {
        setAwaitingCageAudit(true);
        void qc.invalidateQueries({ queryKey: ["analytics", "cage-audit-progress", v.id] });
      } else {
        setAwaitingCageAudit(false);
      }
      void qc.invalidateQueries({ queryKey: ["analytics", "audit-logs", REPORT_KEY] });
      toast.success(updated.subscribed ? "已开启订阅，正在拉取笼架数据…" : "已取消订阅");
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
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 shadow-sm hover:bg-violet-100"
        onClick={() => setShowSaveModal(true)}
      >
        <Plus className="h-4 w-4" />
        新增配置
      </button>


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
          <CageAuditProgressBanner
            progress={cageAuditProgress}
            visible={showCageAuditProgress}
          />
          <LatestSnapshotsDashboard
            compareCycles={compareCycles}
            latestByCycle={latestByCycle}
            grouped={grouped}
            selectedLogId={selectedLogId}
            selectedLog={selectedLog}
            onOpenInsight={openInsightDialog}
            viewName={activeView?.name}
            metricUnit="笼位"
          />
        </main>
      </div>

      <SaveAnalyticsConfigModal
        open={showSaveModal}
        initialCompareCycles={draft.compareCycles}
        enableHistoryBackfill={false}
        subscribeHint="保存后立即订阅：抓取当前日/周/月笼架快照并自动环比（无历史回溯）"
        onClose={() => setShowSaveModal(false)}
        onConfirm={handleSaveConfig}
      />

      <EditAnalyticsViewModal
        reportKey={REPORT_KEY}
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
