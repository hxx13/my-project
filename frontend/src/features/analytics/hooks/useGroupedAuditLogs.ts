import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAnalyticsAuditLogs, type AnalyticsAuditLog } from "@/api/domains/analytics.api";
import {
  COMPARE_CYCLE_OPTIONS,
  migrateAnalyticsFilter,
  type AnalyticsCompareCycle,
} from "@/features/analytics/analyticsPipelineFilter";
import type { AnalyticsUserView } from "@/api/domains/analytics.api";

export function useGroupedAuditLogs(reportKey: string, view: AnalyticsUserView | null) {
  const viewId = view?.id ?? null;
  const compareCycles = useMemo(() => {
    if (!view) return [] as AnalyticsCompareCycle[];
    const f = migrateAnalyticsFilter(view.filter as Record<string, unknown>);
    return f.compareCycles;
  }, [view]);

  const query = useQuery({
    queryKey: ["analytics", "audit-logs", reportKey, viewId],
    queryFn: () => fetchAnalyticsAuditLogs({ reportKey, viewId: viewId ?? undefined, limit: 200 }),
    enabled: viewId != null,
    staleTime: 15_000,
    refetchInterval: view?.subscribed ? 20_000 : false,
  });

  const grouped = useMemo(() => {
    const allowed = new Set(compareCycles);
    const deduped = new Map<string, AnalyticsAuditLog>();
    for (const log of query.data ?? []) {
      if (viewId != null && log.viewId !== viewId) continue;
      if (allowed.size && !allowed.has(log.periodType as AnalyticsCompareCycle)) continue;
      const key = `${log.periodType}:${log.periodLabel}`;
      const prev = deduped.get(key);
      if (!prev || new Date(log.createdAt) > new Date(prev.createdAt)) {
        deduped.set(key, log);
      }
    }
    const byType = new Map<AnalyticsCompareCycle, AnalyticsAuditLog[]>();
    for (const log of deduped.values()) {
      const pt = log.periodType as AnalyticsCompareCycle;
      const list = byType.get(pt) ?? [];
      list.push(log);
      byType.set(pt, list);
    }
    for (const list of byType.values()) {
      list.sort((a, b) => b.periodLabel.localeCompare(a.periodLabel));
    }
    return byType;
  }, [query.data, viewId, compareCycles]);

  const latestByCycle = useMemo(() => {
    const map = new Map<AnalyticsCompareCycle, AnalyticsAuditLog>();
    for (const opt of COMPARE_CYCLE_OPTIONS) {
      if (!compareCycles.includes(opt.value)) continue;
      const first = grouped.get(opt.value)?.[0];
      if (first) map.set(opt.value, first);
    }
    return map;
  }, [grouped, compareCycles]);

  return {
    compareCycles,
    grouped,
    latestByCycle,
    isLoading: query.isLoading,
    logs: query.data ?? [],
  };
}
