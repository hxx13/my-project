import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  fetchMaterialStatsAnalytics,
  fetchGroupsWithRecords,
  type MaterialStatsAnalytics,
} from "@/api/domains/material.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import {
  analyticsChartGridStroke,
  analyticsChartTooltip,
  analyticsEmptyShell,
  analyticsFilterShell,
  analyticsInput,
  analyticsKpiDanger,
  analyticsKpiInfo,
  analyticsKpiMuted,
  analyticsKpiSuccess,
  analyticsKpiViolet,
  analyticsKpiWarning,
} from "@/features/analytics/analyticsUiTokens";
import { cn } from "@/lib/utils";
import { ActivityHeatmapChart } from "./ActivityHeatmapChart";
import type { HeatmapCell } from "@/api/domains/analytics.api";

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#f97316", "#14b8a6"];

function defaultMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { from, to };
}

function statusZh(s: string): string {
  const m: Record<string, string> = {
    DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过",
    APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "已出库", RECEIVED: "已完成",
  };
  return m[String(s || "").toUpperCase()] ?? s;
}

/** MySQL DAYOFWEEK：1=周日 → 热力图 1=周一 … 7=周日 */
function toHeatmapCells(rows: MaterialStatsAnalytics["outboundHeatmap"]): HeatmapCell[] {
  return (rows ?? []).map((r) => {
    const mysql = Number(r.dayOfWeek) || 1;
    const dayOfWeek = mysql === 1 ? 7 : mysql - 1;
    return { dayOfWeek, hour: Number(r.hour) || 0, count: Number(r.count) || 0 };
  });
}

