import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsAuditLog, CagePiRow, CageRoomRow, IsolationUsageQueryResult } from "@/api/domains/analytics.api";
import { MeasuredChartBox } from "@/features/analytics/components/MeasuredChartBox";
import { SnapshotProvenanceInfoButton } from "@/features/analytics/components/SnapshotProvenanceInfoButton";
import { PeriodTrendBarChart } from "@/features/analytics/components/PeriodTrendBarChart";
import type { AnalyticsCompareCycle } from "@/features/analytics/analyticsPipelineFilter";
import { buildPeriodTrendChart } from "@/features/analytics/periodTrendChartData";
import { cn } from "@/lib/utils";
import { fetchAdminPersonnel } from "@/api/domains/admin.api";

const CYCLE_TITLE: Record<AnalyticsCompareCycle, string> = {
  day: "每日清算",
  week: "每周清算",
  month: "每月清算",
};

/** Generate a gradient color from indigo (high count) to light gray (low count) */
function barGradientColor(value: number, maxValue: number): string {
  if (maxValue <= 0) return "rgba(99,102,241,0.5)";
  const ratio = Math.max(0, Math.min(1, value / maxValue));
  // High values: deep indigo (#4f46e5). Low values: light slate (#cbd5e1).
  const r = Math.round(79 + (203 - 79) * (1 - ratio));
  const g = Math.round(70 + (213 - 70) * (1 - ratio));
  const b = Math.round(229 + (225 - 229) * (1 - ratio));
  return `rgb(${r},${g},${b})`;
}

