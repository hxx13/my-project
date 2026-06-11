/**
 * 物资申领审计导出 — 个人审计 + 课题组审计 + 按物品审计。
 * 学生：仅自己/自己课题组。教职工：可选任意人员/课题组。
 * 统一日期区间筛选 + 合并表格，无需区分单次/多次。
 */
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMyMaterialRequests, fetchAllMaterialRequests,
  fetchAdminMaterialCategories, fetchAdminMaterialItems,
  fetchItemStockMovements, fetchItemClaimLines,
  fetchApplicantsWithRecords, fetchGroupsWithRecords,
  exportMaterialAuditTrail,
  type MaterialRequest, type MaterialStockMovementRow, type MaterialItemClaimRow,
} from "@/api/domains/material.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

type TabKey = "personal" | "group" | "item";

function downloadBlob(blob: Blob, name: string) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }
function toTime(v?: string | null) { if (!v) return "无"; return String(v).replace("T", " ").slice(0, 19); }
function cellZh(v?: string | null) {
  const t = String(v ?? "").trim();
  if (!t || t === "-") return "无";
  return t;
}
function statusZh(s?: string | null) {
  const m: Record<string, string> = {
    DRAFT: "草稿",
    PENDING: "待审核",
    FIRST_OK: "初审通过",
    APPROVED: "已通过",
    REJECTED: "已拒绝",
    FULFILLED: "已出库",
    RECEIVED: "已完成",
  };
  const key = String(s ?? "").trim().toUpperCase();
  if (!key) return "无";
  return m[key] ?? "未知";
}
function remarkZh(remark?: string | null) {
  const t = String(remark ?? "").trim();
  if (!t || t === "-") return "无";
  const u = t.toUpperCase();
  if (u === "INBOUND") return "入库";
  if (u === "OUTBOUND") return "申领出库";
  if (u.includes("INITIAL INBOUND") || u === "INITIAL") return "初始入库";
  return t;
}
function iso(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function monthStart() { const t = new Date(); return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(t) }; }

type ItemFlowRow = {
  key: string;
  time: string;
  eventType: string;
  itemName: string;
  qty: string;
  stockAfter: string;
  applicantName: string;
  applicantGroup: string;
  requestId: string;
  remark: string;
};

const FLOW_PAGE_SIZE = 30;

function dateInRange(v: string | null | undefined, from: string, to: string): boolean {
  if (!v) return false;
  const d = v.slice(0, 10);
  return d >= from && d <= to;
}

function movementTypeZh(t: string): string {
  const u = String(t || "").toUpperCase();
  if (u === "INBOUND") return "入库";
  if (u === "OUTBOUND") return "出库";
  if (u === "ADJUST") return "调整";
  if (!u) return "无";
  return "其他";
}

function movementQtyDisplay(t: string, qty: number): string {
  const u = String(t || "").toUpperCase();
  const n = Math.abs(Number(qty) || 0);
  if (u === "INBOUND") return `+${n}`;
  if (u === "OUTBOUND") return `-${n}`;
  if (u === "ADJUST") {
    const signed = Number(qty) || 0;
    return signed > 0 ? `+${signed}` : String(signed);
  }
  return String(qty);
}

