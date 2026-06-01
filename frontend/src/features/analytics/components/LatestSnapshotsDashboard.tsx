import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  fetchAnalyticsLlmInsight,
  fetchAuditLogDetail,
  fetchInsightDataPackage,
  type AnalyticsAuditLog,
} from "@/api/domains/analytics.api";
import { CategorySnapshotAnalysisCard } from "@/features/analytics/components/CategorySnapshotAnalysisCard";
import {
  COMPARE_CYCLE_OPTIONS,
  type AnalyticsCompareCycle,
} from "@/features/analytics/analyticsPipelineFilter";

type Props = {
  compareCycles: AnalyticsCompareCycle[];
  latestByCycle: Map<AnalyticsCompareCycle, AnalyticsAuditLog>;
  grouped: Map<AnalyticsCompareCycle, AnalyticsAuditLog[]>;
  selectedLogId: number | null;
  selectedLog: AnalyticsAuditLog | null;
  onOpenInsight: (auditLogId: number, periodLabel: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  viewName?: string;
  metricUnit?: string;
};

export function LatestSnapshotsDashboard({
  compareCycles,
  latestByCycle,
  grouped,
  selectedLogId,
  selectedLog,
  onOpenInsight,
  viewName,
  metricUnit = "人次",
}: Props) {
  const entries = useMemo(
    () =>
      COMPARE_CYCLE_OPTIONS.filter((o) => compareCycles.includes(o.value) && latestByCycle.has(o.value)).map((o) => {
        const cycle = o.value;
        const latest = latestByCycle.get(cycle)!;
        const displayLog =
          selectedLog != null && selectedLog.periodType === cycle ? selectedLog : latest;
        return {
          cycle,
          hint: o.hint,
          log: displayLog,
          isViewingHistorical: displayLog.id !== latest.id,
        };
      }),
    [compareCycles, latestByCycle, selectedLog]
  );

  const detailQueries = useQueries({
    queries: entries.map(({ log }) => ({
      queryKey: ["analytics", "audit-detail", log.id],
      queryFn: () => fetchAuditLogDetail(log.id),
      staleTime: 5 * 60 * 1000, // 5 min cache — explicit invalidateQueries on click handles freshness
    })),
  });

  const insightQueries = useQueries({
    queries: entries.map(({ log }) => ({
      queryKey: ["analytics", "llm-insight", log.id],
      queryFn: () => fetchAnalyticsLlmInsight(log.id, false),
      staleTime: 120_000,
    })),
  });

  useQueries({
    queries: entries.map(({ log }) => ({
      queryKey: ["analytics", "insight-data-package", log.id],
      queryFn: () => fetchInsightDataPackage(log.id),
      staleTime: 120_000,
    })),
  });

  if (entries.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50 p-8">
        <p className="max-w-sm text-center text-sm text-neutral-500">
          {viewName ? `「${viewName}」` : "当前配置"}暂无清算快照；订阅后将在此展示各分类最新一期的趋势分析
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-base font-bold text-neutral-900">各分类快照分析</h2>
        <p className="text-xs text-neutral-500">
          左侧选择清算记录可切换右侧图表；未选时展示各周期最新一期
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-1 2xl:grid-cols-1">
        {entries.map(({ cycle, hint, log, isViewingHistorical }, idx) => {
          const q = detailQueries[idx];
          const insightQ = insightQueries[idx];
          const hasCachedInsight = Boolean(insightQ.data?.exists);
          return (
            <CategorySnapshotAnalysisCard
              key={`${cycle}-${log.id}`}
              cycle={cycle}
              hint={hint}
              log={log}
              historyLogs={grouped?.get(cycle) ?? []}
              highlightPeriodKey={log.periodLabel}
              viewingHistorical={isViewingHistorical}
              detail={q.data}
              loading={q.isLoading}
              error={q.error as Error | null}
              hasCachedInsight={hasCachedInsight}
              metricUnit={metricUnit}
              onOpenInsight={(e) => onOpenInsight(log.id, log.periodLabel, e)}
            />
          );
        })}
      </div>
    </div>
  );
}
