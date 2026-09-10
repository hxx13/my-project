import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAllOrders, useMyGroupOrders, useUpdateOrderStatus, useImportAroOrders, useOrderFilterOptions } from "@/api/hooks/useReferenceData";
import { exportOrderReviewExcel, exportOrderReviewSummary, exportMyGroupOrders, loadOrderToCart } from "@/api/domains/referenceData.api";
import type { RefOrder, RefOrderLine, OrderReviewFilter } from "@/api/domains/referenceData.api";
import DataSkeleton from "@/components/ui/DataSkeleton";
import ExportConfigDialog from "@/features/export-config/ExportConfigDialog";
import { toQuery, type SubtotalConfigState } from "@/features/export-config/subtotalConfig";
import { AdminSearchSelect } from "@/components/admin/AdminSearchSelect";
import { formatBeijingDateTimeFull, calendarDayKeyBeijing } from "@/utils/beijingTime";
import { ANIMAL_ORDER_CAMPUSES } from "@/features/reference-data/campus";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";

import { useNavigate } from "react-router-dom";
import { appConfirm } from "@/lib/appDialog";
import { toast } from "react-hot-toast";
import {
  STATUS_LABELS,
  statusTone,
  buildOrderDisplay,
  lineNames,
  specOptionText,
  groupLinesByAup,
  type OrderDisplay,
} from "@/features/reference-data/orderDisplay";

type Tab = "pending" | "done";

/** 每页条数 */
const ORDER_PAGE_SIZE = 50;


/** 默认只查近 3 个月：历史单上万条，不加区间会拖慢首屏。 */
function defaultDateRange(): { from: string; to: string } {
  const to = calendarDayKeyBeijing(new Date());
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return { from: calendarDayKeyBeijing(d), to };
}

/**
 * 订单记录页。同一套展示（页签/卡片/表格/筛选/导出）供两端复用：
 * - scope="admin"（默认）：后台审核，看全量，可批准/驳回/标记完成，超管可同步 ARO
 * - scope="student"：学生端，只能看本人课题组（服务端强制圈定），只读
 */
