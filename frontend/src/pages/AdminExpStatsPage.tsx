import { useMemo, useState } from "react";
import { TrendingUp, Zap, Users, UserCheck, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchExpSummary, fetchExpRecords,
  approveExpRecord, rejectExpRecord,
  batchApproveExpRecords, batchRejectExpRecords,
  reconcileExpCatchUp, recalculateAllExp,
  type ExpRecord,
} from "@/api/domains/expStats.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import toast from "react-hot-toast";

const SOURCE_TYPE_OPTIONS = [
  { value: "", label: "全部来源" },
  { value: "FIRST_ENTRY", label: "首次进入 +50（实时）" },
  { value: "FIRST_ENTRY_SYNC", label: "首次进入 +50（对账）" },
  { value: "TIME_BASED", label: "停留时长（实时）" },
  { value: "TIME_BASED_SYNC", label: "停留时长（对账）" },
];

const ANOMALY_OPTIONS = [
  { value: "", label: "全部记录" },
  { value: "0", label: "正常记录" },
  { value: "1", label: "异常记录" },
];

const REVIEW_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "0", label: "待审核" },
  { value: "1", label: "已批准" },
  { value: "2", label: "已驳回" },
];

const FEED_SOURCE_OPTIONS = [
  { value: "", label: "全部渠道" },
  { value: "WEB_SCAN", label: "Web 扫码" },
  { value: "TWIN_AUTO_SIGNOUT", label: "自动签退" },
  { value: "ARO_OFFICIAL_UNMATCHED", label: "官方登记" },
];

function anomalyLabel(types: string | null): string {
  if (!types) return "";
  const map: Record<string, string> = {
    OVER_CAP: "超时",
    CROSS_DAY: "跨天",
    NIGHT_HOURS: "夜间",
  };
  return types.split(",").map((t) => map[t.trim()] ?? t).join("·");
}

function reviewBadge(status: number): { label: string; cls: string } {
  switch (status) {
    case 0: return { label: "待审核", cls: "bg-amber-100 text-amber-700" };
    case 1: return { label: "已批准", cls: "bg-emerald-100 text-emerald-700" };
    case 2: return { label: "已撤销", cls: "bg-red-100 text-red-700" };
    default: return { label: "已批准", cls: "bg-emerald-100 text-emerald-700" };
  }
}

function feedSourceLabel(fs: string | null): string {
  const map: Record<string, string> = {
    WEB_SCAN: "Web扫码",
    TWIN_AUTO_SIGNOUT: "自动签退",
    ARO_OFFICIAL_UNMATCHED: "官方登记",
  };
  return fs ? (map[fs] ?? fs) : "-";
}

function expLevel(totalExp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, totalExp) / 50)) + 1;
}

function sourceTypeLabel(t: string) {
  const m = SOURCE_TYPE_OPTIONS.find((o) => o.value === t);
  return m?.label ?? t;
}

function toTime(value?: string) {
  return formatDateTimeAsiaShanghaiShort(value);
}

const PAGE_SIZE = 20;

const compactInputClass =
  "h-8 min-w-0 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

const compactSelectClass = "h-8 min-w-0 w-full px-2 text-xs";

