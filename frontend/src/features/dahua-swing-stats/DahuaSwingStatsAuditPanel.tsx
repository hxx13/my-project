import { useMemo, useState } from "react";
import { Database, Plus, Play, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  defaultBackfillForm,
  defaultDailyForm,
  formatBackfillRangeLabel,
  isHistoricalTask,
  parsePeriodMode,
  parseBackfillFromTask,
  resolveStatsTaskDisplayCount,
  PERIOD_MODE_LABEL,
} from "@/features/dahua-swing-stats/statsTaskModel";
import { StatsTaskEditDrawer } from "@/features/dahua-swing-stats/StatsTaskEditDrawer";
import { runStatsTaskCleanIngestWithToast } from "@/features/dahua-swing-stats/statsTaskCleanIngest";
import {
  StatsTaskAutoCleanSettings,
  StatsTaskLastCleanHint,
} from "@/features/dahua-swing-stats/StatsTaskAutoCleanSettings";
import { useDahuaSwingStatsTasks } from "@/features/dahua-swing-stats/useDahuaSwingStatsTasks";
import { useSearchParams } from "react-router-dom";
import { fetchStatsTasksHealth, retryAllFailedStatsTasks, retryStatsTask } from "@/api/domains/dahuaSwingStats.api";
import { cn } from "@/lib/utils";

type Segment = "all" | "daily" | "backfill";

