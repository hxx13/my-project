/**
 * 物资申领审计导出 — 个人审计 + 课题组审计 + 按物品审计。
 * 学生：仅自己/自己课题组。教职工：可选任意人员/课题组。
 * 统一日期区间筛选 + 合并表格，无需区分单次/多次。
 */
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMyMaterialRequests, fetchAllMaterialRequests,
  fetchAdminMaterialCategories, fetchAdminMaterialItems,
  fetchItemStockMovements, exportMaterialAuditTrail,
  type MaterialRequest, type MaterialAuditTrailRow, type MaterialStockMovementRow,
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

export default function MaterialAuditExportPage() {
  const role = authStorage.getRole() || "STUDENT";
  const isStaff = hasMinRole(role, "STAFF");
  const canAudit = hasMinRole(role, "SENIOR");
  const selfUserId = authStorage.getUserInfo()?.id?.trim() ?? "";
  const selfGroup = authStorage.getUserInfo()?.departmentName?.trim() ?? "";

  const [tab, setTab] = useState<TabKey>("personal");
  const dr = useMemo(() => monthStart(), []);
  const [from, setFrom] = useState(dr.from);
  const [to, setTo] = useState(dr.to);
  const [exporting, setExporting] = useState(false);

  // 个人审计：选人
  const [selectedUserId, setSelectedUserId] = useState(selfUserId);
  const { data: applicantList = [] } = useQuery({
    queryKey: ["material", "applicants-with-records"],
    queryFn: async () => { const r = await authHttp.get<{ success: boolean; data: Array<{ userId: string; applicantName: string }> }>("/material/admin/applicants-with-records"); return r.data?.data ?? []; },
    enabled: isStaff && tab === "personal",
  });

  // 课题组审计：选组
  const [selectedGroup, setSelectedGroup] = useState(selfGroup);
  const { data: groupList = [] } = useQuery({
    queryKey: ["material", "groups-with-records"],
    queryFn: async () => { const r = await authHttp.get<{ success: boolean; data: string[] }>("/material/admin/groups-with-records"); return r.data?.data ?? []; },
    enabled: isStaff && tab === "group",
  });

  // 按物品审计
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [itemKeyword, setItemKeyword] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [auditPage, setAuditPage] = useState(1);

  // 数据加载 — 个人审计：按 selectedUserId 服务端筛选
  const queryUserId = tab === "personal" ? (isStaff ? selectedUserId : selfUserId) : undefined;
  const queryGroup = tab === "group" ? selectedGroup : undefined;
  const { data: queryData } = useQuery({
    queryKey: ["material", "requests", "audit", { tab, applicantUserId: queryUserId, applicantGroup: queryGroup }],
    queryFn: () => tab === "personal" && !isStaff
      ? fetchMyMaterialRequests({ page: 1, size: 500 })
      : fetchAllMaterialRequests({ page: 1, size: 500, applicantUserId: queryUserId, applicantGroup: queryGroup }),
    enabled: tab !== "item",
  });
  const auditRequests: MaterialRequest[] = useMemo(() => {
    const raw = queryData?.data ?? [];
    return raw.filter(r => { const d = (r.createdAt || "").slice(0, 10); return d >= from && d <= to; });
  }, [queryData, from, to]);

  const currentRows = useMemo(() => {
    return auditRequests.flatMap(r => (r.lines || []).map(l => ({ ...l, requestId: r.id, createdAt: r.createdAt, status: r.status, applicantName: r.applicantName, applicantGroup: r.applicantGroup })));
  }, [auditRequests]);

  // For dropdown lists — load all for selectors
  const { data: myListData } = useQuery({
    queryKey: ["material", "requests", "mine", { page: 1, size: 500 }],
    queryFn: () => fetchMyMaterialRequests({ page: 1, size: 500 }),
    enabled: !isStaff,
  });

  // 按物品审计
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
  const { data: movementData } = useQuery({
    queryKey: ["material", "movements", selectedItemId, auditPage],
    queryFn: () => fetchItemStockMovements(Number(selectedItemId), { page: auditPage, size: 20 }),
    enabled: tab === "item" && !!selectedItemId,
  });
  const filteredItems = useMemo(() => {
    const k = itemKeyword.trim().toLowerCase();
    return !k ? items : items.filter(it => String(it.name || "").toLowerCase().includes(k));
  }, [items, itemKeyword]);

  const currentLabel = tab === "personal"
    ? (isStaff && selectedUserId ? (applicantList.find((a: any) => a.userId === selectedUserId)?.applicantName || selectedUserId) : "本人")
    : (selectedGroup || "未分配");

  const handleExport = async () => {
    setExporting(true);
    try { const blob = await exportMaterialAuditTrail({ from, to }); downloadBlob(blob, `material-${tab}-${from}_${to}.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); } finally { setExporting(false); }
  };
  const handleExportAudit = async () => {
    setExporting(true);
    try { const blob = await exportMaterialAuditTrail({ from, to }); downloadBlob(blob, `material-audit-item.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); } finally { setExporting(false); }
  };

  const inputCls = "rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm";
  const tabBtn = (k: TabKey, label: string) => (
    <button className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === k ? "bg-sky-600 text-white" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]"}`} onClick={() => setTab(k)}>{label}</button>
  );

  return (
    <div className="space-y-4 p-6">
      <AdminSubPageHeader title="申领审计导出" backTo="/admin/material/review" description="按人员、课题组或物品维度查看与导出申领明细。" />

      {/* Tab 切换 */}
      <div className="flex gap-2">{tabBtn("personal", "个人审计")}{tabBtn("group", "课题组审计")}{canAudit && tabBtn("item", "按物品审计")}</div>

      {/* 日期筛选（个人/课题组共用） */}
      {tab !== "item" && (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-3">
          {/* 工具栏：人员/课题组选择 + 日期 + 导出 */}
          <div className="flex flex-wrap items-end gap-3">
            {tab === "personal" && isStaff && applicantList.length > 0 && (
              <div><label className="mb-1 block text-xs text-[var(--twin-body)]">申领人</label>
                <select className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm min-w-[180px]" value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}>
                  {applicantList.filter(a => a.applicantName).map(a => <option key={a.userId} value={a.userId}>{a.applicantName}</option>)}
                </select>
              </div>
            )}
            {tab === "group" && isStaff && groupList.length > 0 && (
              <div><label className="mb-1 block text-xs text-[var(--twin-body)]">课题组</label>
                <select className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm min-w-[180px]" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                  {groupList.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}
            {tab === "personal" && !isStaff && <span className="text-sm text-[var(--twin-body)] pb-2">申领人：本人</span>}
            {tab === "group" && !isStaff && <span className="text-sm text-[var(--twin-body)] pb-2">课题组：{selfGroup || "未分配"}</span>}
            <div><label className="mb-1 block text-xs text-[var(--twin-body)]">开始日期</label><input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} /></div>
            <span className="pb-2 text-sm text-[var(--twin-mute)]">～</span>
            <div><label className="mb-1 block text-xs text-[var(--twin-body)]">结束日期</label><input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} /></div>
            <button onClick={handleExport} disabled={exporting} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{exporting ? "导出中…" : "导出 Excel"}</button>
          </div>
          <p className="text-xs text-[var(--twin-mute)]">{currentLabel} · 共 {currentRows.length} 行 · {from} ～ {to}</p>

          {/* 合并表格 */}
          {currentRows.length > 0 ? (
            <div className="overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
              <table className="min-w-full text-xs">
                <thead className="bg-[var(--twin-canvas-soft)]"><tr>
                  <th className="px-2 py-2 text-left">单号</th><th className="px-2 py-2 text-left">物品</th><th className="px-2 py-2">数量</th><th className="px-2 py-2">状态</th><th className="px-2 py-2 text-left">申领人</th><th className="px-2 py-2 text-left">课题组</th><th className="px-2 py-2 text-left">时间</th>
                </tr></thead>
                <tbody>{currentRows.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-[var(--twin-canvas-soft)]"><td className="px-2 py-2 font-mono text-[10px]">{r.requestId}</td><td className="px-2 py-2">{r.snapshotName}</td><td className="px-2 py-2 text-center">{r.qty}</td><td className="px-2 py-2 text-center">{statusZh(r.status)}</td><td className="px-2 py-2">{r.applicantName||"-"}</td><td className="px-2 py-2">{r.applicantGroup||"-"}</td><td className="px-2 py-2 whitespace-nowrap">{toTime(r.createdAt)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="text-xs text-[var(--twin-mute)] text-center py-8">该区间暂无数据</p>}
        </section>
      )}

      {/* 按物品审计 */}
      {tab === "item" && (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
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
          <button onClick={handleExportAudit} disabled={exporting || selectedItemId === ""} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">导出审计 Excel</button>
          <div className="overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
            <table className="min-w-full text-xs"><thead className="bg-[var(--twin-canvas-soft)]"><tr><th className="px-2 py-2 text-left">时间</th><th className="px-2 py-2 text-left">物品</th><th className="px-2 py-2 text-left">类型</th><th className="px-2 py-2">变动数量</th><th className="px-2 py-2">库存</th><th className="px-2 py-2 text-left">申领人</th><th className="px-2 py-2 text-left">课题组</th><th className="px-2 py-2 text-left">关联单号</th><th className="px-2 py-2 text-left">备注</th></tr></thead>
              <tbody>{(movementData?.data||[]).map((row: MaterialStockMovementRow, i: number) => {
                const typeLabel = row.movementType === "INBOUND" ? "入库" : row.movementType === "OUTBOUND" ? "出库" : row.movementType === "ADJUST" ? "调整" : row.movementType;
                return <tr key={i}><td className="px-2 py-2 whitespace-nowrap">{toTime(row.createdAt)}</td><td className="px-2 py-2">{row.itemName||"-"}</td><td className="px-2 py-2">{typeLabel}</td><td className="px-2 py-2 text-center">{row.qty}</td><td className="px-2 py-2 text-center">{row.stockAfter != null ? row.stockAfter : "-"}</td><td className="px-2 py-2">{row.applicantName||"-"}</td><td className="px-2 py-2">{row.applicantGroup||"-"}</td><td className="px-2 py-2 font-mono text-[10px]">{row.requestId||"-"}</td><td className="px-2 py-2">{row.remark||"-"}</td></tr>;
              })}</tbody></table>
            {(!movementData?.data || movementData.data.length === 0) && <p className="p-4 text-center text-xs text-[var(--twin-mute)]">请选择物品查看库存流水</p>}
          </div>
          {movementData && movementData.total > 20 && (
            <div className="flex items-center gap-2 text-xs">
              <button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={auditPage<=1} onClick={() => setAuditPage(p=>p-1)}>上一页</button>
              <span>第 {auditPage} 页 / 共 {Math.ceil(movementData.total/20)} 页</span>
              <button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={auditPage>=Math.ceil(movementData.total/20)} onClick={() => setAuditPage(p=>p+1)}>下一页</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
