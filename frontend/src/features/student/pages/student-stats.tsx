import { useState, Fragment } from "react";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Building2,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentStats } from "../hooks/use-student-stats";
import type { StatsData } from "../api/student.api";
import {
  BarChart,
  StatPanel,
  EmptyState,
  ErrorRetry,
  Skeleton,
} from "../components/ui";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PERIODS = [
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "90d", label: "近 90 天" },
] as const;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** Pill-style period toggle button */
function PeriodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 text-[13px] rounded-[var(--student-radius-full)] transition-colors font-medium",
        active
          ? "bg-[var(--student-primary)] text-white shadow-sm"
          : "bg-white text-[var(--student-mute-foreground)] hover:bg-[var(--student-mute)] border border-[var(--student-hairline)]",
      )}
    >
      {children}
    </button>
  );
}

/** Vertical divider line used between summary stats */
function Divider() {
  return (
    <div
      className="w-px h-8 bg-[var(--student-hairline)] shrink-0"
      aria-hidden="true"
    />
  );
}

/** A single stat item in the summary bar */
function StatItem({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="shrink-0">
      <span className="text-[11px] text-[var(--student-mute-foreground)]">
        {label}
      </span>
      <div className="mt-0.5">
        <span className="text-lg font-bold text-[var(--student-ink)] tabular-nums">
          {value.toLocaleString()}
        </span>
        <span className="ml-1 text-[11px] text-[var(--student-mute-foreground)]">
          {unit}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function StatsSkeleton() {
  return (
    <div className="p-6 min-h-full">
      {/* Period buttons skeleton */}
      <div className="flex items-center gap-2 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            className="h-8 w-20 rounded-[var(--student-radius-full)]"
          />
        ))}
      </div>

      {/* Summary bar skeleton */}
      <div className="flex items-center gap-8 bg-white rounded-xl px-6 py-5 shadow-sm mb-4 flex-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <Fragment key={i}>
            {i > 0 && <Divider />}
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-16" />
            </div>
          </Fragment>
        ))}
      </div>

      {/* Two-column charts skeleton */}
      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-3">
          <Skeleton variant="rectangular" className="h-[220px] rounded-[var(--student-radius-md)]" />
          <Skeleton variant="rectangular" className="h-[180px] rounded-[var(--student-radius-md)]" />
        </div>
        <div className="w-[320px] flex flex-col gap-3">
          <Skeleton variant="rectangular" className="h-[200px] rounded-[var(--student-radius-md)]" />
          <Skeleton variant="rectangular" className="h-[160px] rounded-[var(--student-radius-md)]" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function StudentStatsPage() {
  const [period, setPeriod] = useState<string>("30d");
  const { data, isLoading, isError, error, refetch } = useStudentStats(period);

  /* ---- loading ---- */
  if (isLoading) return <StatsSkeleton />;

  /* ---- error ---- */
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <ErrorRetry
          message={
            error instanceof Error ? error.message : "加载统计数据失败"
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  /* ---- guard ---- */
  if (!data) return null;

  /* ---- empty: data accumulating (< 7 days) ---- */
  if (data.period.days < 7) {
    return (
      <div className="p-6 min-h-full">
        {/* Period buttons still available */}
        <div className="flex items-center gap-2 mb-4">
          {PERIODS.map((p) => (
            <PeriodButton
              key={p.key}
              active={period === p.key}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </PeriodButton>
          ))}
        </div>

        <EmptyState
          icon={BarChart3}
          title="数据积累中"
          description="至少需要 7 天进出记录才能生成统计，请耐心等待数据积累"
        />
      </div>
    );
  }

  /* ---- normal ---- */
  const { summary, dailyTrend, hourlyDistribution, roomDistribution, avgStayDuration } = data;

  const dailyTrendData = dailyTrend.map((d) => ({
    label: d.date.slice(5), // "MM-DD"
    value: d.count,
  }));

  const hourlyData = hourlyDistribution.map((d) => ({
    label: d.bucket,
    value: d.count,
  }));

  return (
    <div className="p-6 min-h-full">
      {/* ============================================================ */}
      {/* Period selector                                                */}
      {/* ============================================================ */}
      <div className="flex items-center gap-2 mb-4">
        {PERIODS.map((p) => (
          <PeriodButton
            key={p.key}
            active={period === p.key}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </PeriodButton>
        ))}
      </div>

      {/* ============================================================ */}
      {/* Summary bar                                                    */}
      {/* ============================================================ */}
      <div className="flex items-center gap-8 bg-white rounded-xl px-6 py-5 shadow-sm mb-4 flex-wrap">
        {/* Period range */}
        <div className="shrink-0 flex items-center gap-2">
          <Calendar className="size-4 text-[var(--student-mute-foreground)] shrink-0" strokeWidth={1.5} />
          <div>
            <span className="text-[11px] text-[var(--student-mute-foreground)]">
              统计周期
            </span>
            <div className="mt-0.5 text-[13px] font-semibold text-[var(--student-ink)] tabular-nums">
              {data.period.start}
              <span className="mx-1 text-[var(--student-mute-foreground)] font-normal">~</span>
              {data.period.end}
            </div>
          </div>
        </div>

        <Divider />

        <StatItem label="总进出次数" value={summary.totalAccess} unit="次" />
        <Divider />
        <StatItem label="日均进出" value={summary.dailyAvg} unit="次/天" />
        <Divider />
        <StatItem label="出勤天数" value={summary.attendanceDays} unit="天" />
        <Divider />
        <StatItem label="涉及房间" value={summary.roomCount} unit="间" />
        <Divider />
        <StatItem label="违规记录" value={summary.violationCount} unit="次" />
      </div>

      {/* ============================================================ */}
      {/* Two-column layout                                              */}
      {/* ============================================================ */}
      <div className="flex gap-3">
        {/* Left column — charts */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <StatPanel title="进出趋势">
            <BarChart
              data={dailyTrendData}
              height={140}
              barColor="var(--student-primary)"
            />
          </StatPanel>

          <StatPanel title="时段分布">
            <BarChart
              data={hourlyData}
              height={100}
              barColor="var(--student-accent-telemetry)"
            />
          </StatPanel>
        </div>

        {/* Right column — distribution + duration */}
        <div className="w-[320px] shrink-0 flex flex-col gap-3">
          <StatPanel
            title="房间访问分布"
            isEmpty={roomDistribution.length === 0}
            emptyText="暂无房间访问数据"
          >
            {roomDistribution.map((r) => (
              <div key={r.roomName} className="flex items-center gap-2 mb-3 last:mb-0">
                <span className="text-[13px] text-[var(--student-foreground)] flex-1 truncate">
                  {r.roomName}
                </span>
                <span className="text-[11px] text-[var(--student-mute-foreground)] whitespace-nowrap tabular-nums">
                  {r.count}次
                </span>
                <span className="text-[11px] font-medium text-[var(--student-ink)] w-10 text-right tabular-nums">
                  {r.percentage}%
                </span>
                <div className="w-16 h-1.5 bg-[var(--student-mute)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--student-primary)] transition-all"
                    style={{ width: `${Math.min(r.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </StatPanel>

          <StatPanel
            title="平均在室时长"
            isEmpty={avgStayDuration.length === 0}
            emptyText="暂无在室时长数据"
          >
            {avgStayDuration.map((d) => (
              <div
                key={d.roomName}
                className="flex justify-between items-center text-[13px] mb-2 last:mb-0"
              >
                <span className="text-[var(--student-foreground)] truncate flex-1 min-w-0">
                  {d.roomName}
                </span>
                <span className="font-semibold text-[var(--student-ink)] ml-2 shrink-0 tabular-nums">
                  {d.durationMinutes} 分钟
                </span>
              </div>
            ))}
          </StatPanel>
        </div>
      </div>
    </div>
  );
}
