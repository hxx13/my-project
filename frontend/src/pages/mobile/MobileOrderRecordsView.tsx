import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMyGroupOrders, useOrderFilterOptions } from "@/api/hooks/useReferenceData";
import { exportMyGroupOrders, type OrderReviewFilter, type RefOrderLine } from "@/api/domains/referenceData.api";
import { AdminSearchSelect } from "@/components/admin/AdminSearchSelect";
import {
  STATUS_LABELS,
  buildOrderDisplay,
  lineGenderQty,
  lineNames,
  specOptionText,
  groupLinesByAup,
  type OrderDisplay,
} from "@/features/reference-data/orderDisplay";
import { ANIMAL_ORDER_CAMPUSES } from "@/features/reference-data/campus";
import { calendarDayKeyBeijing } from "@/utils/beijingTime";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";

/**
 * H5 订单记录（学生/教职工端）。
 *
 * 与后台审核页同款字段与交互（页签 / 卡片 / 表格 / 筛选 / 导出），差别：
 * - 只读，无审批按钮
 * - 范围由服务端圈定为本人课题组（同组互见），前端传课题组也会被覆盖
 * - 移动端布局：表格横向滚动、筛选区可收起
 */

type Tab = "pending" | "done";
const PAGE_SIZE = 20;

function defaultDateRange(): { from: string; to: string } {
  const to = calendarDayKeyBeijing(new Date());
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return { from: calendarDayKeyBeijing(d), to };
}