export function MaterialStatsReportPanel() {
  const initial = defaultMonthRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [groupId, setGroupId] = useState("");

  const { data: groups = [] } = useQuery({
    queryKey: ["material", "groups-with-records"],
    queryFn: fetchGroupsWithRecords,
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["material", "stats", "analytics", from, to, groupId],
    queryFn: () => fetchMaterialStatsAnalytics({ from, to, groupId: groupId || undefined }),
    staleTime: 30_000,
  });

  const dailyChart = useMemo(
    () => (data?.dailyTrend ?? []).map((d) => ({
      ...d,
      label: String(d.date || "").slice(5),
    })),
    [data],
  );

  const groupChart = useMemo(
    () => (data?.byGroup ?? []).slice(0, 15).map((g) => ({
      name: g.groupName || "未分配",
      requestCount: Number(g.requestCount) || 0,
      totalQty: Number(g.totalQty) || 0,
    })),
    [data],
  );

  const itemChart = useMemo(
    () => (data?.byItem ?? []).slice(0, 15).map((it) => ({
      name: (it.itemName || `物品${it.itemId}`).slice(0, 12),
      totalQty: Number(it.totalQty) || 0,
    })),
    [data],
  );

  const statusChart = useMemo(
    () => (data?.statusDistribution ?? []).map((s) => ({
      name: statusZh(s.status),
      count: Number(s.count) || 0,
    })),
    [data],
  );

  const heatmap = useMemo(() => toHeatmapCells(data?.outboundHeatmap || []), [data]);

  const timeLabel = `${from} ～ ${to}`;

  return (
    <div className="space-y-4">
      <div className={cn("flex flex-wrap items-end gap-3 px-4 py-3", analyticsFilterShell)}>
        <div>
          <label className="mb-1 block text-xs text-[var(--app-color-text-tertiary)]">开始日期</label>
          <input type="date" className={cn("px-3 py-2 text-sm", analyticsInput)} value={from}
            onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--app-color-text-tertiary)]">结束日期</label>
          <input type="date" className={cn("px-3 py-2 text-sm", analyticsInput)} value={to}
            onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--app-color-text-tertiary)]">课题组（可选）</label>
          <select className={cn("min-w-[160px] px-3 py-2 text-sm", analyticsInput)} value={groupId}
            onChange={(e) => setGroupId(e.target.value)}>
            <option value="">全部课题组</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <p className="pb-2 text-xs text-[var(--app-color-text-tertiary)]">数据与「申领审计导出」同源，按记录时间戳聚合</p>
      </div>

      {isLoading ? (
        <div className={analyticsEmptyShell}>
          <Loader2 className="h-10 w-10 animate-spin text-[var(--app-color-accent)]" />
          <p className="text-sm text-[var(--app-color-text-tertiary)]">正在加载统计数据…</p>
        </div>
      ) : !data ? (
        <div className={analyticsEmptyShell}>
          <Package className="h-10 w-10 text-[var(--app-color-text-tertiary)]" />
          <p className="text-sm text-[var(--app-color-text-tertiary)]">暂无统计数据</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminFormCard title={`申领单数（${timeLabel}）`}>
              <p className={cn("text-2xl font-extrabold", analyticsKpiViolet)}>{data.totalRequests}</p>
            </AdminFormCard>
            <AdminFormCard title={`申领数量（${timeLabel}）`}>
              <p className={cn("text-2xl font-extrabold", analyticsKpiSuccess)}>{data.totalRequestQty}</p>
            </AdminFormCard>
            <AdminFormCard title={`出库数量（${timeLabel}）`}>
              <p className={cn("text-2xl font-extrabold", analyticsKpiWarning)}>{data.totalOutboundQty}</p>
            </AdminFormCard>
            <AdminFormCard title={`入库数量（${timeLabel}）`}>
              <p className={cn("text-2xl font-extrabold", analyticsKpiInfo)}>{data.totalInboundQty}</p>
            </AdminFormCard>
            <AdminFormCard title="审核通过率">
              <p className={cn("text-2xl font-extrabold", analyticsKpiViolet)}>
                {data.passRate != null ? `${Math.round(data.passRate * 100)}%` : "—"}
              </p>
            </AdminFormCard>
            <AdminFormCard title="拒绝单数">
              <p className={cn("text-2xl font-extrabold", analyticsKpiDanger)}>{data.refuseCount ?? 0}</p>
            </AdminFormCard>
            <AdminFormCard title="活跃申领人">
              <p className={cn("text-2xl font-extrabold", analyticsKpiMuted)}>{data.activeStudents}</p>
            </AdminFormCard>
            <AdminFormCard title="涉及课题组">
              <p className={cn("text-2xl font-extrabold", analyticsKpiMuted)}>{data.activeGroups}</p>
            </AdminFormCard>
          </div>

          {data.stockWarnings?.length > 0 ? (
            <AdminFormCard title="库存预警（≤ 5）">
              <div className="flex flex-wrap gap-2">
                {data.stockWarnings.map((w) => (
                  <span key={w.itemId} className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--app-color-feedback-warning)_40%,var(--app-color-border-default))] bg-[var(--app-color-feedback-warning-soft)] px-3 py-1 text-xs">
                    <span className="font-medium text-[var(--app-color-feedback-warning)]">{w.name}</span>
                    <span className="text-[var(--app-color-text-secondary)]">库存 {w.stockQty}</span>
                  </span>
                ))}
              </div>
            </AdminFormCard>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AdminFormCard title="日趋势：申领与出入库" className="min-w-0">
              {dailyChart.length === 0 ? (
                <p className="py-12 text-center text-xs text-[var(--app-color-text-tertiary)]">该区间暂无趋势数据</p>
              ) : (
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <LineChart data={dailyChart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={analyticsChartGridStroke} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--app-color-text-tertiary)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--app-color-text-tertiary)" }} allowDecimals={false} />
                      <Tooltip contentStyle={analyticsChartTooltip} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="requestCount" name="申领单" stroke="var(--app-color-accent)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="outboundQty" name="出库量" stroke="var(--app-color-feedback-warning)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="inboundQty" name="入库量" stroke="var(--app-color-feedback-success)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </AdminFormCard>

            <AdminFormCard title="申领状态分布" className="min-w-0">
              {statusChart.length === 0 ? (
                <p className="py-12 text-center text-xs text-[var(--app-color-text-tertiary)]">暂无状态数据</p>
              ) : (
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={statusChart} margin={{ top: 8, right: 8, left: -10, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={analyticsChartGridStroke} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--app-color-text-tertiary)" }} interval={0} angle={-20} textAnchor="end" height={48} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--app-color-text-tertiary)" }} allowDecimals={false} />
                      <Tooltip contentStyle={analyticsChartTooltip} />
                      <Bar dataKey="count" name="单数" maxBarSize={36} radius={[4, 4, 0, 0]}>
                        {statusChart.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </AdminFormCard>

            <AdminFormCard title="课题组申领排名" className="min-w-0">
              {groupChart.length === 0 ? (
                <p className="py-12 text-center text-xs text-[var(--app-color-text-tertiary)]">暂无课题组数据</p>
              ) : (
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={groupChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={analyticsChartGridStroke} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "var(--app-color-text-tertiary)" }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 9, fill: "var(--app-color-text-tertiary)" }} />
                      <Tooltip contentStyle={analyticsChartTooltip} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="requestCount" name="申领单" fill="var(--app-color-accent)" maxBarSize={14} radius={[0, 4, 4, 0]} />
                      <Bar dataKey="totalQty" name="申领量" fill="var(--app-color-accent-secondary)" maxBarSize={14} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </AdminFormCard>

            <AdminFormCard title="热门申领物品" className="min-w-0">
              {itemChart.length === 0 ? (
                <p className="py-12 text-center text-xs text-[var(--app-color-text-tertiary)]">暂无物品数据</p>
              ) : (
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={itemChart} margin={{ top: 8, right: 8, left: -10, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={analyticsChartGridStroke} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--app-color-text-tertiary)" }} interval={0} angle={-30} textAnchor="end" height={56} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--app-color-text-tertiary)" }} allowDecimals={false} />
                      <Tooltip contentStyle={analyticsChartTooltip} />
                      <Bar dataKey="totalQty" name="申领数量" maxBarSize={32} radius={[4, 4, 0, 0]}>
                        {itemChart.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </AdminFormCard>

            <AdminFormCard title="出库时段热力图（按物品审计流水）" className="min-w-0 xl:col-span-2">
              <ActivityHeatmapChart data={heatmap} loading={false} className="h-[280px]" />
            </AdminFormCard>
          </div>
        </>
      )}
    </div>
  );
}
