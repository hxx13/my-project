/**
 * 物资申领审计导出 — 个人审计 + 课题组审计 + 按物品审计 + 物品+课题组审计。
 * 学生：仅自己/自己课题组。教职工：可选任意人员/课题组。
 * 统一日期区间筛选 + 合并表格，无需区分单次/多次。
 */
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import {
  fetchAuditExportRequests,
  fetchAdminMaterialCategories, fetchAdminMaterialItems,
  fetchItemStockMovements, fetchItemClaimLines,
  fetchApplicantsWithRecords, fetchGroupsWithRecords,
  exportMaterialAuditTrail,
  exportMaterialItemFlow,
  type MaterialRequest, type MaterialStockMovementRow, type MaterialItemClaimRow,
} from "@/api/domains/material.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";
import { sanitizeExportFilenamePart } from "@/features/report-form/utils/reportFormExportFilename";
import { recomputeMovementStockAfter } from "@/utils/materialStockAfterHelpers";

type TabKey = "personal" | "group" | "item" | "item-group";

function downloadBlob(blob: Blob, name: string) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }
function toTime(v?: string | null) {
  if (!v) return "无";
  const t = formatDateTimeAsiaShanghai(v);
  return t === "-" ? "无" : t;
}
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
function formatSpecLabel(specJson: string | undefined | null): string {
  if (!specJson) return '';
  try {
    const obj = JSON.parse(specJson);
    return Object.values(obj).join('·');
  } catch { return ''; }
}

function auditDateParams(from: string, to: string): { from?: string; to?: string } {
  const f = from.trim();
  const t = to.trim();
  if (!f && !t) return {};
  return { ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) };
}

function buildAuditExportFilename(label: string, from: string, to: string) {
  const base = sanitizeExportFilenamePart(label) || "申领审计";
  const f = from.trim();
  const t = to.trim();
  if (!f && !t) return `${base}-全部时间.xlsx`;
  const fromPart = f || "start";
  const toPart = t || "end";
  return `${base}-${fromPart}_${toPart}.xlsx`;
}

type ItemFlowRow = {
  key: string;
  time: string;
  eventType: string;
  itemName: string;
  specLabel: string;
  qty: string;
  stockAfter: string;
  applicantName: string;
  applicantGroup: string;
  requestId: string;
  remark: string;
};

const FLOW_PAGE_SIZE = 30;