export default function MobileOrderRecordsView({ onEdit }: { onEdit?: (orderId: number) => void } = {}) {
  const [tab, setTab] = useState<Tab>("pending");
  const [view, setView] = useState<"card" | "table">("card");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<OrderReviewFilter>(() => defaultDateRange());
  const [applied, setApplied] = useState<OrderReviewFilter>(() => defaultDateRange());
  const [exporting, setExporting] = useState(false);

  const filter: OrderReviewFilter = useMemo(
    () => ({ ...applied, ...(tab === "pending" ? { status: "PENDING" } : { statusNot: "PENDING" }) }),
    [applied, tab],
  );
  const { data, isLoading } = useMyGroupOrders(page, PAGE_SIZE, filter);
  const orders = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const displays = useMemo(() => orders.map(buildOrderDisplay), [orders]);

  const lineMap = useMemo(() => {
    const m = new Map<string, typeof orders[number]["lines"]>();
    for (const o of orders) {
      m.set(`${o.source === "ARO" ? "ARO" : "LOCAL"}-${o.id}`, o.lines ?? []);
    }
    return m;
  }, [orders]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportMyGroupOrders(filter);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `我的课题组订单-${applied.from || "all"}_${applied.to || "now"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已导出");
    } catch {
      toast.error("导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 工具栏 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--student-hairline)] px-3 py-2">
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--student-canvas-soft)] p-0.5">
          {([["pending", "新订单"], ["done", "已完成"]] as [Tab, string][]).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => { setTab(k); setPage(1); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                tab === k ? "bg-[var(--student-surface-raised)] text-[var(--student-ink)] shadow-sm" : "text-[var(--student-mute)]",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--student-canvas-soft)] p-0.5">
          {([["card", "卡片"], ["table", "表格"]] as ["card" | "table", string][]).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                view === k ? "bg-[var(--student-surface-raised)] text-[var(--student-ink)] shadow-sm" : "text-[var(--student-mute)]",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-[var(--student-mute)]">共 {total} 单</span>
        <div className="flex-1 min-w-0" />
        <button type="button" onClick={() => setFiltersOpen((v) => !v)} className="shrink-0 rounded-full border border-[var(--student-hairline)] px-3 py-1 text-xs text-[var(--student-body)]">
          筛选{filtersOpen ? " ▲" : " ▼"}
        </button>
        <button type="button" onClick={() => void handleExport()} disabled={exporting} className="shrink-0 rounded-full bg-[var(--student-primary)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {exporting ? "导出中…" : "导出"}
        </button>
      </div>

      {filtersOpen && (
        <MobileFilterBar
          draft={draft}
          onChange={(k, v) => setDraft((p) => ({ ...p, [k]: v }))}
          onApply={() => { setApplied(draft); setPage(1); setFiltersOpen(false); }}
          onReset={() => { const r = defaultDateRange(); setDraft(r); setApplied(r); setPage(1); }}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <p className="py-10 text-center text-xs text-[var(--student-mute)]">加载中…</p>
        ) : displays.length === 0 ? (
          <p className="py-10 text-center text-xs text-[var(--student-mute)]">
            {tab === "pending" ? "暂无待处理订单" : "暂无已完成订单"}
          </p>
        ) : view === "table" ? (
          <OrderTable displays={displays} linesByKey={lineMap} />
        ) : (
          <div className="space-y-2">
            {displays.map((d) => (
              <OrderCard key={d.key} d={d} lines={lineMap.get(d.key) ?? []} onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-[var(--student-hairline)] px-3 py-2 text-xs">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-[var(--student-hairline)] px-3 py-1 disabled:opacity-40">上一页</button>
          <span className="text-[var(--student-mute)]">第 {page} / {totalPages} 页</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-[var(--student-hairline)] px-3 py-1 disabled:opacity-40">下一页</button>
        </div>
      )}
    </div>
  );
}

/* ════════════ 筛选（可收起，控件与后台同款） ════════════ */

function MobileFilterBar({
  draft, onChange, onApply, onReset,
}: {
  draft: OrderReviewFilter;
  onChange: (k: keyof OrderReviewFilter, v: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const { data: suppliers = [] } = useOrderFilterOptions("supplier_name", "student");
  const { data: strains = [] } = useOrderFilterOptions("strain_name", "student");
  const { data: collectors = [] } = useOrderFilterOptions("collector_name", "student");
  const { data: rooms = [] } = useOrderFilterOptions("pickup_room_name", "student");
  const { data: aups = [] } = useOrderFilterOptions("register_no", "student");

  const label = "text-[10px] text-[var(--student-mute)]";
  const input = "h-8 w-full rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-surface-raised)] px-2 text-xs outline-none";
  const cell = (labelText: string, node: ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={label}>{labelText}</span>
      {node}
    </div>
  );
  const pick = (field: keyof OrderReviewFilter, options: readonly string[], ph: string) => (
    <AdminSearchSelect value={(draft[field] as string) ?? ""} options={options} placeholder={ph} className="h-8 text-xs" onChange={(v) => onChange(field, v)} />
  );

  return (
    <div className="shrink-0 border-b border-[var(--student-hairline)] bg-[var(--student-canvas)] px-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        {cell("单号", <input className={input} value={draft.sn ?? ""} onChange={(e) => onChange("sn", e.target.value)} placeholder="订单号" />)}
        {cell("AUP", pick("aup", aups, "AUP 编号"))}
        {cell("品系", pick("strain", strains, "品系"))}
        {cell("供应商", pick("supplier", suppliers, "供应商"))}
        {cell("领用人", pick("collector", collectors, "领用人"))}
        {cell("领用房间", pick("room", rooms, "房间"))}
        {cell("校区",
          <select className={input} value={draft.campus ?? ""} onChange={(e) => onChange("campus", e.target.value)}>
            <option value="">全部</option>
            {ANIMAL_ORDER_CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>)}
        {cell("状态",
          <select className={input} value={draft.status ?? ""} onChange={(e) => onChange("status", e.target.value)}>
            <option value="">全部</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>)}
        {cell("开始日期", <input type="date" className={input} value={draft.from ?? ""} onChange={(e) => onChange("from", e.target.value)} />)}
        {cell("结束日期", <input type="date" className={input} value={draft.to ?? ""} onChange={(e) => onChange("to", e.target.value)} />)}
        <div className="col-span-2">
          {cell("备注", <input className={input} value={draft.remark ?? ""} onChange={(e) => onChange("remark", e.target.value)} placeholder="整单/行备注" />)}
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onReset} className="rounded-full border border-[var(--student-hairline)] px-3 py-1 text-xs text-[var(--student-body)]">重置</button>
        <button type="button" onClick={onApply} className="rounded-full bg-[var(--student-primary)] px-3 py-1 text-xs font-medium text-white">筛选</button>
      </div>
    </div>
  );
}

/* ════════════ 表格（横向滚动） ════════════ */

/**
 * 表格视图：**一明细行一行**，列口径与 Web 审核页一致
 * （订单级块跨行合并 → 行级块逐行）。领用人/房间/笼位原来用「、」拼在一格，
 * 看不出对应哪一行，也和行级的导出对不上。
 */
const ORDER_COLS: Array<[string, string]> = [
  ["单号", "min-w-[120px]"],
  ["来源", "min-w-[56px]"],
  ["课题组", "min-w-[130px]"],
  ["负责人", "min-w-[80px]"],
  ["AUP", "min-w-[120px]"],
  ["校区", "min-w-[64px]"],
  ["总数", "min-w-[52px]"],
  ["总额", "min-w-[90px]"],
  ["整单备注", "min-w-[180px]"],
  ["状态", "min-w-[80px]"],
  ["提交时间", "min-w-[130px]"],
];
const LINE_COLS: Array<[string, string]> = [
  ["物品 / 规格", "min-w-[180px]"],
  ["供应商", "min-w-[150px]"],
  ["雄数", "min-w-[52px]"],
  ["雌数", "min-w-[52px]"],
  ["数量", "min-w-[52px]"],
  ["小计", "min-w-[90px]"],
  ["领用人", "min-w-[80px]"],
  ["领用方式/房间", "min-w-[150px]"],
  ["笼位", "min-w-[150px]"],
  ["到货日期", "min-w-[100px]"],
  ["行备注", "min-w-[160px]"],
];

function OrderTable({ displays, linesByKey }: { displays: OrderDisplay[]; linesByKey: Map<string, RefOrderLine[] | undefined> }) {
  const th = "px-2 py-2 whitespace-nowrap text-[11px] text-[var(--student-mute)] bg-[var(--student-canvas-soft)]";
  const td = "px-2 py-2 align-top text-[11px] text-[var(--student-ink)] break-words";
  const split = "border-l border-l-[var(--student-hairline)]";
  const orderSep = "border-t-2 border-t-[var(--student-hairline)]";
  return (
    <div className="overflow-auto rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface-raised)]">
      <table className="w-max min-w-full border-collapse text-left">
        <thead>
          <tr>
            {ORDER_COLS.map(([c, w]) => <th key={c} className={cn(th, w)}>{c}</th>)}
            {LINE_COLS.map(([c, w], i) => <th key={c} className={cn(th, w, i === 0 && split)}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {displays.map((d) => {
            const lines = linesByKey.get(d.key) ?? [];
            const rows: Array<RefOrderLine | null> = lines.length > 0 ? lines : [null];
            const span = rows.length;
            return rows.map((line, i) => {
              const names = line ? lineNames(line) : null;
              const opt = line ? specOptionText(line) : "";
              const sex = line ? lineGenderQty(line) : { male: 0, female: 0 };
              const label = names ? (names.strain || names.spec || "物品") : "";
              const sub = names ? [names.spec && names.spec !== label ? names.spec : "", opt].filter(Boolean).join(" · ") : "";
              const merge = (node: ReactNode, extra?: string) =>
                i === 0 ? <td rowSpan={span} className={cn(td, extra)}>{node}</td> : null;
              return (
                <tr key={`${d.key}-${line?.id ?? "none"}`} className={cn("border-t border-[var(--student-hairline)]", i === 0 && orderSep)}>
                  {merge(<span className="font-mono text-[10px] text-[var(--student-mute)]">{d.no}</span>)}
                  {merge(d.source === "ARO" ? "ARO" : "本地")}
                  {merge(d.projectGroup)}
                  {merge(d.submitter)}
                  {merge(d.aup)}
                  {merge(d.campus)}
                  {merge(d.totalQty, "tabular-nums font-semibold")}
                  {merge(d.amount != null ? `¥${Number(d.amount).toFixed(2)}` : "—", "text-right tabular-nums font-semibold text-sky-700")}
                  {merge(<span className="block max-w-[180px] whitespace-normal break-words">{d.orderRemark}</span>)}
                  {merge(d.statusLabel)}
                  {merge(d.time, "text-[10px] text-[var(--student-mute)]")}

                  {/* ── 行级 ── */}
                  <td className={cn(td, split, "max-w-[180px]")}>
                    {line ? (<>
                      <div>{label}</div>
                      {sub && <div className="text-[10px] text-[var(--student-mute)]">{sub}</div>}
                    </>) : "—"}
                  </td>
                  <td className={cn(td, "max-w-[150px]")}>{names?.supplier || "—"}</td>
                  <td className={cn(td, "tabular-nums")}>{line ? sex.male : "—"}</td>
                  <td className={cn(td, "tabular-nums")}>{line ? sex.female : "—"}</td>
                  <td className={cn(td, "tabular-nums")}>{line ? (line.quantity ?? 0) : "—"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{line?.lineAmount != null ? `¥${Number(line.lineAmount).toFixed(2)}` : "—"}</td>
                  <td className={td}>{line?.collectorName?.trim() || "—"}</td>
                  <td className={cn(td, "max-w-[150px]")}>{line?.pickupRoomName?.trim() || "—"}</td>
                  <td className={cn(td, "max-w-[150px]")}>{line?.targetCageLabel?.trim() || "—"}</td>
                  <td className={td}>{line?.arrivalDate?.trim() || d.arrivalDate}</td>
                  <td className={cn(td, "max-w-[160px]")}>{line?.lineRemark?.trim() || "—"}</td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════ 卡片 ════════════ */

function OrderCard({ d, lines, onEdit }: { d: OrderDisplay; lines: RefOrderLine[]; onEdit?: (orderId: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const aupGroups = useMemo(() => groupLinesByAup(lines), [lines]);
  const fieldLabel = "text-[10px] text-[var(--student-mute)]";
  const fieldValue = "text-xs text-[var(--student-ink)]";

  return (
    <div className="rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface-raised)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 font-mono text-[11px] text-[var(--student-mute)]">{d.no}</span>
          <span className="rounded bg-[var(--student-canvas-soft)] px-1.5 py-0.5 text-[10px] text-[var(--student-body)]">{d.source === "ARO" ? "ARO" : "本地"}</span>
          <span className="text-[11px] font-medium text-[var(--student-ink)]">{d.statusLabel}</span>
          {d.aup !== "—" && <span className="rounded bg-[var(--student-canvas-soft)] px-1.5 py-0.5 text-[10px] text-[var(--student-body)]">{d.aup}</span>}
        </div>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="shrink-0 text-[10px] text-[var(--student-mute)]">
          {expanded ? "收起 ▲" : "展开 ▼"}
        </button>
      </div>

      {/* 只有该单提交人（PI）能编辑：editable 由服务端判定下发 */}
      {d.editable && d.status === "PENDING" && onEdit && (
        <div className="mt-1.5 flex justify-end">
          <button type="button" onClick={() => onEdit(d.orderId)} className="rounded-full border border-[var(--student-hairline)] px-3 py-1 text-[11px] text-[var(--student-body)]">
            编辑
          </button>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span><span className={fieldLabel}>课题组 </span><span className={cn(fieldValue, "font-medium")}>{d.projectGroup}</span></span>
        <span><span className={fieldLabel}>总数 </span><span className={cn(fieldValue, "font-semibold")}>{d.totalQty}</span></span>
        <span><span className={fieldLabel}>金额 </span><span className={cn(fieldValue, "font-semibold text-sky-700")}>{d.amount != null ? `¥${Number(d.amount).toFixed(2)}` : "—"}</span></span>
      </div>
      {!expanded && d.items.length > 0 && (
        <div className="mt-1 text-[11px] text-[var(--student-body)]">
          {d.items.slice(0, 2).map((it, i) => (
            <div key={i} className="truncate">{it.label}{it.spec ? ` · ${it.spec}` : ""} × {it.qty}</div>
          ))}
          {d.items.length > 2 && <div className="text-[10px] text-[var(--student-mute)]">另有 {d.items.length - 2} 项…</div>}
        </div>
      )}

      {expanded && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {([
              ["课题组", d.projectGroup], ["负责人", d.submitter],
              ["供应商", d.suppliers], ["品系", d.strains],
              ["雄数", String(d.maleQty)], ["雌数", String(d.femaleQty)],
              ["总数", String(d.totalQty)], ["金额", d.amount != null ? `¥${Number(d.amount).toFixed(2)}` : "—"],
              ["领用人", d.collector], ["领用方式/房间", d.room],
              ["笼位", d.cage],
              ["到货日期", d.arrivalDate], ["校区", d.campus],
              ["提交时间", d.time],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <div className={fieldLabel}>{k}</div>
                <div className={cn(fieldValue, "truncate")} title={v}>{v}</div>
              </div>
            ))}
            <div className="col-span-2 min-w-0">
              <div className={fieldLabel}>备注</div>
              <div className={cn(fieldValue, "truncate")} title={d.remark}>{d.remark}</div>
            </div>
          </div>

          {aupGroups.map((g) => (
            <div key={g.key} className="mt-2 space-y-1 border-l-2 border-[var(--student-hairline)] pl-2">
              <div className="text-[11px] font-semibold text-[var(--student-ink)]">{g.label}</div>
              {g.lines.map((line) => {
                const { supplier, strain, spec } = lineNames(line);
                const opt = specOptionText(line);
                return (
                  <div key={line.id} className="rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] px-2 py-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-[var(--student-ink)]">{strain || spec || "物品"}</div>
                        <div className="flex flex-wrap gap-x-2 text-[10px] text-[var(--student-mute)]">
                          {spec && <span>规格 {spec}</span>}
                          {opt && <span>{opt}</span>}
                          {supplier && <span>供应商 {supplier}</span>}
                          {line.collectorName && <span>领用人 {line.collectorName}</span>}
                          {line.pickupRoomName && <span>房间 {line.pickupRoomName}</span>}
                          {line.targetCageLabel && <span>笼位 {line.targetCageLabel}</span>}
                          {line.arrivalDate && <span>到货 {line.arrivalDate}</span>}
                        </div>
                        {line.lineRemark && <div className="truncate text-[10px] text-amber-700">行备注：{line.lineRemark}</div>}
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">×{line.quantity}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