type Props = {
  cycle: AnalyticsCompareCycle;
  hint: string;
  log: AnalyticsAuditLog;
  historyLogs: AnalyticsAuditLog[];
  /** 趋势图中高亮当前查看的 periodLabel */
  highlightPeriodKey?: string;
  viewingHistorical?: boolean;
  detail?: IsolationUsageQueryResult;
  loading?: boolean;
  error?: Error | null;
  hasCachedInsight?: boolean;
  metricUnit?: string;
  onOpenInsight?: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

export function CategorySnapshotAnalysisCard({
  cycle,
  hint,
  log,
  historyLogs = [],
  highlightPeriodKey,
  viewingHistorical = false,
  detail,
  loading,
  error,
  hasCachedInsight,
  metricUnit = "人次",
  onOpenInsight,
}: Props) {
  const [topGroupsExpanded, setTopGroupsExpanded] = useState(false);
  const [topPiExpanded, setTopPiExpanded] = useState(false);
  const [topRoomsExpanded, setTopRoomsExpanded] = useState(false);
  const [minGroupThreshold, setMinGroupThreshold] = useState(0);

  const isCageMetric = metricUnit === "笼位";
  const isAccessPackage = detail?.summary?.dataSource === "access_package";

  const delta = log.deltaRounds;
  const pct = log.deltaPct;
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const trendLabel = trend === "up" ? "较上期增加" : trend === "down" ? "较上期减少" : "与上期持平";

  const safeHistory = historyLogs ?? [];
  const trendMeta = useMemo(
    () => buildPeriodTrendChart(cycle, safeHistory, highlightPeriodKey),
    [cycle, safeHistory, highlightPeriodKey]
  );

  // Extract user-level data from detail
  const userLevel = detail?.userLevel ?? [];

  // Match user names to personnel database to get actual research groups
  const { data: personnelGroupMap } = useQuery({
    queryKey: ["admin", "personnel-group-lookup", userLevel.map(u => u.userName).join("|")],
    queryFn: async (): Promise<Map<string, string>> => {
      const results = new Map<string, string>(); // userName → projectGroupName
      const seen = new Set<string>();
      for (const u of userLevel) {
        if (seen.has(u.userName)) continue;
        seen.add(u.userName);
        try {
          const page = await fetchAdminPersonnel(1, 5, u.userName);
          const match = page.data.find(
            (p) => p.name === u.userName
          );
          if (match?.projectGroupName) {
            results.set(u.userName, match.projectGroupName);
          }
        } catch {
          // skip failed lookups silently
        }
      }
      return results;
    },
    enabled: userLevel.length > 0,
    staleTime: 300_000,
    retry: 2,
  });

  // Build matched groups by aggregating personTimes by projectGroupName
  const matchedGroups = useMemo(() => {
    if (!personnelGroupMap || personnelGroupMap.size === 0) return null;
    const agg = new Map<string, number>();
    for (const u of userLevel) {
      const group = personnelGroupMap.get(u.userName);
      if (group) {
        agg.set(group, (agg.get(group) ?? 0) + (u.personTimes || 0));
      }
    }
    if (agg.size === 0) return null;
    return [...agg.entries()]
      .map(([groupName, personTimes]) => ({ groupName, personTimes }))
      .sort((a, b) => b.personTimes - a.personTimes);
  }, [personnelGroupMap, userLevel]);

  // Use matched groups if available, otherwise fall back to ARO byProjectGroup
  const groups = matchedGroups ?? (detail?.byProjectGroup ?? []);

  const filteredGroups = useMemo(() => {
    if (minGroupThreshold <= 0) return groups;
    return groups.filter((g) => (g.personTimes ?? 0) >= minGroupThreshold);
  }, [groups, minGroupThreshold]);

  const pis: CagePiRow[] = detail?.byPi ?? [];
  const rooms: CageRoomRow[] = detail?.byRoom ?? [];

  const slotMetric = (row: { personTimes?: number; occupiedSlots?: number }) =>
    row.occupiedSlots ?? row.personTimes ?? 0;

  const allGroupsChart = filteredGroups.map((g) => ({
    name: g.groupName.length > 10 ? `${g.groupName.slice(0, 10)}…` : g.groupName,
    fullName: g.groupName,
    personTimes: slotMetric(g),
  }));

  const topPis = pis.slice(0, 8).map((p) => ({
    name: p.piName.length > 10 ? `${p.piName.slice(0, 10)}…` : p.piName,
    fullName: p.piName,
    personTimes: slotMetric(p),
  }));

  const summary = detail?.summary;
  // 快照 detail 与 header 同源；优先 summary（与下方课题组分布一致），避免 log 列滞后
  const scopeGroups = summary?.uniqueGroups ?? log.currentGroups;
  const involvedUsersPrev = log.previousUsers;
  const involvedUsersCur = summary?.uniqueUsers ?? log.currentUsers;
  const truncated = summary?.truncated === true;
  const distributionGroupCount = groups.length;
  const scopeGroupsStale =
    !loading &&
    !error &&
    distributionGroupCount > 0 &&
    scopeGroups != null &&
    distributionGroupCount !== scopeGroups;
  const allGroupsChartHeight = Math.min(480, Math.max(140, allGroupsChart.length * 36));
  const allGroupsChartMinWidth = Math.max(allGroupsChart.length * 24, 200);
  const topPiChartHeight = Math.min(200, Math.max(80, topPis.length * 28));

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
          {CYCLE_TITLE[cycle]} · {viewingHistorical ? "查看快照" : "最新快照"}
        </p>
        <h3 className="mt-2 text-2xl font-black leading-tight tracking-tight text-neutral-900 sm:text-3xl">
          {hint}
        </h3>
        <p className="mt-1.5 inline-flex items-center justify-center gap-1.5 text-lg font-bold tabular-nums text-violet-800 sm:text-xl">
          {log.periodLabel}
          {isAccessPackage && !isCageMetric ? (
            <SnapshotProvenanceInfoButton loading={loading} detail={detail} />
          ) : null}
        </p>
        {truncated ? (
          <p className="mt-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
            清洗库明细已抽样；涉及人数仍按全量 SQL；ARO 课题组与分布图同源
          </p>
        ) : null}
        {scopeGroupsStale ? (
          <p className="mt-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
            课题组数与分布不一致，请在左侧对该期执行「更新当前配置并重算」
          </p>
        ) : null}
      </header>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          <TrendCompareCard trend={trend} trendLabel={trendLabel} delta={delta} pct={pct} />
          <PeriodRoundsCard
            previousRounds={log.previousRounds}
            currentRounds={log.currentRounds}
            studentRounds={log.studentRounds}
            staffRounds={log.staffRounds}
            previousInvolvedUsers={isAccessPackage ? involvedUsersPrev : undefined}
            currentInvolvedUsers={isAccessPackage ? involvedUsersCur : undefined}
            metricUnit={isAccessPackage ? "条" : metricUnit}
          />
          <ScopeSummaryCard
            uniqueGroups={scopeGroups}
            uniquePis={summary?.uniquePis}
            uniqueRooms={summary?.uniqueRooms}
            isCageMetric={isCageMetric}
            isAccessPackage={isAccessPackage}
            loading={loading}
            error={error}
          />
        </div>

        <PeriodTrendBarChart cycle={cycle} meta={trendMeta} />

        {detail && allGroupsChart.length > 0 ? (
          <div className="rounded-lg border border-neutral-200/90 bg-neutral-50/50">
            {/* Threshold filter — only shown when groups.length > 3 */}
            {groups.length > 3 ? (
              <div className="flex items-center gap-2 px-3 pt-2">
                <label className="text-[10px] text-neutral-500 whitespace-nowrap">
                  隐藏低于
                  <input
                    type="number"
                    min={0}
                    value={minGroupThreshold}
                    onChange={(e) => setMinGroupThreshold(Math.max(0, Number(e.target.value) || 0))}
                    className="mx-1 w-14 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px]"
                  />
                  条
                </label>
                {minGroupThreshold > 0 ? (
                  <span className="text-[10px] text-violet-600">
                    (显示 {filteredGroups.length}/{groups.length})
                  </span>
                ) : null}
              </div>
            ) : null}
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
              {`课题组${isAccessPackage ? "（仅学生 · 清洗总库同源）" : metricUnit}（本期，全部 ${groups.length} 个）`}
              {!topGroupsExpanded ? (
                <span className="font-normal text-neutral-400">（点击展开）</span>
              ) : null}
            </button>
            {topGroupsExpanded ? (
              <div className="border-t border-neutral-200/80 px-3 pb-3 pt-2 overflow-x-auto">
                <MeasuredChartBox height={allGroupsChartHeight} minWidth={allGroupsChartMinWidth}>
                  <BarChart
                    data={allGroupsChart}
                    margin={{ top: 20, right: 8, left: 4, bottom: allGroupsChart.length > 6 ? 56 : 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9 }}
                      interval={0}
                      angle={allGroupsChart.length > 6 ? -40 : 0}
                      textAnchor={allGroupsChart.length > 6 ? "end" : "middle"}
                      height={allGroupsChart.length > 6 ? 56 : 24}
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={40} />
                    <Tooltip
                      formatter={(v) => [Number(v ?? 0), isAccessPackage ? "条" : metricUnit]}
                      labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ""}
                    />
                    <Bar dataKey="personTimes" radius={[4, 4, 0, 0]} maxBarSize={16}>
                      {allGroupsChart.map((entry) => {
                        const maxVal = Math.max(...allGroupsChart.map(e => e.personTimes), 1);
                        return <Cell key={entry.fullName} fill={barGradientColor(entry.personTimes, maxVal)} />;
                      })}
                      <LabelList dataKey="personTimes" position="top" fontSize={9} fontWeight={600} fill="#374151" />
                    </Bar>
                  </BarChart>
                </MeasuredChartBox>
              </div>
            ) : null}
          </div>
        ) : null}

        {isCageMetric && detail && topPis.length > 0 ? (
          <div className="rounded-lg border border-neutral-200/90 bg-neutral-50/50">
            <button
              type="button"
              onClick={() => setTopPiExpanded((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-neutral-600 hover:bg-neutral-100/80"
            >
              {topPiExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-violet-600" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              PI课题组笼位 Top（本期）
              {!topPiExpanded ? (
                <span className="font-normal text-neutral-400">（点击展开）</span>
              ) : null}
            </button>
            {topPiExpanded ? (
              <div className="border-t border-neutral-200/80 px-3 pb-3 pt-2">
                <MeasuredChartBox height={topPiChartHeight}>
                  <BarChart layout="vertical" data={topPis} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(v) => [Number(v ?? 0), metricUnit]}
                      labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ""}
                    />
                    <Bar dataKey="personTimes" radius={[0, 4, 4, 0]} barSize={12}>
                      {topPis.map((entry) => {
                        const maxVal = Math.max(...topPis.map(e => e.personTimes), 1);
                        return <Cell key={entry.fullName} fill={barGradientColor(entry.personTimes, maxVal)} />;
                      })}
                      <LabelList dataKey="personTimes" position="right" fontSize={9} fontWeight={600} fill="#374151" />
                    </Bar>
                  </BarChart>
                </MeasuredChartBox>
              </div>
            ) : null}
          </div>
        ) : null}

        {isCageMetric && detail && rooms.length > 0 ? (
          <div className="rounded-lg border border-neutral-200/90 bg-neutral-50/50">
            <button
              type="button"
              onClick={() => setTopRoomsExpanded((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-neutral-600 hover:bg-neutral-100/80"
            >
              {topRoomsExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-violet-600" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              各房间笼位数（本期）
              {!topRoomsExpanded ? (
                <span className="font-normal text-neutral-400">（点击展开）</span>
              ) : null}
            </button>
            {topRoomsExpanded ? (
              <div className="border-t border-neutral-200/80 px-3 pb-2 pt-2">
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-neutral-500">
                        <th className="pb-1 font-medium">房间</th>
                        <th className="pb-1 font-medium">位置</th>
                        <th className="pb-1 text-right font-medium">笼位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.slice(0, 20).map((r, i) => (
                        <tr key={`${r.location ?? ""}-${r.roomName}-${i}`} className="border-t border-neutral-100">
                          <td className="py-1 font-medium text-neutral-800">{r.roomName}</td>
                          <td className="max-w-[10rem] truncate py-1 text-neutral-600" title={r.location}>
                            {r.location ?? "—"}
                          </td>
                          <td className="py-1 text-right tabular-nums font-semibold text-violet-700">
                            {slotMetric(r)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
  studentRounds,
  staffRounds,
  previousInvolvedUsers,
  currentInvolvedUsers,
  metricUnit = "人次",
}: {
  previousRounds: number;
  currentRounds: number;
  studentRounds?: number;
  staffRounds?: number;
  previousInvolvedUsers?: number;
  currentInvolvedUsers?: number;
  metricUnit?: string;
}) {
  const showInvolved =
    previousInvolvedUsers != null || currentInvolvedUsers != null;
  return (
    <div className="flex min-h-[5.5rem] flex-col justify-center rounded-xl border border-violet-200 bg-violet-50/90 px-2.5 py-2 text-center shadow-sm">
      <p className="text-[10px] font-medium text-violet-700/80">{`上期 / 本期（${metricUnit}）`}</p>
      <p className="mt-1.5 flex items-baseline justify-center gap-1 tabular-nums leading-none">
        <span className="text-lg font-bold text-slate-600">{previousRounds}</span>
        <span className="text-sm font-medium text-violet-400">/</span>
        <span className="text-xl font-black text-violet-900">{currentRounds}</span>
      </p>
      {studentRounds != null && staffRounds != null ? (
        <p className="mt-1 text-[9px] text-violet-800">
          学生 {studentRounds} · 工作人员 {staffRounds}
        </p>
      ) : null}
      {showInvolved ? (
        <p className="mt-1 text-[9px] font-medium text-violet-900/90">
          涉及人数 {previousInvolvedUsers ?? "—"} / {currentInvolvedUsers ?? "—"}
          <span className="block text-[8px] font-normal text-violet-700/80">清洗库去重</span>
        </p>
      ) : (
        <p className="mt-1 text-[9px] text-violet-600/70">左上期 · 右本期</p>
      )}
    </div>
  );
}

function ScopeSummaryCard({
  uniqueGroups,
  uniquePis,
  uniqueRooms,
  isCageMetric,
  isAccessPackage,
  loading,
  error,
}: {
  uniqueGroups?: number;
  uniquePis?: number;
  uniqueRooms?: number;
  isCageMetric?: boolean;
  isAccessPackage?: boolean;
  loading?: boolean;
  error?: Error | null;
}) {
  return (
    <div className="flex min-h-[5.5rem] flex-col justify-center rounded-xl border border-neutral-200 bg-neutral-50/90 px-2.5 py-2 text-center shadow-sm">
      <p className="text-[10px] font-medium text-neutral-500">本期规模</p>
      {isAccessPackage && !isCageMetric ? (
        <p className="mt-0.5 text-[9px] leading-snug text-neutral-400">课题组 · 仅学生同源</p>
      ) : null}
      {loading ? (
        <p className="mt-2 text-xs text-neutral-400">加载中…</p>
      ) : error ? (
        <p className="mt-2 text-[10px] leading-snug text-rose-600">加载失败</p>
      ) : isCageMetric ? (
        <div className="mt-1.5 grid grid-cols-2 gap-2 tabular-nums">
          <div>
            <p className="text-[9px] text-neutral-500">PI课题组</p>
            <p className="text-lg font-black text-neutral-900">{uniquePis ?? "—"}</p>
          </div>
          <div>
            <p className="text-[9px] text-neutral-500">房间</p>
            <p className="text-lg font-black text-neutral-900">{uniqueRooms ?? "—"}</p>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 tabular-nums">
          <p className="text-[9px] text-neutral-500">课题组</p>
          <p className="text-2xl font-black text-neutral-900">{uniqueGroups ?? "—"}</p>
        </div>
      )}
    </div>
  );
}