/** 物品来去流水：入库/出库/调整 + 无流水时从已出库申领补录 */
function buildItemFlowRows(
  claims: MaterialItemClaimRow[],
  movements: MaterialStockMovementRow[],
  from: string,
  to: string,
): ItemFlowRow[] {
  const rows: ItemFlowRow[] = [];
  const outboundRequestIds = new Set<string>();

  for (const m of movements) {
    const type = String(m.movementType || "").toUpperCase();
    if (type !== "INBOUND" && type !== "OUTBOUND" && type !== "ADJUST") continue;
    if (!dateInRange(m.createdAt, from, to)) continue;
    if (type === "OUTBOUND" && m.requestId) outboundRequestIds.add(m.requestId);
    rows.push({
      key: `mov-${m.id}`,
      time: m.createdAt || "",
      eventType: movementTypeZh(type),
      itemName: cellZh(m.itemName),
      qty: movementQtyDisplay(type, m.qty),
      stockAfter: m.stockAfter != null ? String(m.stockAfter) : "无",
      applicantName: cellZh(m.applicantName),
      applicantGroup: cellZh(m.applicantGroup),
      requestId: cellZh(m.requestId),
      remark: remarkZh(m.remark),
    });
  }

  for (const c of claims) {
    const fulfilled = c.fulfilledQty ?? 0;
    if (fulfilled <= 0 || outboundRequestIds.has(c.requestId)) continue;
    const outboundTime = c.fulfilledAt || c.createdAt;
    if (!dateInRange(outboundTime, from, to)) continue;
    const status = String(c.status || "").toUpperCase();
    if (status !== "FULFILLED" && status !== "RECEIVED") continue;
    rows.push({
      key: `claim-out-${c.requestId}`,
      time: outboundTime || "",
      eventType: "出库",
      itemName: cellZh(c.itemName),
      qty: `-${fulfilled}`,
      stockAfter: "无",
      applicantName: cellZh(c.applicantName),
      applicantGroup: cellZh(c.applicantGroup),
      requestId: cellZh(c.requestId),
      remark: "申领出库（无流水补录）",
    });
  }

  rows.sort((a, b) => (b.time || "").localeCompare(a.time || ""));
  return rows;
}

