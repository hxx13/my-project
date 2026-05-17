import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Star } from "lucide-react";
import type { AnalyticsAuditLog } from "@/api/domains/analytics.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import {
  COMPARE_CYCLE_OPTIONS,
  type AnalyticsCompareCycle,
} from "@/features/analytics/analyticsPipelineFilter";
import type { AnalyticsUserView } from "@/api/domains/analytics.api";
import { useGroupedAuditLogs } from "@/features/analytics/hooks/useGroupedAuditLogs";
import { cn } from "@/lib/utils";

const PERIOD_COMPARE_LABEL: Record<string, string> = {
  day: "每日",
  week: "每周",
  month: "每月",
};

const RECENT_PREVIEW_COUNT = 3;

type Props = {
  reportKey: string;
  view: AnalyticsUserView | null;
  selectedLogId: number | null;
  latestIdsByCycle: Set<number>;
  onSelectLog: (id: number) => void;
};

export function SettlementRecordsPanel({
  reportKey,
  view,
  selectedLogId,
  latestIdsByCycle,
  onSelectLog,
}: Props) {
  const { compareCycles, grouped, isLoading } = useGroupedAuditLogs(reportKey, view);
  const [showAllInSection, setShowAllInSection] = useState<Record<AnalyticsCompareCycle, boolean>>({
    day: false,
    week: false,
    month: false,
  });

  const toggleShowAll = (cycle: AnalyticsCompareCycle) => {
    setShowAllInSection((prev) => ({ ...prev, [cycle]: !prev[cycle] }));
  };

  if (!view) {
    return (
      <AdminFormCard title="清算记录">
        <p className="text-xs text-neutral-400">请先选择左侧配置</p>
      </AdminFormCard>
    );
  }

  if (!view.subscribed) {
    return (
      <AdminFormCard title="清算记录">
        <p className="text-xs text-neutral-400">开启订阅后，系统将按配置每日自动清算并生成记录</p>
      </AdminFormCard>
    );
  }

  if (isLoading) {
    return (
      <AdminFormCard title="清算记录">
        <p className="text-xs text-neutral-400">加载中…</p>
      </AdminFormCard>
    );
  }

  const hasAny = grouped.size > 0;

  return (
    <AdminFormCard title="清算记录">
      {!hasAny ? (
        <p className="text-xs text-neutral-400">暂无记录；订阅后每日凌晨自动清算</p>
      ) : (
        <div className="space-y-4">
          {COMPARE_CYCLE_OPTIONS.filter((o) => compareCycles.includes(o.value)).map((opt) => {
            const items = grouped.get(opt.value) ?? [];
            if (!items.length) return null;
            return (
              <RecordSection
                key={opt.value}
                label={PERIOD_COMPARE_LABEL[opt.value] ?? opt.label}
                hint={opt.hint}
                items={items}
                showAll={showAllInSection[opt.value] === true}
                selectedLogId={selectedLogId}
                latestIdsByCycle={latestIdsByCycle}
                onToggleShowAll={() => toggleShowAll(opt.value)}
                onSelectLog={onSelectLog}
              />
            );
          })}
        </div>
      )}
    </AdminFormCard>
  );
}

function RecordSection({
  label,
  hint,
  items,
  showAll,
  selectedLogId,
  latestIdsByCycle,
  onToggleShowAll,
  onSelectLog,
}: {
  label: string;
  hint: string;
  items: AnalyticsAuditLog[];
  showAll: boolean;
  selectedLogId: number | null;
  latestIdsByCycle: Set<number>;
  onToggleShowAll: () => void;
  onSelectLog: (id: number) => void;
}) {
  const hasMore = items.length > RECENT_PREVIEW_COUNT;
  const preview = items.slice(0, RECENT_PREVIEW_COUNT);
  const extra = items.slice(RECENT_PREVIEW_COUNT);

  return (
    <section className="rounded-lg border border-neutral-200/90 bg-neutral-50/60">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200/80 px-2.5 py-2">
        <h4 className="text-xs font-semibold text-violet-800">
          {label}
          <span className="ml-1 font-normal text-neutral-400">({hint})</span>
        </h4>
        <span className="shrink-0 text-[10px] tabular-nums text-neutral-500">共 {items.length} 条</span>
      </div>

      <ul className="space-y-1.5 p-2">
        {preview.map((log, idx) => (
          <RecordRow
            key={log.id}
            log={log}
            isLatest={latestIdsByCycle.has(log.id)}
            isFirst={idx === 0}
            active={selectedLogId === log.id}
            onClick={() => onSelectLog(log.id)}
          />
        ))}
      </ul>

      {hasMore && showAll ? (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto border-t border-neutral-200/80 p-2 pt-1.5 [scrollbar-width:thin]">
          {extra.map((log) => (
            <RecordRow
              key={log.id}
              log={log}
              isLatest={latestIdsByCycle.has(log.id)}
              active={selectedLogId === log.id}
              onClick={() => onSelectLog(log.id)}
            />
          ))}
        </ul>
      ) : null}

      {hasMore ? (
        <div className="border-t border-neutral-200/80 px-2 py-1.5">
          <button
            type="button"
            onClick={onToggleShowAll}
            className="w-full rounded-md py-1.5 text-center text-[10px] font-medium text-violet-600 hover:bg-violet-50"
          >
            {showAll ? "收起更早记录" : `展开更多（${extra.length} 条）`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RecordRow({
  log,
  active,
  isLatest,
  isFirst,
  onClick,
}: {
  log: AnalyticsAuditLog;
  active: boolean;
  isLatest?: boolean;
  isFirst?: boolean;
  onClick: () => void;
}) {
  const delta = log.deltaRounds;
  const TrendIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const trendColor = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-neutral-500";

  return (
    <li className="list-none">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full rounded-lg border px-2.5 py-2 text-left text-xs transition",
          active
            ? "border-violet-400 bg-violet-50 shadow-sm"
            : isLatest
              ? "border-violet-200 bg-violet-50/40 hover:border-violet-300"
              : "border-neutral-200 bg-white hover:border-violet-200"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 font-semibold text-neutral-800">
            {isFirst && isLatest ? <Star className="h-3 w-3 shrink-0 fill-violet-500 text-violet-500" /> : null}
            <span className="truncate">{log.periodLabel}</span>
            {isLatest ? (
              <span className="shrink-0 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-medium text-violet-700">
                右侧展示
              </span>
            ) : null}
          </span>
          <span className={cn("inline-flex shrink-0 items-center gap-0.5 tabular-nums font-semibold", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        </div>
        <div className="mt-1 flex justify-between tabular-nums text-neutral-600">
          <span>{log.currentRounds} 人次</span>
          <span className="text-neutral-400">上期 {log.previousRounds}</span>
        </div>
      </button>
    </li>
  );
}
