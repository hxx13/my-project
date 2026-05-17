import { useQueries } from "@tanstack/react-query";
import {
  fetchAnalyticsLlmInsight,
  fetchAuditLogDetail,
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
  onOpenInsight: (auditLogId: number, periodLabel: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  viewName?: string;
};

export function LatestSnapshotsDashboard({
  compareCycles,
  latestByCycle,
  grouped,
  onOpenInsight,
  viewName,
}: Props) {
  const entries = COMPARE_CYCLE_OPTIONS.filter((o) => compareCycles.includes(o.value) && latestByCycle.has(o.value)).map(
    (o) => ({
      cycle: o.value,
      hint: o.hint,
      log: latestByCycle.get(o.value)!,
    })
  );

  const detailQueries = useQueries({
    queries: entries.map(({ log }) => ({
      queryKey: ["analytics", "audit-detail", "latest", log.id],
      queryFn: () => fetchAuditLogDetail(log.id),
      staleTime: 60_000,
    })),
  });

  const insightQueries = useQueries({
    queries: entries.map(({ log }) => ({
      queryKey: ["analytics", "llm-insight", log.id],
      queryFn: () => fetchAnalyticsLlmInsight(log.id, false),
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
        <h2 className="text-base font-bold text-neutral-900">各分类最新快照分析</h2>
        <p className="text-xs text-neutral-500">默认展示每日 / 每周 / 每月各最近一期，侧重环比差异与趋势</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-1 2xl:grid-cols-1">
        {entries.map(({ cycle, hint, log }, idx) => {
          const q = detailQueries[idx];
          const insightQ = insightQueries[idx];
          const hasCachedInsight = Boolean(insightQ.data?.exists);
          return (
            <CategorySnapshotAnalysisCard
              key={cycle}
              cycle={cycle}
              hint={hint}
              log={log}
              historyLogs={grouped?.get(cycle) ?? []}
              detail={q.data}
              loading={q.isLoading}
              error={q.error as Error | null}
              hasCachedInsight={hasCachedInsight}
              onOpenInsight={(e) => onOpenInsight(log.id, log.periodLabel, e)}
            />
          );
        })}
      </div>
    </div>
  );
}