export default function MaterialAuditExportPage() {
  const role = authStorage.getRole() || "STUDENT";
  const isStaff = hasMinRole(role, "STAFF");
  const selfUserId = authStorage.getUserInfo()?.id?.trim() ?? "";

  const [tab, setTab] = useState<TabKey>("personal");
  const dr = useMemo(() => monthStart(), []);
  const [from, setFrom] = useState(dr.from);
  const [to, setTo] = useState(dr.to);
  const [exporting, setExporting] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState(selfUserId);
  const { data: applicantList = [] } = useQuery({
    queryKey: ["material", "applicants-with-records"],
    queryFn: fetchApplicantsWithRecords,
    enabled: isStaff && tab === "personal",
  });

  useEffect(() => {
    if (tab !== "personal" || !isStaff || applicantList.length === 0) return;
    const exists = applicantList.some((a) => a.userId === selectedUserId);
    if (!exists) setSelectedUserId(applicantList[0].userId);
  }, [applicantList, tab, isStaff, selectedUserId]);

  const [selectedGroup, setSelectedGroup] = useState("");
  const { data: groupList = [] } = useQuery({
    queryKey: ["material", "groups-with-records"],
    queryFn: fetchGroupsWithRecords,
    enabled: tab === "group",
  });

  useEffect(() => {
    if (tab !== "group" || groupList.length === 0) return;
    if (!selectedGroup || !groupList.includes(selectedGroup)) {
      setSelectedGroup(groupList[0]);
    }
  }, [groupList, tab, selectedGroup]);

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [itemKeyword, setItemKeyword] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [flowPage, setFlowPage] = useState(1);

  const queryUserId = tab === "personal" ? (isStaff ? selectedUserId : selfUserId) : undefined;
  const queryGroup = tab === "group" && isStaff ? (selectedGroup || undefined) : undefined;
  const { data: queryData, isLoading: requestsLoading } = useQuery({
    queryKey: ["material", "requests", "audit", { tab, applicantUserId: queryUserId, applicantGroup: queryGroup, isStaff }],
    queryFn: () => {
      if (!isStaff) return fetchMyMaterialRequests({ page: 1, size: 500 });
      return fetchAllMaterialRequests({ page: 1, size: 500, applicantUserId: queryUserId, applicantGroup: queryGroup });
    },
    enabled: tab !== "item",
  });

  const studentGroup = useMemo(() => {
    const raw = queryData?.data ?? [];
    for (const r of raw) {
      const g = (r.applicantGroup || "").trim();
      if (g) return g;
    }
    return "";
  }, [queryData]);

  useEffect(() => {
    if (tab === "group" && !isStaff && studentGroup) setSelectedGroup(studentGroup);
  }, [tab, isStaff, studentGroup]);

  const auditRequests: MaterialRequest[] = useMemo(() => {
    const raw = queryData?.data ?? [];
    return raw.filter((r) => {
      const d = (r.createdAt || "").slice(0, 10);
      if (d < from || d > to) return false;
      if (tab === "group" && !isStaff && studentGroup) {
        return (r.applicantGroup || "").trim() === studentGroup;
      }
      return true;
    });
  }, [queryData, from, to, tab, isStaff, studentGroup]);

  const currentRows = useMemo(() => {
    return auditRequests.flatMap((r) =>
      (r.lines || []).map((l) => ({
        ...l,
        requestId: r.id,
        createdAt: r.createdAt,
        status: r.status,
        applicantName: r.applicantName,
        applicantGroup: r.applicantGroup,
      }))
    );
  }, [auditRequests]);

  const { data: categories = [] } = useQuery({
    queryKey: ["material", "admin", "categories"],
    queryFn: () => fetchAdminMaterialCategories(),
    enabled: isStaff && tab === "item",
  });
  const { data: items = [] } = useQuery({
    queryKey: ["material", "admin", "items", categoryId],
    queryFn: () => fetchAdminMaterialItems(categoryId === "" ? undefined : categoryId),
    enabled: isStaff && tab === "item",
  });
  const { data: movementData, isLoading: movementsLoading } = useQuery({
    queryKey: ["material", "movements", selectedItemId, from, to],
    queryFn: () => fetchItemStockMovements(Number(selectedItemId), { page: 1, size: 500 }),
    enabled: tab === "item" && !!selectedItemId,
  });
  const { data: claimData, isLoading: claimsLoading } = useQuery({
    queryKey: ["material", "item-claims", selectedItemId, from, to],
    queryFn: () => fetchItemClaimLines(Number(selectedItemId), { from, to, page: 1, size: 500 }),
    enabled: tab === "item" && !!selectedItemId,
  });
  const itemFlowRows = useMemo(
    () => buildItemFlowRows(claimData?.data ?? [], movementData?.data ?? [], from, to),
    [claimData, movementData, from, to],
  );
  const itemFlowTotalPages = Math.max(1, Math.ceil(itemFlowRows.length / FLOW_PAGE_SIZE));
  const itemFlowPageRows = useMemo(() => {
    const start = (flowPage - 1) * FLOW_PAGE_SIZE;
    return itemFlowRows.slice(start, start + FLOW_PAGE_SIZE);
  }, [itemFlowRows, flowPage]);

  useEffect(() => {
    if (flowPage > itemFlowTotalPages) setFlowPage(1);
  }, [flowPage, itemFlowTotalPages]);

  const itemFlowLoading = movementsLoading || claimsLoading;

  const filteredItems = useMemo(() => {
    const k = itemKeyword.trim().toLowerCase();
    return !k ? items : items.filter((it) => String(it.name || "").toLowerCase().includes(k));
  }, [items, itemKeyword]);

  const applicantLabel = (userId: string) => {
    const hit = applicantList.find((a) => a.userId === userId);
    return hit?.applicantName || userId || "未知";
  };

  const currentLabel = tab === "personal"
    ? (isStaff && selectedUserId ? applicantLabel(selectedUserId) : "本人")
    : (selectedGroup || "未分配");

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportMaterialAuditTrail({ from, to, groupId: tab === "group" ? queryGroup : undefined });
      downloadBlob(blob, `material-${tab}-${from}_${to}.xlsx`);
      toast.success("已导出");
    } catch { toast.error("导出失败"); } finally { setExporting(false); }
  };
  const handleExportAudit = async () => {
    setExporting(true);
    try {
      const blob = await exportMaterialAuditTrail({ from, to });
      downloadBlob(blob, `material-audit-item.xlsx`);
      toast.success("已导出");
    } catch { toast.error("导出失败"); } finally { setExporting(false); }
  };

  const inputCls = "rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm";
  const tabBtn = (k: TabKey, label: string) => (
    <button className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === k ? "bg-sky-600 text-white" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]"}`} onClick={() => setTab(k)}>{label}</button>
  );

  return (
    <div className="space-y-4 p-6">
      <AdminSubPageHeader title="申领审计导出" backTo="/admin/material/review" description="按人员、课题组或物品维度查看与导出申领明细。" />

      <div className="flex gap-2">{tabBtn("personal", "个人审计")}{tabBtn("group", "课题组审计")}{isStaff && tabBtn("item", "按物品审计")}</div>

      {tab !== "item" && (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            {tab === "personal" && isStaff && (
              <div>
                <label className="mb-1 block text-xs text-[var(--twin-body)]">申领人</label>
                <select
                  className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm min-w-[180px]"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={applicantList.length === 0}
                >
                  {applicantList.length === 0 ? (
                    <option value="">暂无申领记录</option>
                  ) : (
                    applicantList.map((a) => (
                      <option key={a.userId} value={a.userId}>{a.applicantName || a.userId}</option>
                    ))
                  )}
                </select>
              </div>
            )}
            {tab === "group" && isStaff && (
              <div>
                <label className="mb-1 block text-xs text-[var(--twin-body)]">课题组</label>
                <select
                  className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm min-w-[180px]"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  disabled={groupList.length === 0}
                >
                  {groupList.length === 0 ? (
                    <option value="">暂无课题组记录</option>
                  ) : (
                    groupList.map((g) => <option key={g} value={g}>{g}</option>)
                  )}
                </select>
              </div>
            )}
            {tab === "personal" && !isStaff && <span className="text-sm text-[var(--twin-body)] pb-2">申领人：本人</span>}
            {tab === "group" && !isStaff && <span className="text-sm text-[var(--twin-body)] pb-2">课题组：{selectedGroup || "未分配"}</span>}
            <div><label className="mb-1 block text-xs text-[var(--twin-body)]">开始日期</label><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <span className="pb-2 text-sm text-[var(--twin-mute)]">～</span>
            <div><label className="mb-1 block text-xs text-[var(--twin-body)]">结束日期</label><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <button onClick={handleExport} disabled={exporting} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{exporting ? "导出中…" : "导出表格"}</button>
          </div>
          <p className="text-xs text-[var(--twin-mute)]">
            {currentLabel} · 共 {currentRows.length} 行 · {from} ～ {to}
            {requestsLoading ? " · 加载中…" : ""}
          </p>

          {currentRows.length > 0 ? (
            <div className="overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
              <table className="min-w-full text-xs">
                <thead className="bg-[var(--twin-canvas-soft)]"><tr>
                  <th className="px-2 py-2 text-left">单号</th><th className="px-2 py-2 text-left">物品</th><th className="px-2 py-2">数量</th><th className="px-2 py-2">状态</th><th className="px-2 py-2 text-left">申领人</th><th className="px-2 py-2 text-left">课题组</th><th className="px-2 py-2 text-left">时间</th>
                </tr></thead>
                <tbody>{currentRows.map((r, i) => (
                  <tr key={i} className="hover:bg-[var(--twin-canvas-soft)]">
                    <td className="px-2 py-2 font-mono text-[10px]">{cellZh(r.requestId)}</td>
                    <td className="px-2 py-2">{cellZh(r.snapshotName)}</td>
                    <td className="px-2 py-2 text-center">{r.qty ?? "无"}</td>
                    <td className="px-2 py-2 text-center">{statusZh(r.status)}</td>
                    <td className="px-2 py-2">{cellZh(r.applicantName)}</td>
                    <td className="px-2 py-2">{cellZh(r.applicantGroup)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{toTime(r.createdAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[var(--twin-mute)] text-center py-8">
              {requestsLoading ? "加载中…" : "该区间暂无数据"}
            </p>
          )}
        </section>
      )}

      {tab === "item" && (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--twin-body)]">物资分类</label>
              <select className={`${inputCls} min-w-[140px]`} value={categoryId === "" ? "" : String(categoryId)} onChange={(e) => { setCategoryId(e.target.value === "" ? "" : Number(e.target.value)); setSelectedItemId(""); setFlowPage(1); }}>
                <option value="">全部分类</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--twin-body)]">搜索物品</label>
              <input className={`${inputCls} min-w-[140px]`} placeholder="按名称筛选" value={itemKeyword} onChange={(e) => setItemKeyword(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--twin-body)]">选择物品</label>
              <select className={`${inputCls} min-w-[180px]`} value={selectedItemId === "" ? "" : String(selectedItemId)} onChange={(e) => { setSelectedItemId(e.target.value === "" ? "" : Number(e.target.value)); setFlowPage(1); }}>
                <option value="">请选择物品</option>{filteredItems.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--twin-body)]">开始日期</label>
              <input type="date" className={inputCls} value={from} onChange={(e) => { setFrom(e.target.value); setFlowPage(1); }} />
            </div>
            <span className="pb-2 text-sm text-[var(--twin-mute)]">～</span>
            <div>
              <label className="mb-1 block text-xs text-[var(--twin-body)]">结束日期</label>
              <input type="date" className={inputCls} value={to} onChange={(e) => { setTo(e.target.value); setFlowPage(1); }} />
            </div>
            <button onClick={handleExportAudit} disabled={exporting || selectedItemId === ""} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{exporting ? "导出中…" : "导出表格"}</button>
          </div>

          <p className="text-xs text-[var(--twin-mute)]">
            物品来去流水 · 共 {itemFlowRows.length} 条 · {from} ～ {to}
            {itemFlowLoading ? " · 加载中…" : ""}
          </p>
          <div className="overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--twin-canvas-soft)]"><tr>
                <th className="px-2 py-2 text-left">时间</th>
                <th className="px-2 py-2 text-left">类型</th>
                <th className="px-2 py-2 text-left">物品</th>
                <th className="px-2 py-2">变动数量</th>
                <th className="px-2 py-2">库存</th>
                <th className="px-2 py-2 text-left">申领人</th>
                <th className="px-2 py-2 text-left">课题组</th>
                <th className="px-2 py-2 text-left">关联单号</th>
                <th className="px-2 py-2 text-left">备注</th>
              </tr></thead>
              <tbody>
                {itemFlowPageRows.map((row) => (
                  <tr key={row.key} className="hover:bg-[var(--twin-canvas-soft)]">
                    <td className="px-2 py-2 whitespace-nowrap">{toTime(row.time)}</td>
                    <td className="px-2 py-2">{row.eventType}</td>
                    <td className="px-2 py-2">{row.itemName}</td>
                    <td className="px-2 py-2 text-center font-medium">{row.qty}</td>
                    <td className="px-2 py-2 text-center">{row.stockAfter}</td>
                    <td className="px-2 py-2">{row.applicantName}</td>
                    <td className="px-2 py-2">{row.applicantGroup}</td>
                    <td className="px-2 py-2 font-mono text-[10px]">{row.requestId}</td>
                    <td className="px-2 py-2">{row.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {itemFlowLoading && <p className="p-4 text-center text-xs text-[var(--twin-mute)]">加载中…</p>}
            {!itemFlowLoading && selectedItemId !== "" && itemFlowRows.length === 0 && (
              <p className="p-4 text-center text-xs text-[var(--twin-mute)]">该区间暂无流水记录</p>
            )}
            {selectedItemId === "" && <p className="p-4 text-center text-xs text-[var(--twin-mute)]">请选择物品查看来去流水</p>}
          </div>
          {itemFlowRows.length > FLOW_PAGE_SIZE && (
            <div className="flex items-center gap-2 text-xs">
              <button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={flowPage <= 1} onClick={() => setFlowPage((p) => p - 1)}>上一页</button>
              <span>第 {flowPage} 页 / 共 {itemFlowTotalPages} 页</span>
              <button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={flowPage >= itemFlowTotalPages} onClick={() => setFlowPage((p) => p + 1)}>下一页</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
