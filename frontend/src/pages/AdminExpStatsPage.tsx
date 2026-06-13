import { useMemo, useState } from "react";
import { TrendingUp, Zap, Users, UserCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchExpSummary, fetchExpRecords, type ExpRecord } from "@/api/domains/expStats.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";

const SOURCE_TYPE_OPTIONS = [
  { value: "", label: "全部来源" },
  { value: "FIRST_ENTRY", label: "首次进入 (+50)" },
  { value: "TIME_BASED", label: "停留时长" },
];

function sourceTypeLabel(t: string) {
  const m = SOURCE_TYPE_OPTIONS.find((o) => o.value === t);
  return m?.label ?? t;
}

function toTime(value?: string) {
  if (!value) return "-";
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return value;
  return t.toLocaleString("zh-CN", { hour12: false });
}

const PAGE_SIZE = 20;

const compactInputClass =
  "h-8 min-w-0 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

const compactSelectClass = "h-8 min-w-0 w-full px-2 text-xs";

export default function AdminExpStatsPage() {
  const [page, setPage] = useState(1);
  const [sourceType, setSourceType] = useState("");
  const [userId, setUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["expSummary"] as const,
    queryFn: fetchExpSummary,
  });

  const { data: recordsPage, isLoading: recordsLoading } = useQuery({
    queryKey: ["expRecords", page, sourceType, userId, startDate, endDate] as const,
    queryFn: () =>
      fetchExpRecords({
        pageNum: page,
        pageSize: PAGE_SIZE,
        sourceType: sourceType || undefined,
        userId: userId.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const rows: ExpRecord[] = recordsPage?.list ?? [];
  const total = recordsPage?.total ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const applyFilter = () => setPage(1);

  const resetFilter = () => {
    setSourceType("");
    setUserId("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };
  const statCards = [
    {
      label: "总经验值",
      value: summary?.totalExp ?? 0,
      icon: Zap,
      tone: "from-amber-400 to-yellow-500",
      format: (v: number) => v.toLocaleString(),
    },
    {
      label: "今日经验",
      value: summary?.todayExp ?? 0,
      icon: TrendingUp,
      tone: "from-emerald-400 to-green-500",
      format: (v: number) => (v > 0 ? "+" + v.toLocaleString() : v.toLocaleString()),
    },
    {
      label: "活跃用户",
      value: summary?.activeUsers ?? 0,
      icon: Users,
      tone: "from-blue-400 to-cyan-500",
      format: (v: number) => v.toLocaleString(),
    },
    {
      label: "今日活跃",
      value: summary?.todayActiveUsers ?? 0,
      icon: UserCheck,
      tone: "from-violet-400 to-purple-500",
      format: (v: number) => v.toLocaleString(),
    },
  ];

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <TrendingUp className="h-6 w-6 shrink-0 text-[var(--app-color-accent)]" aria-hidden />
          经验值统计
        </span>
      }
      description="记录所有扫码经验值流水，支持排行、趋势与来源分布"
    >
      <div className="flex flex-col gap-6">
        {/* Stat Cards Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-[var(--app-space-container-padding)] shadow-sm"
            >
              <div className="flex items-center gap-2">
                <div className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br " + card.tone}>
                  <card.icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-xs font-medium text-[var(--app-color-text-secondary)]">{card.label}</span>
              </div>
              <div className="mt-3">
                {summaryLoading ? (
                  <div className="h-8 w-24 animate-pulse rounded bg-[var(--app-color-surface-hover)]" />
                ) : (
                  <span className="text-2xl font-bold tabular-nums text-[var(--app-color-text-primary)]">
                    {card.format(card.value)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Top Earners Table */}
        <AdminFormCard title="经验值排行 (Top 10)">
          {!summary?.topEarners || summary.topEarners.length === 0 ? (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">
              暂无排行数据
            </div>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b bg-[var(--app-color-surface-hover)] text-left text-[var(--app-color-text-secondary)]">
                  <th className="px-3 py-2 w-12">#</th>
                  <th className="px-3 py-2">用户</th>
                  <th className="px-3 py-2 text-right">总经验</th>
                  <th className="px-3 py-2 text-right">今日经验</th>
                </tr>
              </thead>
              <tbody>
                {summary.topEarners.map((earner, i) => (
                  <tr key={earner.userId} className="border-b hover:bg-[var(--app-color-surface-hover)]">
                    <td className="px-3 py-2 font-mono text-[var(--app-color-text-secondary)]">
                      {i + 1 <= 3 ? (
                        <span
                          className={
                            i === 0
                              ? "text-[var(--app-color-feedback-warning)]"
                              : i === 1
                                ? "text-[var(--app-color-text-tertiary)]"
                                : "text-[var(--app-color-accent-secondary)]"
                          }
                        >
                          {i + 1}
                        </span>
                      ) : (
                        i + 1
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[var(--app-color-text-primary)]">{earner.userName || earner.userId}</span>
                      {earner.userName && (
                        <span className="ml-1.5 font-mono text-[10px] text-[var(--app-color-text-tertiary)]">{earner.userId}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-[var(--app-color-text-primary)]">
                      {earner.totalExp?.toLocaleString() ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-[var(--app-color-feedback-success)]">
                      +{earner.todayExp?.toLocaleString() ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminFormCard>

        {/* XP Records Filter + Table */}
        <AdminFormCard title="经验值流水" className="p-3 [&>div:first-child]:mb-2 [&>div:first-child]:pb-1.5">
          <div className="flex flex-nowrap items-end gap-2 overflow-x-auto">
            <label className="flex w-[8rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">来源类型</span>
              <AdminSelect
                value={sourceType}
                className={compactSelectClass}
                onChange={(e) => setSourceType(e.target.value)}
              >
                {SOURCE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">用户ID</span>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="搜索用户ID"
                className={compactInputClass}
              />
            </label>
            <label className="flex w-[8.5rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">开始</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={compactInputClass}
              />
            </label>
            <label className="flex w-[8.5rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">结束</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={compactInputClass}
              />
            </label>
            <div className="flex shrink-0 items-center gap-1.5 self-end pb-0.5">
              <AdminButton type="button" tone="primary" size="sm" className="h-8 px-3 text-xs" onClick={applyFilter}>
                筛选
              </AdminButton>
              <AdminButton type="button" tone="secondary" size="sm" className="h-8 px-3 text-xs" onClick={resetFilter}>
                重置
              </AdminButton>
            </div>
          </div>
        </AdminFormCard>

        <AdminTableShell
          loading={recordsLoading}
          empty={!recordsLoading && rows.length === 0}
          emptyMessage="暂无经验值流水"
          scrollable
          className="[&_.admin-table-shell-inner]:max-h-[min(82vh,920px)]"
        >
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b bg-[var(--app-color-surface-hover)] text-left text-[var(--app-color-text-secondary)]">
                <th className="px-2 py-1.5">时间</th>
                <th className="px-2 py-1.5">用户ID</th>
                <th className="px-2 py-1.5">姓名</th>
                <th className="px-2 py-1.5">经验值</th>
                <th className="px-2 py-1.5">来源类型</th>
                <th className="px-2 py-1.5">房间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top hover:bg-[var(--app-color-surface-hover)]">
                  <td className="px-2 py-1.5 whitespace-nowrap">{toTime(r.createTime)}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{r.userId || "-"}</td>
                  <td className="px-2 py-1.5">{r.userName || "-"}</td>
                  <td className="px-2 py-1.5 tabular-nums font-mono">
                    <span className={r.expAmount >= 0 ? "text-[var(--app-color-feedback-success)]" : "text-[var(--app-color-feedback-danger)]"}>
                      {r.expAmount >= 0 ? "+" : ""}{r.expAmount}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{sourceTypeLabel(r.sourceType)}</td>
                  <td className="px-2 py-1.5">{r.roomName || r.roomId || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-[var(--app-color-text-tertiary)]">
            共 {total} 条 · 每页 {PAGE_SIZE} 条 · 按时间倒序
          </span>
          <div className="flex items-center gap-2">
            <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1 || recordsLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              上一页
            </AdminButton>
            <span className="text-[var(--app-color-text-primary)]">
              {page} / {totalPages}
            </span>
            <AdminButton type="button" tone="secondary" size="sm" disabled={page >= totalPages || recordsLoading} onClick={() => setPage((p) => p + 1)}>
              下一页
            </AdminButton>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}

