/**
 * 物资申领审计导出 — 个人审计 + 课题组审计 + 按物品审计。
 * 学生：只看自己/自己课题组。教职工：可选择任意有记录的人员/课题组。
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMyMaterialRequests, fetchMaterialRequestDetail, fetchAllMaterialRequests,
  fetchAdminMaterialCategories, fetchAdminMaterialItems,
  fetchMaterialAuditTrail, exportMaterialAuditTrail,
  type MaterialRequest, type MaterialAuditTrailRow, type MaterialItem,
} from "@/api/domains/material.api";
import { authHttp } from "@/api/core/authHttp";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

type TabKey = "personal" | "group" | "item";

function downloadBlob(blob: Blob, name: string) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }
function toTime(v?: string | null) { if (!v) return "-"; return String(v).replace("T", " ").slice(0, 19); }
function statusZh(s: string) { const m: Record<string, string> = { DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过", APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "已出库", RECEIVED: "已完成" }; return m[s] || s; }
function iso(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function monthStart() { const t = new Date(); return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(t) }; }

function aggregateRows(requests: MaterialRequest[]) {
  return requests.flatMap(r => (r.lines || []).map(l => ({ requestId: r.id, createdAt: r.createdAt, status: r.status, applicantName: r.applicantName, applicantGroup: r.applicantGroup, snapshotName: l.snapshotName, qty: l.qty, fulfilledQty: l.fulfilledQty, fulfilledAt: r.fulfilledAt, firstReviewerId: r.firstReviewerId, secondReviewerId: r.secondReviewerId })));
}

export default function MaterialAuditExportPage() {
  const role = authStorage.getRole() || "STUDENT";
  const isStaff = hasMinRole(role, "STAFF");
  const canAudit = hasMinRole(role, "SENIOR");
  const selfGroup = authStorage.getUserInfo()?.departmentName?.trim() ?? "";

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>("personal");
  const [mode, setMode] = useState<"single" | "multi">("single");
  const dr = useMemo(() => monthStart(), []);
  const [from, setFrom] = useState(dr.from);
  const [to, setTo] = useState(dr.to);
  const [selectedId, setSelectedId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(selfGroup);

  // 按物品审计
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [itemKeyword, setItemKeyword] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [auditPage, setAuditPage] = useState(1);

  const { data: groupList = [] } = useQuery({
    queryKey: ["material", "groups-with-records"],
    queryFn: async () => { const r = await authHttp.get<{ success: boolean; data: string[] }>("/material/admin/groups-with-records"); return r.data?.data ?? []; },
    enabled: isStaff,
  });
  const { data: myData } = useQuery({
    queryKey: ["material", "requests", "mine", { page: 1, size: 300 }],
    queryFn: () => fetchMyMaterialRequests({ page: 1, size: 300 }),
  });
  const { data: allData } = useQuery({
    queryKey: ["material", "requests", "all", { page: 1, size: 500 }],
    queryFn: () => fetchAllMaterialRequests({ page: 1, size: 500 }),
    enabled: isStaff,
  });
  const allRequests = (isStaff ? allData?.data : myData?.data) || [];
  const myRequests = myData?.data || [];
  const groupRequests = useMemo(() => {
    if (!selectedGroup) return [];
    return (isStaff ? (allData?.data || []) : myRequests).filter(r => r.applicantGroup === selectedGroup);
  }, [allData, myRequests, selectedGroup, isStaff]);
  const { data: detail } = useQuery({
    queryKey: ["material", "request", selectedId],
    queryFn: () => fetchMaterialRequestDetail(selectedId),
    enabled: !!selectedId,
  });
  const displayRows = useMemo(() => {
    const source = tab === "personal" ? myRequests : groupRequests;
    if (mode === "single" || tab === "item") return [];
    return aggregateRows(source.filter(r => { const d = (r.createdAt || "").slice(0, 10); return d >= from && d <= to; }));
  }, [tab, mode, myRequests, groupRequests, from, to]);

  // 按物品审计数据
  const { data: categories = [] } = useQuery({
    queryKey: ["material", "admin", "categories"],
    queryFn: () => fetchAdminMaterialCategories(),
    enabled: canAudit && tab === "item",
  });
  const { data: items = [] } = useQuery({
    queryKey: ["material", "admin", "items", categoryId],
    queryFn: () => fetchAdminMaterialItems(categoryId === "" ? undefined : categoryId),
    enabled: canAudit && tab === "item",
  });
  const { data: auditData } = useQuery({
    queryKey: ["material", "audit", selectedItemId, auditPage],
    queryFn: () => fetchMaterialAuditTrail({ page: auditPage, size: 20 }),
    enabled: tab === "item" && !!selectedItemId,
  });
  const filteredItems = useMemo(() => {
    const k = itemKeyword.trim().toLowerCase();
    return !k ? items : items.filter(it => String(it.name || "").toLowerCase().includes(k));
  }, [items, itemKeyword]);

  const handleExportSingle = async () => {
    if (!selectedId) return toast.error("请选择申领单");
    setExporting(true);
    try { const blob = await exportMaterialAuditTrail({ from: "2000-01-01", to: "2099-12-31" }); downloadBlob(blob, `material-${selectedId}.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); } finally { setExporting(false); }
  };
  const handleExportRange = async () => {
    setExporting(true);
    try { const blob = await exportMaterialAuditTrail({ from, to }); downloadBlob(blob, `material-${tab}-${from}_${to}.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); } finally { setExporting(false); }
  };
  const handleExportAudit = async () => {
    setExporting(true);
    try { const blob = await exportMaterialAuditTrail({}); downloadBlob(blob, `material-audit.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); } finally { setExporting(false); }
  };

  const sourceList = tab === "personal" ? myRequests : groupRequests;
  const inputCls = "rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm";
  const tabBtn = (k: TabKey, label: string) => (
    <button className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === k ? "bg-sky-600 text-white" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]"}`} onClick={() => { setTab(k); setSelectedId(""); setMode("single"); }}>{label}</button>
  );

  return (
    <div className="space-y-4 p-6">
      <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
        <h1 className="text-lg font-semibold text-[var(--twin-ink)]">申领审计</h1>
        <p className="mt-1 text-xs text-[var(--twin-mute)]">个人审计：按个人查看导出。课题组审计：按课题组查看导出。按物品审计：按物品查看申领流水与库存轨迹。</p>
        <div className="mt-3 flex gap-2">{tabBtn("personal", "个人审计")}{tabBtn("group", "课题组审计")}{canAudit && tabBtn("item", "按物品审计")}</div>
      </div>

      {/* ═══════ 个人 / 课题组（单次+多次） ═══════ */}
      {tab !== "item" && (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="inline-flex rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5 text-xs font-medium">
              <button className={`rounded-full px-3 py-1.5 ${mode === "single" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-twin-level-1" : "text-[var(--twin-body)]"}`} onClick={() => setMode("single")}>单次</button>
              <button className={`rounded-full px-3 py-1.5 ${mode === "multi" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-twin-level-1" : "text-[var(--twin-body)]"}`} onClick={() => setMode("multi")}>多次</button>
            </div>
            {tab === "group" && isStaff && groupList.length > 0 && (
              <select className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm min-w-[180px]" value={selectedGroup} onChange={e => { setSelectedGroup(e.target.value); setSelectedId(""); }}>
                {groupList.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            {tab === "group" && !isStaff && <span className="text-sm text-[var(--twin-body)]">课题组：{selfGroup || "未分配"}</span>}
            {mode === "single" ? (
              <>
                <select className="flex-1 min-w-[200px] rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                  <option value="">请选择申领单...</option>
                  {sourceList.map(r => <option key={r.id} value={r.id}>{(r.createdAt||"").slice(0,10)} · {statusZh(r.status)} · {r.applicantName||r.userId}</option>)}
                </select>
                <button onClick={handleExportSingle} disabled={exporting || !selectedId} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">导出 Excel</button>
              </>
            ) : (
              <>
                <span className="text-xs text-[var(--twin-mute)]">共 {displayRows.length} 行</span>
                <button onClick={handleExportRange} disabled={exporting} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">导出区间 Excel</button>
              </>
            )}
          </div>
          {mode === "multi" && (
            <div className="flex flex-wrap items-end gap-3 border-t border-[var(--twin-hairline)] pt-3 mb-3">
              <div><label className="mb-1 block text-xs text-[var(--twin-body)]">开始日期</label><input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} /></div>
              <span className="pb-2 text-sm text-[var(--twin-mute)]">～</span>
              <div><label className="mb-1 block text-xs text-[var(--twin-body)]">结束日期</label><input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} /></div>
            </div>
          )}
          {mode === "single" && detail && (
            <>
              <dl className="grid gap-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 text-xs sm:grid-cols-2">
                <div><dt className="text-[var(--twin-mute)]">状态</dt><dd>{statusZh(detail.status)}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">申领人</dt><dd>{detail.applicantName || detail.userId}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">课题组</dt><dd>{detail.applicantGroup || "-"}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">申请时间</dt><dd>{toTime(detail.createdAt)}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">审核人</dt><dd>{detail.firstReviewerId || "-"}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">复审人</dt><dd>{detail.secondReviewerId || "-"}</dd></div>
                <div><dt className="text-[var(--twin-mute)]">出库时间</dt><dd>{toTime(detail.fulfilledAt)}</dd></div>
              </dl>
              <div className="mt-3 overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
                <table className="min-w-full text-xs"><thead className="bg-[var(--twin-canvas-soft)]"><tr><th className="px-2 py-2 text-left">物品</th><th className="px-2 py-2">数量</th><th className="px-2 py-2">出库</th></tr></thead>
                  <tbody>{(detail.lines||[]).map(l => <tr key={l.id}><td className="px-2 py-2">{l.snapshotName}</td><td className="px-2 py-2 text-center">{l.qty}</td><td className="px-2 py-2 text-center">{l.fulfilledQty}</td></tr>)}</tbody></table>
              </div>
            </>
          )}
          {mode === "multi" && displayRows.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
              <table className="min-w-full text-xs"><thead className="bg-[var(--twin-canvas-soft)]"><tr><th className="px-2 py-2 text-left">单号</th><th className="px-2 py-2 text-left">物品</th><th className="px-2 py-2">数量</th><th className="px-2 py-2">状态</th><th className="px-2 py-2 text-left">申领人</th><th className="px-2 py-2 text-left">课题组</th><th className="px-2 py-2 text-left">时间</th></tr></thead>
                <tbody>{displayRows.map((r: any, i: number) => <tr key={i}><td className="px-2 py-2 font-mono text-[10px]">{r.requestId}</td><td className="px-2 py-2">{r.snapshotName}</td><td className="px-2 py-2 text-center">{r.qty}</td><td className="px-2 py-2 text-center">{statusZh(r.status)}</td><td className="px-2 py-2">{r.applicantName||"-"}</td><td className="px-2 py-2">{r.applicantGroup||"-"}</td><td className="px-2 py-2">{toTime(r.createdAt)}</td></tr>)}</tbody></table>
            </div>
          )}
          {mode === "multi" && displayRows.length === 0 && <p className="text-xs text-[var(--twin-mute)] py-4 text-center">该区间暂无数据</p>}
        </section>
      )}

      {/* ═══════ 按物品审计 ═══════ */}
      {tab === "item" && (
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
          <button onClick={handleExportAudit} disabled={exporting || selectedItemId === ""} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50 mb-3">导出审计 Excel</button>
          <div className="overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
            <table className="min-w-full text-xs"><thead className="bg-[var(--twin-canvas-soft)]"><tr><th className="px-2 py-2 text-left">时间</th><th className="px-2 py-2 text-left">申领人</th><th className="px-2 py-2 text-left">课题组</th><th className="px-2 py-2 text-left">物品</th><th className="px-2 py-2">数量</th><th className="px-2 py-2">出库</th><th className="px-2 py-2 text-left">状态</th></tr></thead>
              <tbody>{(auditData?.data||[]).map((row: MaterialAuditTrailRow, i: number) => <tr key={i}><td className="px-2 py-2 whitespace-nowrap">{toTime(row.createdAt)}</td><td className="px-2 py-2">{row.applicantName||"-"}</td><td className="px-2 py-2">{row.applicantGroup||"-"}</td><td className="px-2 py-2">{row.itemName||"-"}</td><td className="px-2 py-2 text-center">{row.qty}</td><td className="px-2 py-2 text-center">{row.fulfilledQty}</td><td className="px-2 py-2">{row.status}</td></tr>)}</tbody></table>
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