export function DahuaSwingStatsAuditPanel() {
  const [searchParams] = useSearchParams();
  const initialSegment = (searchParams.get("kind") as Segment) || "all";
  const [segment, setSegment] = useState<Segment>(
    initialSegment === "daily" || initialSegment === "backfill" ? initialSegment : "all"
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"daily" | "backfill">("daily");
  const [cleaningId, setCleaningId] = useState<number | null>(null);

  const qc = useQueryClient();

  const { data: health } = useQuery({
    queryKey: ["dahua-stats-tasks", "health"],
    queryFn: fetchStatsTasksHealth,
    refetchInterval: 60_000,
  });

  const retryAllMutation = useMutation({
    mutationFn: () => retryAllFailedStatsTasks(),
    onSuccess: (data) => {
      toast.success(`批量重试完成：${(data as any).succeeded}/${(data as any).total} 成功`);
      void qc.invalidateQueries({ queryKey: ["dahua-stats-tasks"] });
      void qc.invalidateQueries({ queryKey: ["dahua-stats-tasks", "health"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "批量重试失败"),
  });

  const dailyEd = useDahuaSwingStatsTasks("daily", defaultDailyForm);
  const backfillEd = useDahuaSwingStatsTasks("backfill", defaultBackfillForm);

  const ed = drawerMode === "backfill" ? backfillEd : dailyEd;

  const displayRows = useMemo(() => {
    if (segment === "daily") return dailyEd.rows;
    if (segment === "backfill") return backfillEd.rows;
    return [...dailyEd.rows, ...backfillEd.rows].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [segment, dailyEd.rows, backfillEd.rows]);

  const loading = dailyEd.loading || backfillEd.loading;

  const openNew = (mode: "daily" | "backfill") => {
    setDrawerMode(mode);
    if (mode === "backfill") {
      backfillEd.newForm();
    } else {
      dailyEd.newForm();
    }
    setDrawerOpen(true);
  };

  const openRow = (row: (typeof displayRows)[0]) => {
    const mode = row.periodMode === "HISTORICAL_RANGE" ? "backfill" : "daily";
    setDrawerMode(mode);
    if (mode === "backfill") {
      backfillEd.applyRowToForm(row);
    } else {
      dailyEd.applyRowToForm(row);
    }
    setDrawerOpen(true);
  };

  const runRow = (row: (typeof displayRows)[0]) => {
    if (row.periodMode === "HISTORICAL_RANGE") {
      return row.id ? backfillEd.runForceOverwrite(row.id) : undefined;
    }
    return row.id ? dailyEd.runByStrategy(row.id) : undefined;
  };

  const removeRow = (row: (typeof displayRows)[0]) => {
    if (row.periodMode === "HISTORICAL_RANGE") {
      return row.id ? backfillEd.remove(row.id) : undefined;
    }
    return row.id ? dailyEd.remove(row.id) : undefined;
  };

  const cleanIngestRow = async (row: (typeof displayRows)[0]) => {
    if (!row.id) return;
    setCleaningId(row.id);
    try {
      await runStatsTaskCleanIngestWithToast(row);
    } finally {
      setCleaningId(null);
    }
  };

  const [retryingId, setRetryingId] = useState<number | null>(null);

  const runRetry = async (id: number) => {
    setRetryingId(id);
    try {
      const result = await retryStatsTask(id);
      toast.success(`重试完成，入库 ${(result as any).saved ?? 0} 条`);
      void qc.invalidateQueries({ queryKey: ["dahua-stats-tasks"] });
      void qc.invalidateQueries({ queryKey: ["dahua-stats-tasks", "health"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重试失败");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="shrink-0 text-sm text-slate-500">
        <strong>日批</strong>：在{" "}
        <a href="#/console/admin/schedule-manager" className="text-indigo-700 underline">
          定时管理
        </a>{" "}
        配置「审计门禁·每日到点」后，每天自动拉取<strong>上一自然日</strong>在任务内配置的刷卡时刻段。
        </p>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {(
          [
            ["all", "全部"],
            ["daily", "日批（定时）"],
            ["backfill", "回溯（仅手动）"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`rounded-full px-3 py-1 text-xs border ${
              segment === k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600"
            }`}
            onClick={() => setSegment(k)}
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <AdminButton onClick={() => openNew("daily")}>
          <Plus className="h-4 w-4" />
          日批任务
        </AdminButton>
        <AdminButton tone="secondary" onClick={() => openNew("backfill")}>
          <Plus className="h-4 w-4" />
          回溯任务
        </AdminButton>
      </div>

      {health && health.failed > 0 ? (
        <div className="mb-3 flex shrink-0 items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-red-800">
              ⚠️ {health.failed} 个任务执行失败 · {health.ok} 个正常 · {health.neverRun} 个未运行
            </p>
            {health.recentFailures?.slice(0, 2).map(({ id, name, lastError }) => (
              <p key={id} className="text-xs text-red-600 mt-1">{name}: {lastError}</p>
            ))}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            onClick={() => retryAllMutation.mutate()}
            disabled={retryAllMutation.isPending}
          >
            {retryAllMutation.isPending ? "重试中…" : "一键重试全部"}
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <div className="admin-data-table-wrap h-full overflow-auto rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-left">类型</th>
                <th className="px-3 py-2 text-left">数据范围</th>
                <th className="px-3 py-2 text-left">上次拉取窗</th>
              <th className="px-3 py-2 text-left">条数</th>
              <th className="px-3 py-2 text-left">自动清洗</th>
              <th className="px-3 py-2 text-left">最近清洗</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  暂无审计拉取任务
                </td>
              </tr>
            ) : (
              displayRows.map((r) => (
                <tr key={r.id} className={cn("border-t cursor-pointer hover:bg-slate-50", r.lastStatus === 'FAILED' && "bg-red-50/50 border-l-2 border-l-red-400")} onClick={() => openRow(r)}>
                  <td className="px-3 py-2">
                    {r.name}
                    {r.enabled === 0 ? <span className="ml-1 text-rose-500">(停)</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {isHistoricalTask(r) ? "回溯（手动）" : "日批（可定时）"}
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    {isHistoricalTask(r)
                      ? formatBackfillRangeLabel(parseBackfillFromTask(r))
                      : PERIOD_MODE_LABEL[parsePeriodMode(r.periodMode)]}
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    {r.lastPulledStart && r.lastPulledEnd ? (
                      <>
                        {isHistoricalTask(r) ? (
                          <span className="text-slate-500">本段 </span>
                        ) : null}
                        {r.lastPulledStart}
                        <br />
                        {r.lastPulledEnd}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const c = resolveStatsTaskDisplayCount(r);
                      return (
                        <span title={isHistoricalTask(r) ? "记录库条数为权威；本段为最近一次执行入库数" : undefined}>
                          <strong>{c.primary}</strong>
                          {isHistoricalTask(r) && c.lastSegment !== c.primary ? (
                            <span className="block text-[10px] text-slate-500">本段 {c.lastSegment}</span>
                          ) : null}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {r.id ? <StatsTaskAutoCleanSettings statsTaskId={r.id} compact /> : "—"}
                  </td>
                  <td className="px-3 py-2">{r.id ? <StatsTaskLastCleanHint statsTaskId={r.id} /> : "—"}</td>
                  <td className="px-3 py-2">{r.lastStatus || "-"}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1">
                      {r.lastStatus === 'FAILED' ? (
                        <button
                          type="button"
                          title="重试最近一次失败"
                          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100"
                          disabled={retryingId === r.id}
                          onClick={() => r.id && void runRetry(r.id)}
                        >
                          {retryingId === r.id ? "重试中…" : "重试"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded border px-2 py-1 inline-flex items-center gap-1"
                        disabled={
                          dailyEd.runningId === r.id ||
                          backfillEd.runningId === r.id ||
                          cleaningId === r.id
                        }
                        onClick={() => r.id && void runRow(r)}
                      >
                        <Play className="h-3 w-3" />
                        {isHistoricalTask(r) ? "强制拉取" : "执行"}
                      </button>
                      <button
                        type="button"
                        title="按任务时间窗与已启用通道清洗并写入总库"
                        className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 inline-flex items-center gap-1 text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                        disabled={
                          !r.id ||
                          dailyEd.runningId === r.id ||
                          backfillEd.runningId === r.id ||
                          cleaningId === r.id ||
                          resolveStatsTaskDisplayCount(r).primary === 0
                        }
                        onClick={() => {
                          if (resolveStatsTaskDisplayCount(r).primary === 0) {
                            toast.error("请先执行至少一段拉取再清洗入库");
                            return;
                          }
                          void cleanIngestRow(r);
                        }}
                      >
                        <Database className="h-3 w-3" />
                        {cleaningId === r.id ? "入库中…" : "清洗入库"}
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-rose-600"
                        disabled={cleaningId === r.id}
                        onClick={() => r.id && void removeRow(r)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      <StatsTaskEditDrawer open={drawerOpen} onOpenChange={setDrawerOpen} ed={ed} mode={drawerMode} />
    </div>
  );
}