export default function AdminOrderReviewPage({ scope = "admin" }: { scope?: "admin" | "student" } = {}) {
  const isStudent = scope === "student";
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("pending");
  const [view, setView] = useState<"card" | "table">("card");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<OrderReviewFilter>(() => defaultDateRange());
  const [applied, setApplied] = useState<OrderReviewFilter>(() => defaultDateRange());
  // exporting 只服务学生端的直接下载；管理端导出中态由 ExportConfigDialog 自持
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const summaryLevelsRef = useRef<string[]>([]);
  const [importing, setImporting] = useState(false);
  const updateStatus = useUpdateOrderStatus();
  const importMut = useImportAroOrders();
  const isSuperAdmin = hasMinRole(authStorage.getRole() || "MEMBER", "SUPER_ADMIN");

  const filter: OrderReviewFilter = useMemo(
    () => ({
      ...applied,
      ...(tab === "pending" ? { status: "PENDING" } : { statusNot: "PENDING" }),
    }),
    [applied, tab],
  );

  // 两个数据源都声明、按 scope 只启用一个（hooks 不能条件调用）
  const adminQuery = useAllOrders(page, ORDER_PAGE_SIZE, filter, !isStudent);
  const studentQuery = useMyGroupOrders(page, ORDER_PAGE_SIZE, filter, isStudent);
  const { data, isLoading, refetch, isFetching } = isStudent ? studentQuery : adminQuery;
  const orders = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  const displays = useMemo(() => orders.map(buildOrderDisplay), [orders]);

  const setDraftField = (k: keyof OrderReviewFilter, v: string) => setDraft((p) => ({ ...p, [k]: v }));
  const applyFilters = () => { setApplied(draft); setPage(1); };
  const resetFilters = () => {
    const range = defaultDateRange();
    setDraft(range);
    setApplied(range);
    setPage(1);
  };
  const switchTab = (t: Tab) => { setTab(t); setPage(1); };

  /** 生效条件里除日期外的项数（用于「筛选」按钮的角标） */
  const activeFilterCount = useMemo(() => {
    const { from: _f, to: _t, ...rest } = applied;
    return Object.values(rest).filter((v) => typeof v === "string" && v.trim()).length;
  }, [applied]);

  /** 下载 Blob：管理端弹层与学生端直接导出共用。 */
  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 学生端导出文件名：与管理端各用各的前缀，日期段规则不变。 */
  const orderExportName = (label: string) =>
    `${label}-${applied.from || "all"}_${applied.to || "now"}.xlsx`;

  /** 学生端：无结构摘要接口，保持「点即下载」。 */
  const handleStudentExport = async () => {
    setExporting(true);
    try {
      saveBlob(await exportMyGroupOrders(filter), orderExportName("我的课题组订单"));
      toast.success("已导出");
    } catch { toast.error("导出失败"); } finally { setExporting(false); }
  };

  /** 管理端弹层：摘要存下 allLevels，导出时本地折算，不额外发请求。 */
  const fetchOrderSummary = async () => {
    const s = await exportOrderReviewSummary(filter);
    summaryLevelsRef.current = s.levels;
    return s;
  };
  const handleOrderExport = async (state: SubtotalConfigState) => {
    try {
      const blob = await exportOrderReviewExcel(filter, toQuery(state, summaryLevelsRef.current));
      saveBlob(blob, orderExportName("animal-order-review"));
      toast.success("已导出");
    } catch { toast.error("导出失败"); }
  };

  const handleImport = async () => {
    if (!await appConfirm("把 ARO 历史订单导入本地订单库？\n\n· 按订单号幂等，可反复执行\n· 已存在的单只刷新状态与明细\n· 约一万单，耗时较长")) return;
    setImporting(true);
    try {
      const r = await importMut.mutateAsync();
      toast.success(`导入完成：新建 ${r.ordersCreated} 单 / 刷新 ${r.ordersUpdated} 单 / 明细 ${r.linesWritten} 行${r.failed ? ` / 失败 ${r.failed} 单` : ""}`);
      setTab("done");
      setPage(1);
      void refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally { setImporting(false); }
  };

  const act = async (d: OrderDisplay, status: string, label: string) => {
    if (!await appConfirm(`确定${label}订单 ${d.no}？将整单生效。`)) return;
    updateStatus.mutate({ id: d.orderId, status });
  };

  /** 进入编辑：把原单回填到购物车，再跳到动物订购页并自动打开购物车。 */
  const startEdit = async (d: OrderDisplay) => {
    try {
      await loadOrderToCart(d.orderId);
      const base = isStudent ? "/student/animal-order" : "/console/admin/animal-order";
      navigate(`${base}?editOrder=${d.orderId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "回填购物车失败");
    }
  };

  return (
    <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-2">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">

        {/* 工具栏 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 bg-[var(--twin-canvas)] px-3 py-2">
          <div className="review-tabs shrink-0">
            {([["pending", "新订单"], ["done", "已完成"]] as [Tab, string][]).map(([k, v]) => (
              <button key={k} type="button" onClick={() => switchTab(k)} className="review-tab" data-active={tab === k}>{v}</button>
            ))}
          </div>
          <div className="mx-1 h-4 w-px shrink-0 bg-[var(--app-color-border-default)]" />
          <div className="review-tabs shrink-0">
            {([["card", "卡片"], ["table", "表格"]] as ["card" | "table", string][]).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setView(k)} className="review-tab" data-active={view === k}>{v}</button>
            ))}
          </div>
          <div className="flex-1 min-w-0" />
          <span className="shrink-0 text-xs text-[var(--app-color-text-tertiary)]">共 {total} 单</span>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            data-active={filtersOpen}
            className={cn(
              "relative shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors",
              filtersOpen
                ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)]/10 text-[var(--app-color-accent)]"
                : "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]",
            )}
          >
            筛选{filtersOpen ? " ▲" : " ▼"}
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--app-color-accent)] px-1 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {isSuperAdmin && !isStudent && (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing}
              className="rounded-lg border border-[var(--app-color-feedback-warning)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-feedback-warning)] transition-colors hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
              title="仅超级管理员可见；把 ARO 历史订单并入本地订单库"
            >
              {importing ? "导入中…" : "同步 ARO 订单"}
            </button>
          )}
          <button type="button" onClick={() => (isStudent ? void handleStudentExport() : setExportOpen(true))} disabled={exporting} className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50">
            {exporting ? "导出中…" : "导出 Excel"}
          </button>
          <button type="button" onClick={() => void refetch()} disabled={isFetching} className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50">
            {isFetching ? "刷新中…" : "刷新"}
          </button>
        </div>

        {filtersOpen && (
          <OrderFilterBar
            draft={draft}
            onChange={setDraftField}
            onApply={applyFilters}
            onReset={resetFilters}
            scope={scope}
          />
        )}

        {/* 列表：表格视图让表格容器自己滚——吸顶表头 + 横向滚动条常驻可视底部；
            卡片视图沿用原来的纵向滚动。 */}
        <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
          {isLoading ? (
            <DataSkeleton variant="card" rows={5} />
          ) : displays.length === 0 ? (
            <div className="flex h-full min-h-[160px] items-center justify-center rounded-twin-lg border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-sm text-[var(--twin-mute)]">
              {tab === "pending" ? "暂无待处理订单" : "暂无已完成订单"}
            </div>
          ) : view === "table" ? (
            <OrderTable displays={displays} busy={updateStatus.isPending} onAction={act} onEdit={startEdit} readOnly={isStudent} />
          ) : (
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
              {displays.map((d) => (
                <OrderCard key={d.key} d={d} busy={updateStatus.isPending} onAction={act} onEdit={startEdit} readOnly={isStudent} lines={orders.find((o) => `${o.source === "ARO" ? "ARO" : "LOCAL"}-${o.id}` === d.key)?.lines ?? []} />
              ))}
            </div>
          )}
        </div>

        {/* 分页 */}
        {total > ORDER_PAGE_SIZE && (
          <div className="shrink-0 flex items-center justify-center gap-3 border-t border-[var(--twin-hairline)] px-3 py-2 text-xs">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1 disabled:opacity-40">上一页</button>
            <span className="text-[var(--app-color-text-secondary)]">第 {page} / {totalPages} 页</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1 disabled:opacity-40">下一页</button>
          </div>
        )}
      </div>

      {!isStudent && (
        <ExportConfigDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          title="导出 Excel"
          storageKey="fm-export-subtotal:order-review"
          fetchSummary={fetchOrderSummary}
          onExport={handleOrderExport}
        />
      )}
    </div>
  );
}

/* ════════════ 全字段筛选 ════════════ */

function OrderFilterBar({
  draft, onChange, onApply, onReset, scope = "admin",
}: {
  draft: OrderReviewFilter;
  onChange: (k: keyof OrderReviewFilter, v: string) => void;
  onApply: () => void;
  onReset: () => void;
  scope?: "admin" | "student";
}) {
  const { data: suppliers = [] } = useOrderFilterOptions("supplier_name", scope);
  const { data: strains = [] } = useOrderFilterOptions("strain_name", scope);
  const { data: collectors = [] } = useOrderFilterOptions("collector_name", scope);
  const { data: rooms = [] } = useOrderFilterOptions("pickup_room_name", scope);
  const { data: groups = [] } = useOrderFilterOptions("project_group_name", scope);
  const { data: aups = [] } = useOrderFilterOptions("register_no", scope);

  const label = "text-[10px] text-[var(--app-color-text-tertiary)]";
  const input = cn(adminInputClass, "h-8 w-full text-xs");

  /** 统一的「标签 + 控件」格子 */
  const cell = (w: string, labelText: string, node: ReactNode) => (
    <div className={cn("flex flex-col gap-1", w)}>
      <span className={label}>{labelText}</span>
      {node}
    </div>
  );
  /** 预选 + 可手动输入：候选来自后端去重值，输入内容不限于候选（后端按 LIKE 模糊匹配） */
  const pick = (field: keyof OrderReviewFilter, options: readonly string[], ph: string) => (
    <AdminSearchSelect
      value={(draft[field] as string) ?? ""}
      options={options}
      placeholder={ph}
      className="h-8 text-xs"
      onChange={(v) => onChange(field, v)}
    />
  );

  return (
    <div className="shrink-0 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 pb-2">
      <div className="flex flex-wrap items-end gap-2">
        {cell("w-[9rem]", "单号", <input className={input} value={draft.sn ?? ""} onChange={(e) => onChange("sn", e.target.value)} placeholder="订单号" />)}
        {cell("w-[11rem]", "课题组", pick("projectGroup", groups, "课题组名"))}
        {cell("w-[11rem]", "AUP", pick("aup", aups, "AUP 编号"))}
        {cell("w-[9rem]", "品系", pick("strain", strains, "品系"))}
        {cell("w-[11rem]", "供应商", pick("supplier", suppliers, "供应商"))}
        {cell("w-[9rem]", "领用人", pick("collector", collectors, "领用人"))}
        {cell("w-[10rem]", "领用房间", pick("room", rooms, "房间"))}
        {cell("w-[8rem]", "校区",
          <select className={input} value={draft.campus ?? ""} onChange={(e) => onChange("campus", e.target.value)}>
            <option value="">全部</option>
            {ANIMAL_ORDER_CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>)}
        {cell("w-[8rem]", "状态",
          <select className={input} value={draft.status ?? ""} onChange={(e) => onChange("status", e.target.value)}>
            <option value="">全部</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>)}
        {cell("w-[7rem]", "来源",
          <select className={input} value={draft.source ?? ""} onChange={(e) => onChange("source", e.target.value)}>
            <option value="">全部</option>
            <option value="LOCAL">本地</option>
            <option value="ARO">ARO</option>
          </select>)}
        {cell("w-[11rem]", "备注", <input className={input} value={draft.remark ?? ""} onChange={(e) => onChange("remark", e.target.value)} placeholder="整单/行备注" />)}
        {cell("w-[9rem]", "开始日期", <input type="date" className={input} value={draft.from ?? ""} onChange={(e) => onChange("from", e.target.value)} />)}
        {cell("w-[9rem]", "结束日期", <input type="date" className={input} value={draft.to ?? ""} onChange={(e) => onChange("to", e.target.value)} />)}
        <div className="flex gap-2 pb-0.5">
          <button type="button" onClick={onApply} className="rounded-lg bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-medium text-white">筛选</button>
          <button type="button" onClick={onReset} className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)]">重置</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════ 表格模式 ════════════ */

function OrderTable({
  displays, busy, onAction, onEdit, readOnly = false,
}: {
  displays: OrderDisplay[];
  busy: boolean;
  onAction: (d: OrderDisplay, status: string, label: string) => void;
  onEdit: (d: OrderDisplay) => void;
  readOnly?: boolean;
}) {
  const th = "px-3 py-2 whitespace-nowrap";
  const td = "px-3 py-2 align-top";
  // 每列给最小宽度：19 列合计必然超过容器，表格才能横向滚动，
  // 否则会被压成 100% 宽、长内容反复折行。
  const COLUMNS: Array<[string, string]> = [
    ["单号", "min-w-[130px]"],
    ["来源", "min-w-[64px]"],
    ["课题组", "min-w-[150px]"],
    ["负责人", "min-w-[90px]"],
    ["物品 / 规格", "min-w-[220px]"],
    ["供应商", "min-w-[170px]"],
    ["雄数", "min-w-[60px]"],
    ["雌数", "min-w-[60px]"],
    ["总数", "min-w-[60px]"],
    ["金额", "min-w-[100px]"],
    ["AUP", "min-w-[130px]"],
    ["领用人", "min-w-[90px]"],
    ["领用方式/房间", "min-w-[170px]"],
    ["到货日期", "min-w-[110px]"],
    ["校区", "min-w-[70px]"],
    ["备注", "min-w-[220px]"],
    ["状态", "min-w-[90px]"],
    ["提交时间", "min-w-[150px]"],
    ["操作", "min-w-[130px]"],
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
      <table className="twin-table w-max min-w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {COLUMNS.map(([label, w], i) => (
              <th key={label} className={cn(th, w, i === COLUMNS.length - 1 && "text-right")}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displays.map((d) => (
            <tr key={d.key} className="border-b">
              <td className={cn(td, "font-mono text-xs text-[var(--app-color-text-tertiary)]")}>{d.no}</td>
              <td className={td}>
                <span className={cn("rounded-md px-1.5 py-0.5 text-[10px]", d.source === "ARO" ? "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)]" : "bg-[var(--app-color-accent)]/10 text-[var(--app-color-accent)]")}>
                  {d.source === "ARO" ? "ARO" : "本地"}
                </span>
              </td>
              <td className={td}>{d.projectGroup}</td>
              <td className={td}>{d.submitter}</td>
              <td className={cn(td, "max-w-[280px] whitespace-normal break-words")}>
                {d.items.length === 0 ? "—" : d.items.map((it, i) => (
                  <div key={i}>
                    {it.label}{it.spec ? ` · ${it.spec}` : ""} × {it.qty}
                  </div>
                ))}
              </td>
              <td className={cn(td, "max-w-[200px] whitespace-normal break-words")}>{d.suppliers}</td>
              <td className={cn(td, "tabular-nums")}>{d.maleQty}</td>
              <td className={cn(td, "tabular-nums")}>{d.femaleQty}</td>
              <td className={cn(td, "tabular-nums font-semibold")}>{d.totalQty}</td>
              <td className={cn(td, "text-right tabular-nums font-semibold text-sky-700")}>
                {d.amount != null ? `¥${Number(d.amount).toFixed(2)}` : "—"}
              </td>
              <td className={cn(td, "text-xs")}>{d.aup}</td>
              <td className={cn(td, "whitespace-normal break-words")}>{d.collector}</td>
              <td className={cn(td, "max-w-[200px] whitespace-normal break-words")}>{d.room}</td>
              <td className={cn(td, "text-xs")}>{d.arrivalDate}</td>
              <td className={td}>{d.campus}</td>
              <td className={cn(td, "max-w-[260px] whitespace-normal break-words")}>{d.remark}</td>
              <td className={td}><span className="review-status">{d.statusLabel}</span></td>
              <td className={cn(td, "text-xs text-[var(--app-color-text-tertiary)]")}>{d.time}</td>
              <td className={td}>
                <div className="flex items-center justify-end gap-1.5">
                  {d.status === "PENDING" && (
                    <button type="button" disabled={busy} onClick={() => onEdit(d)} className="rounded-md border border-[var(--app-color-border-default)] px-2.5 py-1 text-xs disabled:opacity-50">编辑</button>
                  )}
                  {readOnly ? (
                    d.status !== "PENDING" && <span className="text-xs text-[var(--twin-mute)]">—</span>
                  ) : d.status === "PENDING" ? (
                    <>
                      <button type="button" disabled={busy} onClick={() => void onAction(d, "APPROVED", "批准")} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs text-white disabled:opacity-50">批准</button>
                      <button type="button" disabled={busy} onClick={() => void onAction(d, "REJECTED", "驳回")} className="rounded-md border border-rose-300 px-2.5 py-1 text-xs text-rose-600 disabled:opacity-50">驳回</button>
                    </>
                  ) : d.status === "APPROVED" ? (
                    <button type="button" disabled={busy} onClick={() => void onAction(d, "COMPLETED", "标记完成")} className="rounded-md border border-[var(--app-color-border-default)] px-2.5 py-1 text-xs disabled:opacity-50">标记完成</button>
                  ) : (
                    <span className="text-xs text-[var(--twin-mute)]">—</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════ 卡片模式 ════════════ */

function OrderCard({
  d, busy, onAction, onEdit, lines, readOnly = false,
}: {
  d: OrderDisplay;
  busy: boolean;
  onAction: (d: OrderDisplay, status: string, label: string) => void;
  onEdit: (d: OrderDisplay) => void;
  lines: RefOrderLine[];
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const aupGroups = useMemo(() => groupLinesByAup(lines), [lines]);
  const chip = "rounded-md bg-[var(--app-color-surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--app-color-text-secondary)]";
  const fieldLabel = "text-[10px] text-[var(--app-color-text-tertiary)]";
  const fieldValue = "text-xs text-[var(--app-color-text-primary)]";

  /** 顶栏右侧动作：编辑对所有可编辑人开放；审批类按钮仅管理端 */
  const actions = (
    <div className="flex items-center gap-1.5 shrink-0">
      {d.status === "PENDING" && (
        <button type="button" disabled={busy} onClick={() => onEdit(d)} className="review-btn review-btn--reject disabled:opacity-50">编辑</button>
      )}
      {!readOnly && d.status === "PENDING" && (
        <>
          <button type="button" disabled={busy} onClick={() => void onAction(d, "REJECTED", "驳回")} className="review-btn review-btn--reject disabled:opacity-50">驳回</button>
          <button type="button" disabled={busy} onClick={() => void onAction(d, "APPROVED", "批准")} className="review-btn review-btn--approve disabled:opacity-50">批准</button>
        </>
      )}
      {!readOnly && d.status === "APPROVED" && (
        <button type="button" disabled={busy} onClick={() => void onAction(d, "COMPLETED", "标记完成")} className="review-btn review-btn--approve disabled:opacity-50">标记完成</button>
      )}
    </div>
  );

  return (
    <div className="review-card flex flex-col gap-2 p-3" data-tone={statusTone(d.status)}>
      {/* 顶栏 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-[11px] font-mono tabular-nums text-[var(--app-color-text-tertiary)] shrink-0">{d.no}</span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-[10px]", d.source === "ARO" ? "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)]" : "bg-[var(--app-color-accent)]/10 text-[var(--app-color-accent)]")}>
            {d.source === "ARO" ? "ARO" : "本地"}
          </span>
          <span className="review-status">{d.statusLabel}</span>
          {d.aup !== "—" && <span className={chip}>{d.aup}</span>}
          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{d.items.length} 项</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <button type="button" onClick={() => setExpanded((v) => !v)} className="shrink-0 text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">
            {expanded ? "收起明细 ▲" : "展开明细 ▼"}
          </button>
        </div>
      </div>

      {/* 折叠态：只留决策要看的关键信息，其余收进「展开明细」，避免卡片被撑高 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="min-w-0">
          <span className={fieldLabel}>课题组 </span>
          <span className={cn(fieldValue, "font-medium")}>{d.projectGroup}</span>
        </span>
        <span><span className={fieldLabel}>负责人 </span><span className={fieldValue}>{d.submitter}</span></span>
        <span><span className={fieldLabel}>总数 </span><span className={cn(fieldValue, "font-semibold")}>{d.totalQty}</span></span>
        <span>
          <span className={fieldLabel}>金额 </span>
          <span className={cn(fieldValue, "font-semibold text-sky-700")}>
            {d.amount != null ? `¥${Number(d.amount).toFixed(2)}` : "—"}
          </span>
        </span>
        <span><span className={fieldLabel}>提交 </span><span className={fieldValue}>{d.time}</span></span>
      </div>
      {!expanded && d.items.length > 0 && (
        <div className="min-w-0 text-[11px] text-[var(--app-color-text-secondary)]">
          {d.items.slice(0, 2).map((it, i) => (
            <div key={i} className="truncate" title={`${it.label} ${it.spec}`}>
              {it.label}{it.spec ? ` · ${it.spec}` : ""} × {it.qty}
            </div>
          ))}
          {d.items.length > 2 && <div className="text-[10px] text-[var(--app-color-text-tertiary)]">另有 {d.items.length - 2} 项…</div>}
        </div>
      )}

      {expanded && (
        <>
          {/* 完整字段（与表格逐项对齐） */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="课题组" value={d.projectGroup} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="负责人" value={d.submitter} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="供应商" value={d.suppliers} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="品系" value={d.strains} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="雄数" value={String(d.maleQty)} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="雌数" value={String(d.femaleQty)} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="总数" value={String(d.totalQty)} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="金额" value={d.amount != null ? `¥${Number(d.amount).toFixed(2)}` : "—"} labelCls={fieldLabel} valueCls={cn(fieldValue, "font-semibold text-sky-700")} />
            <Field label="领用人" value={d.collector} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="领用方式/房间" value={d.room} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="到货日期" value={d.arrivalDate} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="校区" value={d.campus} labelCls={fieldLabel} valueCls={fieldValue} />
            <Field label="备注" value={d.remark} labelCls={fieldLabel} valueCls={fieldValue} span />
            <Field label="提交时间" value={d.time} labelCls={fieldLabel} valueCls={fieldValue} />
          </div>

          {lines.length > 0 && (
            <div className="mt-1 space-y-3 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)]/40 px-3 py-2">
          <div className="text-[11px] font-semibold text-[var(--app-color-text-secondary)]">订单明细（按 AUP）</div>
          {aupGroups.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">{group.label}</span>
                <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{group.lines.length} 行</span>
              </div>
              <div className="space-y-1.5 border-l-2 border-[var(--app-color-border-default)] pl-2">
                {group.lines.map((line) => {
                  const { supplier, strain, spec } = lineNames(line);
                  return (
                    <div key={line.id} className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="truncate text-sm font-medium text-[var(--app-color-text-primary)]">
                            {strain || spec || (line.refDataId != null ? `物品 #${line.refDataId}` : "物品")}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--app-color-text-tertiary)]">
                            {spec && <span>规格 {spec}</span>}
                            {supplier && <span>供应商 {supplier}</span>}
                            {specOptionText(line) && <span>{specOptionText(line)}</span>}
                            {line.collectorName && <span>领用人 {line.collectorName}</span>}
                            {line.pickupRoomName && <span>房间 {line.pickupRoomName}</span>}
                            {line.arrivalDate && <span>到货 {line.arrivalDate}</span>}
                          </div>
                          {line.lineRemark && (
                            <div className="truncate text-[10px] text-[var(--app-color-feedback-warning)]">行备注：{line.lineRemark}</div>
                          )}
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--app-color-text-primary)]">×{line.quantity}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
          )}
        </>
      )}

    </div>
  );
}

function Field({
  label, value, labelCls, valueCls, span,
}: {
  label: string;
  value: string;
  labelCls: string;
  valueCls: string;
  span?: boolean;
}) {
  return (
    <div className={cn("min-w-0", span && "col-span-2 sm:col-span-3 lg:col-span-4")}>
      <div className={labelCls}>{label}</div>
      <div className={cn(valueCls, "truncate")} title={value}>{value}</div>
    </div>
  );
}
