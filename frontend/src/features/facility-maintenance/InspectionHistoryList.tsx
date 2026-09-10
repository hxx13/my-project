import { ClipboardList, RefreshCw } from "lucide-react";
import type { FmDailyInspectionSheetSummary } from "@/api/domains/facilityMaintenance.api";
import { cn } from "@/lib/utils";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";
import EmptyState from "@/components/ui/EmptyState";
import { FmStatusTag } from "@/features/facility-maintenance/shared/FmStatusTag";
import { PaginationBar } from "@/features/facility-maintenance/shared/PaginationBar";

/* ================================================================== */
/*  InspectionHistoryList — 巡查 tab 左栏「历史按日巡查表」               */
/*  纯展示 + 回调：数据/加载态由 InspectionTab 的本地 state 持有并传入，    */
/*  组件内不发请求、不引入 React Query。                                  */
/* ================================================================== */

export type InspectionHistoryListProps = {
  rows: FmDailyInspectionSheetSummary[];
  total: number;
  page: number;
  size: number;
  loading: boolean;
  selectedDate: string;
  onPageChange: (page: number) => void;
  onSizeChange?: (size: number) => void;
  onSelect: (row: FmDailyInspectionSheetSummary) => void;
  onRefresh: () => void;
};

/** sheetDate 可能带时间后缀，比较统一取前 10 位 */
function dayKey(v: string | null | undefined) {
  return (v || "").slice(0, 10);
}

/** 卡片左侧色条 tone：与 FmStatusTag 的状态映射保持一致（映射只留在 index.css 一处） */
function statusTone(status: string) {
  if (status === "DRAFT") return "pending";
  if (status === "SUBMITTED") return "ok";
  return "none";
}

export function InspectionHistoryList({
  rows,
  total,
  page,
  size,
  loading,
  selectedDate,
  onPageChange,
  onSizeChange,
  onSelect,
  onRefresh,
}: InspectionHistoryListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
      {/* 头部：固定区 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--twin-hairline)] px-3 py-2">
        <h3 className="text-sm font-semibold text-[var(--twin-ink)]">历史按日巡查表</h3>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--app-color-border-default)] px-2.5 py-1 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          刷新目录
        </button>
      </div>

      {/* 常驻提示：与小程序同源 + 换模板后无表的处置。原来只挂在空态里，而它描述的正是「列表有别的行」的场景，会看不到 */}
      <p className="shrink-0 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-1.5 text-[11px] leading-relaxed text-[var(--twin-mute)]">
        与小程序「历史巡查」同源；点击「打开」可切换到该日期并加载矩阵。若换模板后无表：当日格子全空时会自动换绑模板；否则请「删除当日巡查表」后重开。
      </p>

      {/* 列表：唯一滚动区 */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2"
        aria-busy={loading}
      >
        {loading && rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-[var(--twin-mute)]">加载中…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="暂无历史巡查表"
            description="打开当日巡查表后会出现在这里。"
            className="px-4 py-8"
          />
        ) : (
          <ul className={cn("space-y-2", loading && "opacity-60")}>
            {rows.map((r) => {
              const active = dayKey(r.sheetDate) === dayKey(selectedDate);
              return (
                <li
                  key={r.id}
                  data-tone={statusTone(r.status)}
                  className={cn(
                    "review-card px-3 py-2",
                    active && "ring-1 ring-[var(--app-color-accent)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-[var(--twin-body)]">{r.sheetDate}</span>
                    <button
                      type="button"
                      className="text-xs text-[var(--twin-link)] hover:underline"
                      onClick={() => onSelect(r)}
                    >
                      打开
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-[var(--twin-body)]" title={r.templateName || r.templateId}>
                      {r.templateName || r.templateId || "—"}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <FmStatusTag status={r.status} />
                      <span className="text-[11px] text-[var(--twin-mute)]">v{r.version}</span>
                    </span>
                  </div>
                  {/* 登记人 / 登记时间（与基线历史表同源字段，窄侧栏截断防溢出） */}
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--twin-mute)]">
                    <span className="min-w-0 truncate" title={r.submittedByName || undefined}>
                      登记：{r.submittedByName || "—"}
                    </span>
                    <span className="shrink-0">{formatDateTimeAsiaShanghai(r.submittedAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 分页条：固定区，不参与滚动 */}
      <div className="shrink-0 border-t border-[var(--twin-hairline)] px-2 py-2">
        <PaginationBar
          page={page}
          size={size}
          total={total}
          onPageChange={onPageChange}
          onSizeChange={onSizeChange}
          disabled={loading}
        />
      </div>
    </div>
  );
}

export default InspectionHistoryList;
