import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsAuditLog, IsolationUsageQueryResult } from "@/api/domains/analytics.api";
import { MeasuredChartBox } from "@/features/analytics/components/MeasuredChartBox";
import { PeriodTrendBarChart } from "@/features/analytics/components/PeriodTrendBarChart";
import type { AnalyticsCompareCycle } from "@/features/analytics/analyticsPipelineFilter";
import { buildPeriodTrendChart } from "@/features/analytics/periodTrendChartData";
import { cn } from "@/lib/utils";

const CYCLE_TITLE: Record<AnalyticsCompareCycle, string> = {
  day: "每日清算",
  week: "每周清算",
  month: "每月清算",
};

type Props = {
  cycle: AnalyticsCompareCycle;
  hint: string;
  log: AnalyticsAuditLog;
  historyLogs: AnalyticsAuditLog[];
  detail?: IsolationUsageQueryResult;
  loading?: boolean;
  error?: Error | null;
  hasCachedInsight?: boolean;
  onOpenInsight?: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

export function CategorySnapshotAnalysisCard({
  cycle,
  hint,
  log,
  historyLogs = [],
  detail,
  loading,
  error,
  hasCachedInsight,
  onOpenInsight,
}: Props) {
  const [compareExpanded, setCompareExpanded] = useState(false);
  const [topGroupsExpanded, setTopGroupsExpanded] = useState(false);

  const delta = log.deltaRounds;
  const pct = log.deltaPct;
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const trendLabel = trend === "up" ? "较上期增加" : trend === "down" ? "较上期减少" : "与上期持平";

  const safeHistory = historyLogs ?? [];
  const trendMeta = useMemo(() => buildPeriodTrendChart(cycle, safeHistory), [cycle, safeHistory]);

  const compareChart = [
    { name: "上期", value: log.previousRounds, fill: "#cbd5e1" },
    { name: "本期", value: log.currentRounds, fill: trend === "up" ? "#10b981" : trend === "down" ? "#f43f5e" : "#7c6cf0" },
  ];

  const groups = detail?.byProjectGroup ?? [];
  const topGroups = groups.slice(0, 8).map((g) => ({
    name: g.groupName.length > 12 ? `${g.groupName.slice(0, 12)}…` : g.groupName,
    fullName: g.groupName,
    personTimes: g.personTimes,
  }));

  const summary = detail?.summary;
  const topGroupsChartHeight = Math.min(200, Math.max(80, topGroups.length * 28));

  return (
    <article className="flex flex-col rounded-2xl border border-neutral-200/90 bg-white shadow-sm transition">
      <header className="relative border-b border-neutral-100 bg-gradient-to-b from-violet-50/90 to-white px-4 py-5 text-center">
        {onOpenInsight ? (
          <button
            type="button"
            onClick={onOpenInsight}
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2 py-1 text-[10px] font-semibold text-violet-800 shadow-sm hover:bg-violet-50"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            AI 解读
            {hasCachedInsight ? (
              <span className="ml-0.5 rounded-full bg-emerald-100 px-1 text-[9px] font-medium text-emerald-700">
                已解读
              </span>
            ) : null}
          </button>
        ) : null}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
          {CYCLE_TITLE[cycle]} · 最新快照
        </p>
        <h3 className="mt-2 text-2xl font-black leading-tight tracking-tight text-neutral-900 sm:text-3xl">
          {hint}
        </h3>
        <p className="mt-1.5 text-lg font-bold tabular-nums text-violet-800 sm:text-xl">{log.periodLabel}</p>
      </header>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          <TrendCompareCard trend={trend} trendLabel={trendLabel} delta={delta} pct={pct} />
          <PeriodRoundsCard previousRounds={log.previousRounds} currentRounds={log.currentRounds} />
          <ScopeSummaryCard
            uniqueGroups={summary?.uniqueGroups}
            uniqueUsers={summary?.uniqueUsers}
            loading={loading}
            error={error}
          />
        </div>

        <PeriodTrendBarChart cycle={cycle} meta={trendMeta} />

        <div className="rounded-lg border border-neutral-200/90 bg-neutral-50/50">
          <button
            type="button"
            onClick={() => setCompareExpanded((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-neutral-600 hover:bg-neutral-100/80"
          >
            {compareExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-violet-600" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            本期 vs 上期简图
            <span className="font-normal text-neutral-400">（点击展开）</span>
          </button>
          {compareExpanded ? (
            <div className="border-t border-neutral-200/80 px-3 pb-3 pt-2">
              <MeasuredChartBox height={128}>
                <BarChart data={compareChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
                  <Tooltip formatter={(v) => [`${v} 人次`, ""]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={48}>
                    {compareChart.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </MeasuredChartBox>
            </div>
          ) : null}
        </div>

        {detail && topGroups.length > 0 ? (
          <div className="rounded-lg border border-neutral-200/90 bg-neutral-50/50">
            <button
              type="button"
              onClick={() => setTopGroupsExpanded((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-neutral-600 hover:bg-neutral-100/80"
            >
              {topGroupsExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-violet-600" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              课题组人次 Top（本期）
              {!topGroupsExpanded ? (
                <span className="font-normal text-neutral-400">（点击展开）</span>
              ) : null}
            </button>
            {topGroupsExpanded ? (
              <div className="border-t border-neutral-200/80 px-3 pb-3 pt-2">
                <MeasuredChartBox height={topGroupsChartHeight}>
                  <BarChart layout="vertical" data={topGroups} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(v) => [Number(v ?? 0), "人次"]}
                      labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ""}
                    />
                    <Bar dataKey="personTimes" fill="#7c6cf0" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </MeasuredChartBox>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

type TrendKind = "up" | "down" | "flat";

function TrendCompareCard({
  trend,
  trendLabel,
  delta,
  pct,
}: {
  trend: TrendKind;
  trendLabel: string;
  delta: number;
  pct: number | null | undefined;
}) {
  const cardClass =
    trend === "up"
      ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100/80"
      : trend === "down"
        ? "border-rose-300 bg-gradient-to-br from-rose-50 to-rose-100/80"
        : "border-neutral-200 bg-gradient-to-br from-neutral-50 to-neutral-100/80";

  const valueClass =
    trend === "up" ? "text-emerald-700" : trend === "down" ? "text-rose-700" : "text-neutral-700";

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <div className={cn("flex min-h-[5.5rem] flex-col justify-center rounded-xl border px-2.5 py-2 shadow-sm", cardClass)}>
      <div className="flex items-center justify-center gap-1">
        <TrendIcon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            trend === "up" ? "text-emerald-600" : trend === "down" ? "text-rose-600" : "text-neutral-500"
          )}
        />
        <p className="text-[10px] font-medium text-neutral-600">较上期环比</p>
      </div>
      <p className={cn("mt-1 text-center text-[11px] font-bold leading-tight", valueClass)}>{trendLabel}</p>
      <p className={cn("mt-0.5 text-center text-lg font-black tabular-nums leading-none", valueClass)}>
        {delta > 0 ? "+" : ""}
        {delta}
        {pct != null ? (
          <span className="ml-0.5 text-xs font-bold">
            ({pct > 0 ? "+" : ""}
            {pct}%)
          </span>
        ) : null}
      </p>
    </div>
  );
}

function PeriodRoundsCard({
  previousRounds,
  currentRounds,
}: {
  previousRounds: number;
  currentRounds: number;
}) {
  return (
    <div className="flex min-h-[5.5rem] flex-col justify-center rounded-xl border border-violet-200 bg-violet-50/90 px-2.5 py-2 text-center shadow-sm">
      <p className="text-[10px] font-medium text-violet-700/80">上期 / 本期（人次）</p>
      <p className="mt-1.5 flex items-baseline justify-center gap-1 tabular-nums leading-none">
        <span className="text-lg font-bold text-slate-600">{previousRounds}</span>
        <span className="text-sm font-medium text-violet-400">/</span>
        <span className="text-xl font-black text-violet-900">{currentRounds}</span>
      </p>
      <p className="mt-1 text-[9px] text-violet-600/70">左上期 · 右本期</p>
    </div>
  );
}

function ScopeSummaryCard({
  uniqueGroups,
  uniqueUsers,
  loading,
  error,
}: {
  uniqueGroups?: number;
  uniqueUsers?: number;
  loading?: boolean;
  error?: Error | null;
}) {
  return (
    <div className="flex min-h-[5.5rem] flex-col justify-center rounded-xl border border-neutral-200 bg-neutral-50/90 px-2.5 py-2 text-center shadow-sm">
      <p className="text-[10px] font-medium text-neutral-500">本期规模</p>
      {loading ? (
        <p className="mt-2 text-xs text-neutral-400">加载中…</p>
      ) : error ? (
        <p className="mt-2 text-[10px] leading-snug text-rose-600">加载失败</p>
      ) : (
        <div className="mt-1.5 flex items-center justify-center gap-3 tabular-nums">
          <div>
            <p className="text-[9px] text-neutral-500">课题组</p>
            <p className="text-lg font-black text-neutral-900">{uniqueGroups ?? "—"}</p>
          </div>
          <span className="text-neutral-300">·</span>
          <div>
            <p className="text-[9px] text-neutral-500">涉及人数</p>
            <p className="text-lg font-black text-neutral-900">{uniqueUsers ?? "—"}</p>
          </div>
        </div>
      )}
    </div>
  );
}