function dateInRange(v: string | null | undefined, from: string, to: string): boolean {
  if (!from.trim() || !to.trim()) return !!v;
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
  currentStockByItemId?: ReadonlyMap<number, number>,
): ItemFlowRow[] {
  const stockAfterByMovementId = currentStockByItemId
    ? recomputeMovementStockAfter(movements, currentStockByItemId)
    : new Map<number, number>();
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
      specLabel: formatSpecLabel(m.specSnapshot) || "无",
      qty: movementQtyDisplay(type, m.qty),
      stockAfter: stockAfterByMovementId.has(m.id)
        ? String(stockAfterByMovementId.get(m.id))
        : (m.stockAfter != null ? String(m.stockAfter) : "无"),
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
      specLabel: formatSpecLabel(c.specSnapshot) || "无",
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
  const role = authStorage.getRole() || "MEMBER";
  const isStaff = hasMinRole(role, "STAFF");
  const selfUserId = authStorage.getUserInfo()?.id?.trim() ?? "";

  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

  const [tab, setTab] = useState<TabKey>("personal");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState("");
  const { data: applicantList = [] } = useQuery({
    queryKey: ["material", "applicants-with-records", from, to],
    queryFn: () => fetchApplicantsWithRecords(auditDateParams(from, to)),
    enabled: isStaff && tab === "personal",
  });

  const [selectedGroup, setSelectedGroup] = useState("");
  const { data: groupList = [] } = useQuery({
    queryKey: ["material", "groups-with-records", from, to],
    queryFn: () => fetchGroupsWithRecords(auditDateParams(from, to)),
    enabled: tab === "group" || tab === "item-group",
  });

  // 物品+课题组 tab 的课题组筛选
  const [selectedItemGroup, setSelectedItemGroup] = useState("");

  const itemApplicantGroup = tab === "item-group" ? (selectedItemGroup || undefined) : undefined;

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [itemKeyword, setItemKeyword] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [flowPage, setFlowPage] = useState(1);

  const queryUserId = tab === "personal"
    ? (isStaff ? (selectedUserId || undefined) : selfUserId)
    : undefined;
  const queryGroup = tab === "group" && isStaff ? (selectedGroup || undefined) : undefined;
  const { data: queryData, isLoading: requestsLoading } = useQuery({
    queryKey: ["material", "audit", "requests", { tab, from, to, applicantUserId: queryUserId, applicantGroup: queryGroup }],
    queryFn: () => fetchAuditExportRequests({
      page: 1,
      size: 500,
      ...auditDateParams(from, to),
      applicantUserId: queryUserId,
      applicantGroup: queryGroup,
    }),
    enabled: tab !== "item" && tab !== "item-group",
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
    if (tab === "group" && !isStaff && studentGroup) {
      return raw.filter((r) => (r.applicantGroup || "").trim() === studentGroup);
    }
    return raw;
  }, [queryData, tab, isStaff, studentGroup]);

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

  const isItemTab = tab === "item" || tab === "item-group";

  const { data: categories = [] } = useQuery({
    queryKey: ["material", "admin", "categories", itemApplicantGroup],
    queryFn: () => fetchAdminMaterialCategories(itemApplicantGroup),
    enabled: isStaff && isItemTab,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["material", "admin", "items", categoryId, itemApplicantGroup],
    queryFn: () => fetchAdminMaterialItems(categoryId === "" ? undefined : categoryId, itemApplicantGroup),
    enabled: isStaff && isItemTab,
  });
  const selectedItemLabel = selectedItemId === ""
    ? "全部物品"
    : (items.find((it) => it.id === selectedItemId)?.name || String(selectedItemId));

  const { data: movementData, isLoading: movementsLoading } = useQuery({
    queryKey: ["material", "movements", selectedItemId || "all", from, to, itemApplicantGroup],
    queryFn: () => fetchItemStockMovements(selectedItemId === "" ? null : Number(selectedItemId), { page: 1, size: 500, applicantGroup: itemApplicantGroup }),
    enabled: isItemTab,
  });
  const { data: claimData, isLoading: claimsLoading } = useQuery({
    queryKey: ["material", "item-claims", selectedItemId || "all", from, to, itemApplicantGroup],
    queryFn: () => fetchItemClaimLines(selectedItemId === "" ? null : Number(selectedItemId), { ...auditDateParams(from, to), page: 1, size: 500, applicantGroup: itemApplicantGroup }),
    enabled: isItemTab,
  });
  const currentStockByItemId = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of items) {
      if (item.id != null) map.set(item.id, Number(item.stockQty) || 0);
    }
    return map;
  }, [items]);
  const itemFlowRows = useMemo(
    () => buildItemFlowRows(claimData?.data ?? [], movementData?.data ?? [], from, to, currentStockByItemId),
    [claimData, movementData, from, to, currentStockByItemId],
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

  useEffect(() => {
    if (selectedItemId === "") return;
    if (!filteredItems.some((it) => it.id === selectedItemId)) {
      setSelectedItemId("");
      setFlowPage(1);
    }
  }, [filteredItems, selectedItemId]);

  const applicantLabel = (userId: string) => {
    const hit = applicantList.find((a) => a.userId === userId);
    return hit?.applicantName || userId || "未知";
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportLabel = tab === "personal"
        ? `个人审计-${isStaff ? (selectedUserId ? applicantLabel(selectedUserId) : "全部申领人") : "本人"}`
        : `课题组审计-${isStaff ? (selectedGroup || "全部课题组") : (selectedGroup || studentGroup || "未分配")}`;
      const blob = await exportMaterialAuditTrail({
        ...auditDateParams(from, to),
        exportLabel,
        applicantUserId: tab === "personal" && isStaff && selectedUserId ? selectedUserId : undefined,
        applicantGroup: tab === "group"
          ? (isStaff ? (selectedGroup || undefined) : (studentGroup || undefined))
          : undefined,
      });
      downloadBlob(blob, buildAuditExportFilename(exportLabel, from, to));
      toast.success("已导出");
    } catch { toast.error("导出失败"); } finally { setExporting(false); }
  };
  const handleExportAudit = async () => {
    const itemName = selectedItemLabel;
    const groupSuffix = itemApplicantGroup ? `-${itemApplicantGroup}` : "";
    const exportLabel = tab === "item-group"
      ? `物品+课题组审计-${itemName}${groupSuffix}`
      : `物品审计-${itemName}`;
    setExporting(true);
    try {
      const blob = await exportMaterialItemFlow({
        itemId: selectedItemId === "" ? null : Number(selectedItemId),
        ...auditDateParams(from, to),
        applicantGroup: itemApplicantGroup,
        exportLabel,
      });
      downloadBlob(blob, buildAuditExportFilename(exportLabel, from, to));
      toast.success("已导出");
    } catch { toast.error("导出失败"); } finally { setExporting(false); }
  };

  const inputCls = "rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm";
  const tabBtn = (k: TabKey, label: string) => (
    <button className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === k ? "bg-sky-600 text-white" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]"}`} onClick={() => setTab(k)}>{label}</button>
  );

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        {/* Tabs */}
        <div className="shrink-0 flex gap-2 pb-3">
          {tabBtn("personal", "个人审计")}
          {tabBtn("group", "课题组审计")}
          {isStaff && tabBtn("item", "按物品审计")}
          {isStaff && tabBtn("item-group", "物品+课题组")}
        </div>

        {/* Personal / Group tab section */}
        {tab !== "item" && tab !== "item-group" && (
          <>
            <AdminFormCard className="shrink-0 mb-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
                <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">{pageLabel}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={handleExport} disabled={exporting} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{exporting ? "导出中…" : "导出表格"}</button>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {tab === "personal" && isStaff && (
                  <div>
                    <label className="mb-1 block text-xs text-[var(--twin-body)]">申领人</label>
                    <select
                      className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm min-w-[180px]"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                    >
                      <option value="">全部申领人</option>
                      {applicantList.map((a) => (
                        <option key={a.userId} value={a.userId}>{a.applicantName || a.userId}</option>
                      ))}
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
                    >
                      <option value="">全部课题组</option>
                      {groupList.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                )}
                {tab === "personal" && !isStaff && <span className="text-sm text-[var(--twin-body)] pb-2">申领人：本人</span>}
                {tab === "group" && !isStaff && <span className="text-sm text-[var(--twin-body)] pb-2">课题组：{selectedGroup || "未分配"}</span>}
                <div><label className="mb-1 block text-xs text-[var(--twin-body)]">开始日期</label><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="全部时间" /></div>
                <span className="pb-2 text-sm text-[var(--twin-mute)]">～</span>
                <div><label className="mb-1 block text-xs text-[var(--twin-body)]">结束日期</label><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} placeholder="全部时间" /></div>
              </div>
            </AdminFormCard>

            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div>
                  <table className="min-w-full text-xs">
                    <thead className="border-b-2 border-[var(--app-color-border-strong)]">
                      <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                        <th className="p-3 text-left">单号</th>
                        <th className="p-3 text-left">物品</th>
                        <th className="p-3">数量</th>
                        <th className="p-3">规格</th>
                        <th className="p-3">状态</th>
                        <th className="p-3 text-left">申领人</th>
                        <th className="p-3 text-left">课题组</th>
                        <th className="p-3 text-left">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRows.map((r, i) => (
                        <tr key={i} className="hover:bg-[var(--twin-canvas-soft)]">
                          <td className="px-2 py-2 font-mono text-[10px]">{cellZh(r.requestId)}</td>
                          <td className="px-2 py-2">{cellZh(r.snapshotName)}</td>
                          <td className="px-2 py-2 text-center">{r.qty ?? "无"}</td>
                          <td className="px-2 py-2 text-center text-[10px]">{formatSpecLabel((r as { specSnapshot?: string }).specSnapshot) || "无"}</td>
                          <td className="px-2 py-2 text-center">{statusZh(r.status)}</td>
                          <td className="px-2 py-2">{cellZh(r.applicantName)}</td>
                          <td className="px-2 py-2">{cellZh(r.applicantGroup)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{toTime(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Item / Item+Group tab section */}
        {isItemTab && (
          <>
            <AdminFormCard className="shrink-0 mb-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
                <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">{pageLabel}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={handleExportAudit} disabled={exporting} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{exporting ? "导出中…" : "导出表格"}</button>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {tab === "item-group" && (
                  <div>
                    <label className="mb-1 block text-xs text-[var(--twin-body)]">课题组</label>
                    <select
                      className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm min-w-[160px]"
                      value={selectedItemGroup}
                      onChange={(e) => { setSelectedItemGroup(e.target.value); setFlowPage(1); }}
                    >
                      <option value="">全部课题组</option>
                      {groupList.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                )}
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
                    <option value="">全部物品</option>{filteredItems.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
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
              </div>
            </AdminFormCard>

            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div>
                  <table className="min-w-full text-xs">
                    <thead className="border-b-2 border-[var(--app-color-border-strong)]">
                      <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                        <th className="p-3 text-left">时间</th>
                        <th className="p-3 text-left">类型</th>
                        <th className="p-3 text-left">物品</th>
                        <th className="p-3">规格</th>
                        <th className="p-3">变动数量</th>
                        <th className="p-3">库存</th>
                        <th className="p-3 text-left">申领人</th>
                        <th className="p-3 text-left">课题组</th>
                        <th className="p-3 text-left">关联单号</th>
                        <th className="p-3 text-left">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemFlowPageRows.map((row) => (
                        <tr key={row.key} className="hover:bg-[var(--twin-canvas-soft)]">
                          <td className="px-2 py-2 whitespace-nowrap">{toTime(row.time)}</td>
                          <td className="px-2 py-2">{row.eventType}</td>
                          <td className="px-2 py-2">{row.itemName}</td>
                          <td className="px-2 py-2 text-center text-[10px]">{row.specLabel}</td>
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
                </div>
              </div>

              {/* Item tab pagination */}
              {itemFlowRows.length > FLOW_PAGE_SIZE && (
                <div className="shrink-0 pt-2 flex items-center gap-2 text-xs">
                  <button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={flowPage <= 1} onClick={() => setFlowPage((p) => p - 1)}>上一页</button>
                  <span className="text-[var(--twin-mute)]">第 {flowPage} 页 / 共 {itemFlowTotalPages} 页</span>
                  <button className="rounded-twin-sm border px-2 py-1 disabled:opacity-40" disabled={flowPage >= itemFlowTotalPages} onClick={() => setFlowPage((p) => p + 1)}>下一页</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminPageShell>
  );
}