export default function AdminExpStatsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [sourceType, setSourceType] = useState("");
  const [userId, setUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [anomalyFlag, setAnomalyFlag] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [feedSource, setFeedSource] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [catchingUp, setCatchingUp] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["expSummary"] as const,
    queryFn: fetchExpSummary,
  });

  const { data: recordsPage, isLoading: recordsLoading } = useQuery({
    queryKey: ["expRecords", page, sourceType, userId, startDate, endDate, anomalyFlag, reviewStatus, feedSource] as const,
    queryFn: () =>
      fetchExpRecords({
        pageNum: page,
        pageSize: PAGE_SIZE,
        sourceType: sourceType || undefined,
        userId: userId.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        anomalyFlag: anomalyFlag ? Number(anomalyFlag) : undefined,
        reviewStatus: reviewStatus ? Number(reviewStatus) : undefined,
        feedSource: feedSource || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const rows: ExpRecord[] = recordsPage?.list ?? [];
  const total = recordsPage?.total ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const applyFilter = () => { setPage(1); setSelectedIds(new Set()); };

  const resetFilter = () => {
    setSourceType("");
    setUserId("");
    setStartDate("");
    setEndDate("");
    setAnomalyFlag("");
    setReviewStatus("");
    setFeedSource("");
    setPage(1);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!rows.length) return;
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return;
    setReviewing(true);
    try {
      await batchApproveExpRecords([...selectedIds]);
      toast.success(`已批准 ${selectedIds.size} 条`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["expRecords"] });
      queryClient.invalidateQueries({ queryKey: ["expSummary"] });
    } catch (e: any) {
      toast.error(e?.message || "批量批准失败");
    } finally { setReviewing(false); }
  };

  const handleBatchReject = async () => {
    if (selectedIds.size === 0) return;
    setReviewing(true);
    try {
      await batchRejectExpRecords([...selectedIds]);
      toast.success(`已驳回 ${selectedIds.size} 条`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["expRecords"] });
      queryClient.invalidateQueries({ queryKey: ["expSummary"] });
    } catch (e: any) {
      toast.error(e?.message || "批量驳回失败");
    } finally { setReviewing(false); }
  };

  const handleSingleApprove = async (id: number) => {
    try {
      await approveExpRecord(id);
      toast.success("已批准");
      queryClient.invalidateQueries({ queryKey: ["expRecords"] });
      queryClient.invalidateQueries({ queryKey: ["expSummary"] });
    } catch (e: any) { toast.error(e?.message || "操作失败"); }
  };

  const handleSingleReject = async (id: number) => {
    try {
      await rejectExpRecord(id);
      toast.success("已驳回");
      queryClient.invalidateQueries({ queryKey: ["expRecords"] });
      queryClient.invalidateQueries({ queryKey: ["expSummary"] });
    } catch (e: any) { toast.error(e?.message || "操作失败"); }
  };

  const handleCatchUp = async () => {
    setCatchingUp(true);
    try {
      const res = await reconcileExpCatchUp();
      toast.success(res.message || `补漏完成：处理 ${res.datesProcessed ?? 0} 天`);
      queryClient.invalidateQueries({ queryKey: ["expRecords"] });
      queryClient.invalidateQueries({ queryKey: ["expSummary"] });
    } catch (e: any) {
      toast.error(e?.message || "增量补漏失败");
    } finally {
      setCatchingUp(false);
    }
  };

  const handleFullRecalc = async () => {
    if (!window.confirm("全量重算将清空全部经验流水并逐日重建，耗时较长。确认继续？")) return;
    setRecalculating(true);
    try {
      const res = await recalculateAllExp();
      toast.success(res.message || "全量重算完成");
      queryClient.invalidateQueries({ queryKey: ["expRecords"] });
      queryClient.invalidateQueries({ queryKey: ["expSummary"] });
    } catch (e: any) {
      toast.error(e?.message || "全量重算失败");
    } finally {
      setRecalculating(false);
    }
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
    {
      label: "待审核异常",
      value: summary?.pendingReviewCount ?? 0,
      icon: AlertTriangle,
      tone: "from-orange-400 to-red-500",
      format: (v: number) => (v > 0 ? v.toLocaleString() + " 条" : "无"),
    },
  ];

  return (
    <AdminPageShell>
      <div className="flex items-center gap-3 shrink-0">
        <span className="inline-flex items-center gap-2">
          <TrendingUp className="h-6 w-6 shrink-0 text-[var(--app-color-accent)]" aria-hidden />
          经验值统计
        </span>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <AdminButton
            type="button"
            tone="primary"
            size="sm"
            disabled={catchingUp || recalculating}
            onClick={handleCatchUp}
          >
            {catchingUp ? "补漏中…" : "增量补漏"}
          </AdminButton>
          <AdminButton
            type="button"
            tone="secondary"
            size="sm"
            disabled={catchingUp || recalculating}
            onClick={handleFullRecalc}
          >
            {recalculating ? "全量重算中…" : "全量重算"}
          </AdminButton>
        </div>
      </div>
      <div className="flex flex-col gap-6 max-h-[calc(100dvh-var(--admin-chrome-offset)-48px)] min-h-[200px] overflow-y-auto">
        {/* Stat Cards Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <AdminFormCard title="今日经验排行 (Top 50)">
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
                  <th className="px-3 py-2 text-right">等级 / 总经验</th>
                  <th className="px-3 py-2 text-right">今日经验 ▼</th>
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
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--app-color-text-secondary)]">
                      <span className="font-bold text-[var(--app-color-accent)]">Lv.{earner.level ?? expLevel(earner.totalExp ?? 0)}</span>
                      <span className="ml-1.5 font-mono text-[var(--app-color-text-primary)]">{earner.totalExp?.toLocaleString() ?? 0}</span>
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
          {/* Row 1: basic filters */}
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
          </div>
          {/* Row 2: anomaly + review + channel filters + batch actions */}
          <div className="mt-2 flex flex-nowrap items-end gap-2 overflow-x-auto">
            <label className="flex w-[6rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">异常</span>
              <AdminSelect value={anomalyFlag} className={compactSelectClass} onChange={(e) => setAnomalyFlag(e.target.value)}>
                {ANOMALY_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </AdminSelect>
            </label>
            <label className="flex w-[6rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">审核</span>
              <AdminSelect value={reviewStatus} className={compactSelectClass} onChange={(e) => setReviewStatus(e.target.value)}>
                {REVIEW_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </AdminSelect>
            </label>
            <label className="flex w-[7rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">渠道</span>
              <AdminSelect value={feedSource} className={compactSelectClass} onChange={(e) => setFeedSource(e.target.value)}>
                {FEED_SOURCE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </AdminSelect>
            </label>
            <div className="flex shrink-0 items-center gap-1.5 self-end pb-0.5">
              <AdminButton type="button" tone="primary" size="sm" className="h-8 px-3 text-xs" onClick={applyFilter}>
                筛选
              </AdminButton>
              <AdminButton type="button" tone="secondary" size="sm" className="h-8 px-3 text-xs" onClick={resetFilter}>
                重置
              </AdminButton>
              {selectedIds.size > 0 && (
                <>
                  <AdminButton type="button" tone="primary" size="sm" className="h-8 px-2 text-xs" disabled={reviewing} onClick={handleBatchApprove}>
                    批准({selectedIds.size})
                  </AdminButton>
                  <AdminButton type="button" tone="destructive" size="sm" className="h-8 px-2 text-xs" disabled={reviewing} onClick={handleBatchReject}>
                    驳回({selectedIds.size})
                  </AdminButton>
                </>
              )}
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
                <th className="px-1 py-1.5 w-8">
                  <AdminSwitchScaled
                    size="3.5"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    onChange={() => toggleAll()}
                  />
                </th>
                <th className="px-2 py-1.5">时间</th>
                <th className="px-2 py-1.5">用户ID</th>
                <th className="px-2 py-1.5">姓名</th>
                <th className="px-2 py-1.5">经验值</th>
                <th className="px-2 py-1.5">来源类型</th>
                <th className="px-2 py-1.5">时长</th>
                <th className="px-2 py-1.5">渠道</th>
                <th className="px-2 py-1.5">异常</th>
                <th className="px-2 py-1.5">审核</th>
                <th className="px-2 py-1.5">房间</th>
                <th className="px-2 py-1.5 w-12">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = reviewBadge(r.reviewStatus ?? 0);
                const anom = anomalyLabel(r.anomalyTypes);
                return (
                <tr key={r.id} className="border-b align-top hover:bg-[var(--app-color-surface-hover)]">
                  <td className="px-1 py-1.5">
                    <AdminSwitchScaled size="3.5" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{toTime(r.createTime)}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{r.userId || "-"}</td>
                  <td className="px-2 py-1.5">{r.userName || "-"}</td>
                  <td className="px-2 py-1.5 tabular-nums font-mono">
                    <span className={r.expAmount >= 0 ? "text-[var(--app-color-feedback-success)]" : "text-[var(--app-color-feedback-danger)]"}>
                      {r.expAmount >= 0 ? "+" : ""}{r.expAmount}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{sourceTypeLabel(r.sourceType)}</td>
                  <td className="px-2 py-1.5 font-mono tabular-nums text-[var(--app-color-text-secondary)]">
                    {r.sessionDurationMinutes != null ? `${r.sessionDurationMinutes}min` : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-[10px] text-[var(--app-color-text-tertiary)]">{feedSourceLabel(r.feedSource)}</td>
                  <td className="px-2 py-1.5">
                    {r.anomalyFlag === 1 ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-orange-100 px-1 py-0.5 text-[10px] font-medium text-orange-700" title={anom}>
                        <AlertTriangle className="h-3 w-3" />{anom}
                      </span>
                    ) : (
                      <span className="text-[var(--app-color-text-tertiary)]">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-block rounded px-1 py-0.5 text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
                  </td>
                  <td className="px-2 py-1.5">{r.roomName || r.roomId || "-"}</td>
                  <td className="px-1 py-1.5">
                    {r.reviewStatus === 0 && (
                      <>
                        <button type="button" className="inline-flex items-center rounded p-0.5 text-emerald-600 hover:bg-emerald-50" title="批准"
                          onClick={() => handleSingleApprove(r.id)}>
                          <CheckCircle className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="inline-flex items-center rounded p-0.5 text-red-500 hover:bg-red-50" title="驳回"
                          onClick={() => handleSingleReject(r.id)}>
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {r.reviewStatus === 1 && (
                      <button type="button" className="inline-flex items-center rounded p-0.5 text-red-500 hover:bg-red-50" title="撤销"
                        onClick={() => handleSingleReject(r.id)}>
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {r.reviewStatus === 2 && (
                      <button type="button" className="inline-flex items-center rounded p-0.5 text-emerald-600 hover:bg-emerald-50" title="重新批准"
                        onClick={() => handleSingleApprove(r.id)}>
                        <CheckCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )})}
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

