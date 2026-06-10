/**
 * 物资申领 Excel 预览与审计流水 — 与 /admin/supplies/audit-export 相同逻辑。
 * Tab 1: 个人申领（单次+多次区间）Tab 2: 按物品审计
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMyMaterialRequests, fetchMaterialRequestDetail,
  fetchAdminMaterialCategories, fetchAdminMaterialItems,
  fetchMaterialAuditTrail, exportMaterialAuditTrail,
  type MaterialRequest, type MaterialRequestLine, type MaterialAuditTrailRow,
  type MaterialCategory, type MaterialItem,
} from "@/api/domains/material.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

type TabKey = "personal" | "audit";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}
function toTime(v?: string | null) { if (!v) return "-"; return String(v).replace("T", " ").slice(0, 19); }
function statusZh(s: string) {
  const m: Record<string, string> = { DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过", APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "已出库", RECEIVED: "已完成" };
  return m[s] || s;
}
function isoDateLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function defaultMonthStartToToday() { const to = new Date(); return { from: isoDateLocal(new Date(to.getFullYear(), to.getMonth(), 1)), to: isoDateLocal(to) }; }

export default function MaterialAuditExportPage() {
  const role = authStorage.getRole() || "STUDENT";
  const canSubmit = hasMinRole(role, "STAFF");
  const canAudit = hasMinRole(role, "SENIOR");
  const canPickOthers = hasMinRole(role, "SUPER_ADMIN");
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") as TabKey | null) || "personal";

  const [tab, setTab] = useState<TabKey>(tabParam === "audit" && canAudit ? "audit" : "personal");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [exporting, setExporting] = useState(false);

  const initialRange = useMemo(() => defaultMonthStartToToday(), []);
  const [personalMode, setPersonalMode] = useState<"single" | "multi">("single");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [exportingRange, setExportingRange] = useState(false);

  // Audit tab
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [itemKeyword, setItemKeyword] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [auditPage, setAuditPage] = useState(1);
  const [exportingAudit, setExportingAudit] = useState(false);

  // Personal: my requests
  const { data: myData } = useQuery({
    queryKey: ["material", "requests", "mine", { page: 1, size: 200 }],
    queryFn: () => fetchMyMaterialRequests({ page: 1, size: 200 }),
    enabled: canSubmit,
  });
  const myRequests = myData?.data || [];

  // Personal: selected request detail
  const { data: requestDetail } = useQuery({
    queryKey: ["material", "request", selectedRequestId],
    queryFn: () => fetchMaterialRequestDetail(selectedRequestId),
    enabled: tab === "personal" && personalMode === "single" && !!selectedRequestId,
  });

  // Audit: categories + items
  const { data: categories = [] } = useQuery({
    queryKey: ["material", "admin", "categories"],
    queryFn: () => fetchAdminMaterialCategories(),
    enabled: canAudit && tab === "audit",
  });
  const { data: items = [] } = useQuery({
    queryKey: ["material", "admin", "items", categoryId],
    queryFn: () => fetchAdminMaterialItems(categoryId === "" ? undefined : categoryId),
    enabled: canAudit && tab === "audit",
  });

  // Audit: trail data
  const { data: auditData } = useQuery({
    queryKey: ["material", "audit", selectedItemId, auditPage],
    queryFn: () => fetchMaterialAuditTrail({ page: auditPage, size: 20 }),
    enabled: tab === "audit" && !!selectedItemId,
  });

  const filteredItems = useMemo(() => {
    const k = itemKeyword.trim().toLowerCase();
    return !k ? items : items.filter(it => String(it.name || "").toLowerCase().includes(k));
  }, [items, itemKeyword]);

  // Personal multi: aggregated rows from my requests in range
  const rangeRows = useMemo(() => {
    if (personalMode !== "multi") return [];
    return myRequests
      .filter(r => { const d = (r.createdAt || "").slice(0, 10); return d >= rangeFrom && d <= rangeTo; })
      .flatMap(r => (r.lines || []).map(l => ({ ...l, requestId: r.id, createdAt: r.createdAt, status: r.status, applicantName: r.applicantName, applicantGroup: r.applicantGroup, fulfilledAt: r.fulfilledAt })));
  }, [myRequests, personalMode, rangeFrom, rangeTo]);

  const handleExportPersonal = async () => {
    if (!selectedRequestId) return toast.error("请选择申领单");
    setExporting(true);
    try { const blob = await exportMaterialAuditTrail({ from: "2000-01-01", to: "2099-12-31" }); downloadBlob(blob, `material-request-${selectedRequestId}.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); }
    finally { setExporting(false); }
  };

  const handleExportRange = async () => {
    setExportingRange(true);
    try { const blob = await exportMaterialAuditTrail({ from: rangeFrom, to: rangeTo }); downloadBlob(blob, `material-range-${rangeFrom}_${rangeTo}.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); }
    finally { setExportingRange(false); }
  };

  const handleExportAudit = async () => {
    setExportingAudit(true);
    try { const blob = await exportMaterialAuditTrail({}); downloadBlob(blob, `material-audit.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); }
    finally { setExportingAudit(false); }
  };

  if (!canSubmit) return <div className="p-6 text-sm text-[var(--twin-mute)]">无权限访问申领导出页。</div>;

  const tabBtn = (k: TabKey, label: string, color: string) => (
    <button type="button" className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === k ? `${color} text-white` : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]"}`} onClick={() => { setTab(k); setSearchParams({ tab: k }); }}>{label}</button>
  );

  const inputCls = "rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm";

  return (
    <div className="space-y-4 p-6">
      <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
        <h1 className="text-lg font-semibold text-[var(--twin-ink)]">申领审计</h1>
        <p className="mt-1 text-xs text-[var(--twin-mute)]">个人：预览申领单明细并导出。按物品审计：按物品查看申领流水。</p>
        <div className="mt-3 flex gap-2">{tabBtn("personal", "个人申领单", "bg-sky-600")}{canAudit && tabBtn("audit", "按物品审计", "bg-violet-600")}</div>
      </div>

      {/* ═══════════ 个人申领 ═══════════ */}
      {tab === "personal" && (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="inline-flex rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5 text-xs font-medium">
              <button className={`rounded-full px-3 py-1.5 ${personalMode === "single" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-twin-level-1" : "text-[var(--twin-body)]"}`} onClick={() => setPersonalMode("single")}>单次</button>
              <button className={`rounded-full px-3 py-1.5 ${personalMode === "multi" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-twin-level-1" : "text-[var(--twin-body)]"}`} onClick={() => setPersonalMode("multi")}>多次</button>
            </div>
            {personalMode === "single" && (
              <select className="flex-1 min-w-[200px] rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm" value={selectedRequestId} onChange={e => setSelectedRequestId(e.target.value)}>
                <option value="">请选择申领单...</option>
                {myRequests.map(r => <option key={r.id} value={r.id}>{(r.createdAt||"").slice(0,10)} · {statusZh(r.status)} · {r.applicantName||r.userId}</option>)}
              </select>
            )}
            {personalMode === "single" && (
              <button onClick={handleExportPersonal} disabled={exporting || !selectedRequestId} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{exporting ? "导出中…" : "导出 Excel"}</button>
            )}
            {personalMode === "multi" && (
              <button onClick={handleExportRange} disabled={exportingRange} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{exportingRange ? "导出中…" : "导出区间 Excel"}</button>
            )}
          </div>

          {personalMode === "multi" && (
            <div className="flex flex-wrap items-end gap-3 border-t border-[var(--twin-hairline)] pt-3 mb-3">
              <div><label className="mb-1 block text-xs text-[var(--twin-body)]">开始日期</label><input type="date" className={inputCls} value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} /></div>
              <span className="pb-2 text-sm text-[var(--twin-mute)]">～</span>
              <div><label className="mb-1 block text-xs text-[var(--twin-body)]">结束日期</label><input type="date" className={inputCls} value={rangeTo} onChange={e => setRangeTo(e.target.value)} /></div>
              <span className="pb-2 text-xs text-[var(--twin-mute)]">共 {rangeRows.length} 行</span>
            </div>
          )}

          {/* 单次预览 */}
          {personalMode === "single" && requestDetail && (
            <>
              <dl className="grid gap-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 text-xs sm:grid-cols-2">
                <div><dt className="text-[var(--twin-mute)]">状态</dt><dd>{statusZh(requestDetail.status)}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">申领人</dt><dd>{requestDetail.applicantName || requestDetail.userId}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">课题组</dt><dd>{requestDetail.applicantGroup || "-"}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">申请时间</dt><dd>{toTime(requestDetail.createdAt)}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">审核人</dt><dd>{requestDetail.firstReviewerId || "-"}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">复审人</dt><dd>{requestDetail.secondReviewerId || "-"}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">出库时间</dt><dd>{toTime(requestDetail.fulfilledAt)}</dd></div>
              </dl>
              <div className="mt-3 overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
                <table className="min-w-full text-xs">
                  <thead className="bg-[var(--twin-canvas-soft)]"><tr><th className="px-2 py-2 text-left">物品名称</th><th className="px-2 py-2">数量</th><th className="px-2 py-2">出库</th></tr></thead>
                  <tbody>{(requestDetail.lines||[]).map(l => <tr key={l.id} className="hover:bg-[var(--twin-canvas-soft)]"><td className="px-2 py-2">{l.snapshotName}</td><td className="px-2 py-2 text-center">{l.qty}</td><td className="px-2 py-2 text-center">{l.fulfilledQty}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}

          {/* 多次预览 */}
          {personalMode === "multi" && rangeRows.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
              <table className="min-w-full text-xs">
                <thead className="bg-[var(--twin-canvas-soft)]"><tr><th className="px-2 py-2 text-left">申领单号</th><th className="px-2 py-2 text-left">物品</th><th className="px-2 py-2">数量</th><th className="px-2 py-2">状态</th><th className="px-2 py-2 text-left">申领人</th><th className="px-2 py-2 text-left">课题组</th><th className="px-2 py-2 text-left">时间</th></tr></thead>
                <tbody>{rangeRows.map((r: any, i: number) => <tr key={i} className="hover:bg-[var(--twin-canvas-soft)]"><td className="px-2 py-2 font-mono text-[10px]">{r.requestId}</td><td className="px-2 py-2">{r.snapshotName}</td><td className="px-2 py-2 text-center">{r.qty}</td><td className="px-2 py-2 text-center">{statusZh(r.status)}</td><td className="px-2 py-2">{r.applicantName||"-"}</td><td className="px-2 py-2">{r.applicantGroup||"-"}</td><td className="px-2 py-2">{toTime(r.createdAt)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ═══════════ 按物品审计 ═══════════ */}
      {tab === "audit" && (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <div><label className="mb-1 block text-xs text-[var(--twin-body)]">物资分类</label>
              <select className="w-full rounded-twin-lg border border-[var(--twin-hairline)] px-3 py-2 text-sm" value={categoryId===""?"":String(categoryId)} onChange={e => { setCategoryId(e.target.value===""?"":Number(e.target.value)); setSelectedItemId(""); }}>
                <option value="">全部分类</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="mb-1 block text-xs text-[var(--twin-body)]">搜索物品</label><input className="w-full rounded-twin-lg border border-[var(--twin-hairline)] px-3 py-2 text-sm" placeholder="按名称筛选" value={itemKeyword} onChange={e => setItemKeyword(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs text-[var(--twin-body)]">选择物品</label>
              <select className="w-full rounded-twin-lg border border-[var(--twin-hairline)] px-3 py-2 text-sm" value={selectedItemId===""?"":String(selectedItemId)} onChange={e => { setSelectedItemId(e.target.value===""?"":Number(e.target.value)); setAuditPage(1); }}>
                <option value="">请选择...</option>{filteredItems.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleExportAudit} disabled={exportingAudit || selectedItemId === ""} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50 mb-3">{exportingAudit ? "导出中…" : "导出审计 Excel"}</button>
          <div className="overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--twin-canvas-soft)]"><tr><th className="px-2 py-2 text-left">时间</th><th className="px-2 py-2 text-left">申领人</th><th className="px-2 py-2 text-left">课题组</th><th className="px-2 py-2 text-left">物品</th><th className="px-2 py-2">数量</th><th className="px-2 py-2">出库</th><th className="px-2 py-2 text-left">状态</th></tr></thead>
              <tbody>
                {(auditData?.data||[]).map((row: MaterialAuditTrailRow, i: number) => <tr key={i} className="hover:bg-[var(--twin-canvas-soft)]"><td className="px-2 py-2 whitespace-nowrap">{toTime(row.createdAt)}</td><td className="px-2 py-2">{row.applicantName||"-"}</td><td className="px-2 py-2">{row.applicantGroup||"-"}</td><td className="px-2 py-2">{row.itemName||"-"}</td><td className="px-2 py-2 text-center">{row.qty}</td><td className="px-2 py-2 text-center">{row.fulfilledQty}</td><td className="px-2 py-2">{row.status}</td></tr>)}
              </tbody>
            </table>
            {(!auditData?.data || auditData.data.length === 0) && <p className="p-4 text-center text-xs text-[var(--twin-mute)]">请选择物品查看流水</p>}
          </div>
          {auditData && auditData.total > 20 && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={auditPage<=1} onClick={() => setAuditPage(p=>p-1)}>上一页</button>
              <span>第 {auditPage} 页 / 共 {Math.ceil(auditData.total/20)} 页</span>
              <button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={auditPage>=Math.ceil(auditData.total/20)} onClick={() => setAuditPage(p=>p+1)}>下一页</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
