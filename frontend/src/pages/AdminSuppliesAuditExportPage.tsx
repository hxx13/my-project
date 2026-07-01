/**
 * 物资领用 Excel 预览与审计流水（采购单/报修单导出不在此页，见 explicit-out-of-scope）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadAuditItemExcel,
  downloadPersonalClaimExcel,
  downloadPersonalClaimsRangeExcel,
  fetchAdminSupplyCategories,
  fetchAdminSupplyItems,
  fetchAuditItemIdsWithRecords,
  fetchAuditInventoryMovements,
  fetchSupplyCategories,
  fetchSupplyClaimDetail,
  fetchSupplyItems,
  fetchSupplyMine,
  fetchSupplyMineRange,
  fetchSupplyClaimApplicantOptions,
  type SupplyCategory,
  type SupplyClaimApplicantOption,
  type SupplyAuditRestoredRow,
  type SupplyClaimOrder,
  type SupplyInventoryMovementRow,
  type SupplyItem,
  type SupplyMineRangePack,
} from "@/api/domains/supplies.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";

type TabKey = "personal" | "audit";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function formatSpecLabel(specJson: string | undefined | null): string {
  if (!specJson) return '';
  try { return Object.values(JSON.parse(specJson)).join('·'); }
  catch { return ''; }
}

function movementInOutLabelRow(t: string | undefined, qty: number) {
  const u = String(t || "").toUpperCase();
  if (u === "INBOUND") return "入库";
  if (u === "OUTBOUND") return "出库";
  if (u === "ADJUST") return qty < 0 ? "出库" : "入库";
  return "—";
}

function movementChangeQtySignedDisplay(m: SupplyInventoryMovementRow): string {
  const t = String(m.movementType || "").toUpperCase();
  const q = m.qty != null ? Number(m.qty) : 0;
  if (t === "INBOUND") return String(Math.abs(q));
  if (t === "OUTBOUND") return String(-Math.abs(q));
  if (t === "ADJUST") return String(q);
  return m.qty != null ? String(m.qty) : "";
}

function claimStatusZh(s: string) {
  const u = String(s || "").toUpperCase();
  if (u === "PENDING") return "待出库";
  if (u === "FULFILLED") return "已完成";
  if (u === "WITHDRAWN") return "已撤回";
  if (u === "DELETED") return "已删除";
  return s || "-";
}

function toTimeText(v?: string | null) {
  return formatDateTimeAsiaShanghai(v);
}

function lineIoType(orderStatus: string, fulfilledQty: number) {
  const fq = Number(fulfilledQty) || 0;
  const u = String(orderStatus || "").toUpperCase();
  if (fq > 0) return "出库";
  if (u === "FULFILLED" || u === "WITHDRAWN") return "—";
  return "待出库";
}

function isoDateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultMonthStartToToday() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from: isoDateLocal(from), to: isoDateLocal(to) };
}

type PersonalAggregateFlatRow = {
  rowKey: string;
  createdAt?: string | null;
  fulfilledAt?: string | null;
  snapshotName?: string;
  qty: number;
  fulfilledQty: number;
  ioType: string;
  fulfilledByDisp: string;
  applicantDisp: string;
};

type AuditMergedRow =
  | { kind: "movement"; movement: SupplyInventoryMovementRow; sortKey: string }
  | { kind: "restored"; restored: SupplyAuditRestoredRow; stableIdx: number; sortKey: string };

function auditMergedRowKey(row: AuditMergedRow): string {
  if (row.kind === "movement") return `m:${row.movement.id}`;
  return `r:${row.restored.claimId ?? ""}:${row.stableIdx}`;
}

export default function AdminSuppliesAuditExportPage() {
  const role = authStorage.getRole() || "MEMBER";
  const canSubmitClaim = hasMinRole(role, "STAFF");
  const canAudit = hasMinRole(role, "SENIOR");
  const canPickClaimRangeOthers = hasMinRole(role, "SUPER_ADMIN");
  const canUseAdminItemApi = hasMinRole(role, "ADMIN");
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") as TabKey | null) || "personal";
  const claimParam = searchParams.get("claimId") || "";

  const [tab, setTab] = useState<TabKey>(tabParam === "audit" && canAudit ? "audit" : "personal");
  const [selectedClaimId, setSelectedClaimId] = useState(claimParam);
  const [exportingPersonal, setExportingPersonal] = useState(false);

  const initialRange = useMemo(() => defaultMonthStartToToday(), []);
  const [personalMode, setPersonalMode] = useState<"single" | "multi">("single");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const selfUserId = useMemo(() => authStorage.getUserInfo()?.id?.trim() ?? "", []);
  const [rangeApplicantUserId, setRangeApplicantUserId] = useState(selfUserId);
  const [rangeApplicantLabel, setRangeApplicantLabel] = useState("本人");
  const [rangePack, setRangePack] = useState<SupplyMineRangePack | null>(null);
  const [loadingRange, setLoadingRange] = useState(false);
  const [exportingRange, setExportingRange] = useState(false);
  const rangeFetchSeq = useRef(0);

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [itemKeyword, setItemKeyword] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [auditPage, setAuditPage] = useState(1);
  const auditSize = 20;
  const [exportingAudit, setExportingAudit] = useState(false);
  const [auditTableEditing, setAuditTableEditing] = useState(false);
  const [auditCellDraft, setAuditCellDraft] = useState<
    Record<string, { inbound?: string; stockAfter?: string; remark?: string }>
  >({});

  const qc = useQueryClient();

  useEffect(() => {
    if (tabParam === "audit" && canAudit) setTab("audit");
    if (claimParam) setSelectedClaimId(claimParam);
  }, [tabParam, claimParam, canAudit]);

  // ── Personal tab: mine claims ──
  const { data: mineData, isFetching: mineFetching } = useQuery({
    queryKey: ["supplyMine"] as const,
    queryFn: () => fetchSupplyMine({ page: 1, size: 100 }),
    enabled: canSubmitClaim,
    staleTime: 30 * 1000,
  });
  const mineClaims: SupplyClaimOrder[] = mineData?.data || [];

  // ── Personal tab: claim detail ──
  const { data: claimDetail, isFetching: claimDetailFetching } = useQuery({
    queryKey: ["supplyClaimDetail", selectedClaimId] as const,
    queryFn: () => fetchSupplyClaimDetail(selectedClaimId),
    enabled: tab === "personal" && personalMode === "single" && !!selectedClaimId.trim(),
  });

  const loadingPersonal = mineFetching || claimDetailFetching;

  // Clear selectedClaimId if not in mine list
  useEffect(() => {
    if (!selectedClaimId.trim() || mineFetching) return;
    if (mineClaims.some((c) => c.id === selectedClaimId)) return;
    setSelectedClaimId("");
    const next = new URLSearchParams(searchParams);
    next.delete("claimId");
    setSearchParams(next, { replace: true });
  }, [mineClaims, selectedClaimId, mineFetching, searchParams, setSearchParams]);

  // ── Personal tab multi: applicant options ──
  const { data: applicantOptions = [], isError: applicantOptsError } = useQuery({
    queryKey: ["supplyClaimApplicantOptions"] as const,
    queryFn: fetchSupplyClaimApplicantOptions,
    enabled: tab === "personal" && personalMode === "multi",
    staleTime: 5 * 60 * 1000,
  });

  const applicantInitRef = useRef(false);
  useEffect(() => {
    if (tab !== "personal" || personalMode !== "multi") {
      applicantInitRef.current = false;
    }
  }, [tab, personalMode]);

  useEffect(() => {
    if (applicantInitRef.current) return;
    if (applicantOptions.length > 0) {
      applicantInitRef.current = true;
      const selfId = authStorage.getUserInfo()?.id?.trim() ?? "";
      const hit = applicantOptions.find((x) => String(x.userId) === selfId);
      let uid = selfId;
      let label = "本人";
      if (hit?.displayName) label = String(hit.displayName);
      else if (applicantOptions[0]?.userId) {
        uid = String(applicantOptions[0].userId);
        label = applicantOptions[0].displayName ? String(applicantOptions[0].displayName) : uid;
      }
      setRangeApplicantUserId(uid);
      setRangeApplicantLabel(label);
    } else if (applicantOptsError) {
      applicantInitRef.current = true;
      const selfId = authStorage.getUserInfo()?.id?.trim() ?? "";
      setRangeApplicantUserId(selfId);
      setRangeApplicantLabel("本人");
    }
  }, [applicantOptions, applicantOptsError]);

  // ── Personal tab multi: debounced mine-range (kept as manual fetch with sequence guard) ──
  useEffect(() => {
    if (tab !== "personal" || personalMode !== "multi") return;
    const from = rangeFrom.trim();
    const to = rangeTo.trim();
    if (!from || !to || from > to) {
      setRangePack(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const my = ++rangeFetchSeq.current;
      void (async () => {
        setLoadingRange(true);
        try {
          const pack = await fetchSupplyMineRange({
            from,
            to,
            applicantUserId: rangeApplicantUserId.trim() || undefined,
          });
          if (my !== rangeFetchSeq.current) return;
          setRangePack(pack);
        } catch {
          if (my !== rangeFetchSeq.current) return;
          setRangePack(null);
        } finally {
          if (my === rangeFetchSeq.current) setLoadingRange(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(timer);
  }, [tab, personalMode, rangeFrom, rangeTo, rangeApplicantUserId]);

  // ── Audit tab: categories ──
  const { data: categories = [] } = useQuery({
    queryKey: ["supplyCategories", canUseAdminItemApi] as const,
    queryFn: () => (canUseAdminItemApi ? fetchAdminSupplyCategories() : fetchSupplyCategories()),
    enabled: canAudit && tab === "audit",
  });

  // ── Audit tab: items ──
  const { data: items = [] } = useQuery({
    queryKey: ["supplyItems", canUseAdminItemApi, categoryId] as const,
    queryFn: () => {
      const cid = categoryId === "" ? undefined : categoryId;
      return canUseAdminItemApi
        ? fetchAdminSupplyItems(cid)
        : fetchSupplyItems(cid === undefined ? undefined : Number(cid)).then((list) => (list || []) as SupplyItem[]);
    },
    enabled: canAudit && tab === "audit",
  });

  // ── Audit tab: hot item IDs ──
  const { data: auditHotItemIds = new Set<number>() } = useQuery({
    queryKey: ["auditItemIdsWithRecords", categoryId] as const,
    queryFn: async () => {
      const cid = categoryId === "" ? undefined : Number(categoryId);
      const ids = await fetchAuditItemIdsWithRecords(cid);
      return new Set((ids || []).map((x) => Number(x)));
    },
    enabled: canAudit && tab === "audit",
  });

  // ── Audit tab: inventory movements ──
  const auditQueryKey = useMemo(
    () => ["auditInventoryMovements", selectedItemId, auditPage] as const,
    [selectedItemId, auditPage],
  );

  const { data: auditData, isFetching: auditFetching } = useQuery({
    queryKey: auditQueryKey,
    queryFn: () =>
      fetchAuditInventoryMovements({
        itemId: Number(selectedItemId),
        page: auditPage,
        size: auditSize,
      }),
    enabled: tab === "audit" && selectedItemId !== "",
    placeholderData: (prev) => prev,
  });

  const auditRows: SupplyInventoryMovementRow[] = auditData?.data || [];
  const auditTotal = auditData?.total || 0;
  const restoredRows: SupplyAuditRestoredRow[] = auditData?.restoredData || [];
  const restoredTotal = auditData?.restoredTotal || 0;

  useEffect(() => {
    setAuditCellDraft({});
    setAuditTableEditing(false);
  }, [selectedItemId]);

  const filteredItems = useMemo(() => {
    const k = itemKeyword.trim().toLowerCase();
    const base = !k ? items : items.filter((it) => String(it.name || "").toLowerCase().includes(k));
    return [...base].sort((a, b) => {
      const ha = auditHotItemIds.has(a.id);
      const hb = auditHotItemIds.has(b.id);
      if (ha !== hb) return ha ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
    });
  }, [items, itemKeyword, auditHotItemIds]);

  const aggregateFlatRows = useMemo((): PersonalAggregateFlatRow[] => {
    const orders = rangePack?.data;
    if (!orders?.length) return [];
    const out: PersonalAggregateFlatRow[] = [];
    for (const o of orders) {
      const lines = o.lines?.length ? o.lines : [];
      if (!lines.length) continue;
      for (const line of lines) {
        out.push({
          rowKey: `${o.id}:${line.id}`,
          createdAt: o.createdAt,
          fulfilledAt: o.fulfilledAt,
          snapshotName: line.snapshotName,
          qty: Number(line.qty) || 0,
          fulfilledQty: line.fulfilledQty != null ? Number(line.fulfilledQty) : 0,
          ioType: lineIoType(o.status, line.fulfilledQty ?? 0),
          fulfilledByDisp: o.fulfilledByName || o.fulfilledBy || "-",
          applicantDisp: o.applicantName || o.userId || "-",
        });
      }
    }
    return out;
  }, [rangePack]);

  const mergedAuditRows = useMemo(() => {
    const out: AuditMergedRow[] = [];
    for (const movement of auditRows) {
      out.push({ kind: "movement", movement, sortKey: String(movement.createdAt || "") });
    }
    restoredRows.forEach((restored, stableIdx) => {
      out.push({ kind: "restored", restored, stableIdx, sortKey: String(restored.outboundTime || "") });
    });
    out.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    return out;
  }, [auditRows, restoredRows]);

  const onTab = (next: TabKey) => {
    setTab(next);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    if (next === "personal" && selectedClaimId) nextParams.set("claimId", selectedClaimId);
    else nextParams.delete("claimId");
    setSearchParams(nextParams, { replace: true });
  };

  const onSelectClaim = (id: string) => {
    setSelectedClaimId(id);
    const next = new URLSearchParams(searchParams);
    next.set("tab", "personal");
    if (id) next.set("claimId", id);
    else next.delete("claimId");
    setSearchParams(next, { replace: true });
  };

  const setPersonalModeUi = (mode: "single" | "multi") => {
    if (mode === personalMode) return;
    if (mode === "multi") {
      const dr = defaultMonthStartToToday();
      setPersonalMode("multi");
      setRangeFrom(dr.from);
      setRangeTo(dr.to);
      setSelectedClaimId("");
      setRangePack(null);
      const next = new URLSearchParams(searchParams);
      next.set("tab", "personal");
      next.delete("claimId");
      setSearchParams(next, { replace: true });
    } else {
      setPersonalMode("single");
      setRangePack(null);
    }
  };

  const exportPersonal = async () => {
    if (!selectedClaimId) return toast.error("请选择领用单");
    setExportingPersonal(true);
    try {
      const blob = await downloadPersonalClaimExcel(selectedClaimId);
      downloadBlob(blob, `supply-claim-${selectedClaimId}.xlsx`);
      toast.success("已导出 Excel（工作表：领用单明细）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExportingPersonal(false);
    }
  };

  const exportPersonalRange = async () => {
    const from = rangeFrom.trim();
    const to = rangeTo.trim();
    if (!from || !to) return toast.error("请填写开始与结束日期");
    if (from > to) return toast.error("开始日期不能晚于结束日期");
    setExportingRange(true);
    try {
      const blob = await downloadPersonalClaimsRangeExcel({
        from,
        to,
        applicantUserId: rangeApplicantUserId.trim() || undefined,
      });
      const uidPart = rangeApplicantUserId.trim() ? rangeApplicantUserId.replace(/[^A-Za-z0-9_-]/g, "_") : "me";
      downloadBlob(blob, `supply-claims-${uidPart}-${from}_${to}.xlsx`);
      toast.success("已导出 Excel（工作表：领用聚合明细，无库存列）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExportingRange(false);
    }
  };

  const exportingPersonalOrRange = exportingPersonal || exportingRange;

  const onPersonalExportUnified = async () => {
    if (exportingPersonalOrRange) return;
    if (personalMode === "single") await exportPersonal();
    else await exportPersonalRange();
  };

  const rangeDatesInvalid =
    personalMode === "multi" &&
    Boolean(rangeFrom.trim() && rangeTo.trim() && rangeFrom.trim() > rangeTo.trim());
  const personalExportDisabled =
    exportingPersonalOrRange ||
    (personalMode === "single" && !selectedClaimId) ||
    (personalMode === "multi" && (!rangeFrom.trim() || !rangeTo.trim() || rangeDatesInvalid));

  const exportAudit = async () => {
    if (selectedItemId === "") return toast.error("请选择物品");
    setExportingAudit(true);
    try {
      const blob = await downloadAuditItemExcel(Number(selectedItemId));
      downloadBlob(blob, `supply-audit-item-${selectedItemId}.xlsx`);
      toast.success("已导出单工作表审计明细（服务端合并排序）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExportingAudit(false);
    }
  };

  if (!canSubmitClaim) {
    return <div className="p-6 text-sm text-[var(--twin-mute)]">无权限访问领用导出页。</div>;
  }

  const tabBtnClass = (active: boolean, activeColor: string) =>
    `rounded-full px-4 py-1.5 text-xs font-medium ${
      active
        ? `${activeColor} text-white`
        : "border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]"
    }`;

  const inputDateClass = "rounded-twin-lg border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-3 py-2 text-sm";

  return (
    <div className="space-y-4 p-6">
      {claimParam.trim() ? (
        <AdminSubPageHeader
          fallbackTo="/admin/supplies/process"
          backLabel="返回物资处理台"
          title="领用单视图（处理台跳转）"
          description="完成预览或导出后，请返回处理台继续出库、删除或回收站操作。"
          className="mb-2"
        />
      ) : null}
      <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
        <h1 className="text-lg font-semibold text-[var(--twin-ink)]">领用审计</h1>
        <p className="mt-1 text-xs text-[var(--twin-mute)]">
          个人：单次/多次筛选与小程序「领用审计」一致，多次模式变更日期或领用人后自动汇总（防抖）；明细与聚合导出表头同服务端
          SuppliesExcelExportService。按物品审计：流水与领用还原合并为一张表；预览中「现存」等可编辑列不写入导出（与导出 8 列表头一致）。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={tabBtnClass(tab === "personal", "bg-sky-600")}
            onClick={() => onTab("personal")}
          >
            个人领用单
          </button>
          {canAudit ? (
            <button
              type="button"
              className={tabBtnClass(tab === "audit", "bg-violet-600")}
              onClick={() => onTab("audit")}
            >
              按物品审计
            </button>
          ) : null}
        </div>
      </div>

      {tab === "personal" ? (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5 text-xs font-medium">
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 ${personalMode === "single" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-twin-level-1" : "text-[var(--twin-body)]"}`}
                onClick={() => setPersonalModeUi("single")}
              >
                单次
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 ${personalMode === "multi" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-twin-level-1" : "text-[var(--twin-body)]"}`}
                onClick={() => setPersonalModeUi("multi")}
              >
                多次
              </button>
            </div>
            {personalMode === "single" ? (
              <div className="min-w-[200px] flex-1">
                <label className="sr-only">选择领用单</label>
                <select
                  className="w-full rounded-twin-lg border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
                  value={selectedClaimId}
                  onChange={(e) => onSelectClaim(e.target.value)}
                >
                  <option value="">请选择领用日期…</option>
                  {mineClaims.map((c) => {
                    const t = toTimeText(c.createdAt);
                    const label = `${t.slice(0, 10)} · ${claimStatusZh(c.status)} · ${t.slice(11, 16)}`;
                    return (
                      <option key={c.id} value={c.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <p className="flex-1 text-xs text-[var(--twin-mute)]">下方日期与领用人变更后自动汇总（无需单独「查询」按钮）。</p>
            )}
            <button
              type="button"
              disabled={personalExportDisabled}
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-twin-level-1 disabled:opacity-50"
              onClick={() => void onPersonalExportUnified()}
            >
              {exportingPersonalOrRange ? "导出中…" : "导出"}
            </button>
          </div>

          {personalMode === "multi" ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--twin-hairline)] pt-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--twin-body)]">开始日期</label>
                <input
                  type="date"
                  min="2020-01-01"
                  className={inputDateClass}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                />
              </div>
              <span className="pb-2 text-sm text-[var(--twin-mute)]">～</span>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--twin-body)]">结束日期</label>
                <input
                  type="date"
                  min="2020-01-01"
                  className={inputDateClass}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="mb-1 block text-xs font-medium text-[var(--twin-body)]">领用人</label>
                {canPickClaimRangeOthers ? (
                  applicantOptions.length > 0 ? (
                    <select
                      className="w-full rounded-twin-lg border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-3 py-2 text-sm outline-none"
                      value={rangeApplicantUserId}
                      onChange={(e) => {
                        const uid = e.target.value;
                        setRangeApplicantUserId(uid);
                        const hit = applicantOptions.find((o) => String(o.userId) === uid);
                        setRangeApplicantLabel(hit?.displayName ? String(hit.displayName) : uid);
                      }}
                    >
                      {applicantOptions.map((o) => (
                        <option key={o.userId} value={o.userId}>
                          {o.displayName || o.userId}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-sm text-[var(--twin-body)]">{rangeApplicantLabel}</div>
                  )
                ) : (
                  <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-sm text-[var(--twin-body)]">{rangeApplicantLabel}</div>
                )}
              </div>
              {loadingRange ? <span className="pb-2 text-xs text-[var(--twin-mute)]">汇总中…</span> : null}
              {rangeDatesInvalid ? <span className="pb-2 text-xs text-amber-700">开始不能晚于结束</span> : null}
            </div>
          ) : null}

          <p className="mt-2 text-xs text-[var(--twin-mute)]">
            按申请日期区间筛选（含首尾日）；默认当月起始日至今天。超级管理员及以上可切换领用人代查。单数上限 500、跨度最多 366 天（与后端一致）。表头与
            SuppliesExcelExportService 个人明细行一致。
          </p>

          {personalMode === "single" && loadingPersonal ? <div className="mt-2 text-sm text-[var(--twin-mute)]">加载中…</div> : null}
          {personalMode === "single" && claimDetail ? (
            <>
              <dl className="mt-3 grid gap-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 text-xs text-[var(--twin-body)] sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--twin-mute)]">单据状态</dt>
                  <dd>{claimStatusZh(claimDetail.status)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--twin-mute)]">领用申请时间</dt>
                  <dd>{toTimeText(claimDetail.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--twin-mute)]">出库完成时间</dt>
                  <dd>{toTimeText(claimDetail.fulfilledAt)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--twin-mute)]">申请领用人</dt>
                  <dd>{claimDetail.applicantName || claimDetail.userId || "-"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--twin-mute)]">出库处理人</dt>
                  <dd>{claimDetail.fulfilledByName || claimDetail.fulfilledBy || "-"}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-[var(--twin-body)]">下列与「领用单明细」导出 Excel 列一致（无库存类列、无领用单号行）。</p>
              <div className="mt-2 overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]">
                    <tr>
                      <th className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">物资名称</th>
                      <th className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">领用申请时间</th>
                      <th className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">出库完成时间</th>
                      <th className="border-b border-[var(--twin-hairline)] px-2 py-2">申请领用数量</th>
                      <th className="border-b border-[var(--twin-hairline)] px-2 py-2">出库数量</th>
                      <th className="border-b border-[var(--twin-hairline)] px-2 py-2">出入库类型</th>
                      <th className="border-b border-[var(--twin-hairline)] px-2 py-2">出库处理人</th>
                      <th className="border-b border-[var(--twin-hairline)] px-2 py-2">申请领用人</th>
                      <th className="border-b border-[var(--twin-hairline)] px-2 py-2">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(claimDetail.lines || []).map((line) => (
                      <tr key={line.id} className="hover:bg-[var(--twin-canvas-soft)]">
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{line.snapshotName}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">{toTimeText(claimDetail.createdAt)}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">{toTimeText(claimDetail.fulfilledAt)}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{line.qty}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{line.fulfilledQty ?? 0}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{lineIoType(claimDetail.status, line.fulfilledQty ?? 0)}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{claimDetail.fulfilledByName || claimDetail.fulfilledBy || "-"}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{claimDetail.applicantName || claimDetail.userId || "-"}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2 text-[var(--twin-mute)]">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {personalMode === "multi" && rangePack ? (
            <p className="mt-2 text-xs text-[var(--twin-body)]">
              {rangePack.applicantDisplayName || rangePack.applicantUserId} · {rangePack.total} 单 · {rangePack.from} ～ {rangePack.to}
            </p>
          ) : null}
          {personalMode === "multi" && aggregateFlatRows.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]">
                  <tr>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">物资名称</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">领用申请时间</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">出库完成时间</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2">申请领用数量</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2">出库数量</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2">出入库类型</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2">出库处理人</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2">申请领用人</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregateFlatRows.map((row) => (
                    <tr key={row.rowKey} className="hover:bg-[var(--twin-canvas-soft)]">
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{row.snapshotName}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">{toTimeText(row.createdAt)}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">{toTimeText(row.fulfilledAt)}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{row.qty}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{row.fulfilledQty}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{row.ioType}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{row.fulfilledByDisp}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{row.applicantDisp}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2 text-[var(--twin-mute)]">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : personalMode === "multi" && rangePack && !loadingRange && aggregateFlatRows.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--twin-mute)]">该区间内无明细行可展示。</p>
          ) : null}
        </section>
      ) : null}

      {tab === "audit" && canAudit ? (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--twin-body)]">物资分类</label>
              <select
                className="w-full rounded-twin-lg border border-[var(--twin-hairline-strong)] px-3 py-2 text-sm"
                value={categoryId === "" ? "" : String(categoryId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setCategoryId(v === "" ? "" : Number(v));
                  setSelectedItemId("");
                }}
              >
                <option value="">全部分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[var(--twin-body)]">搜索物品</label>
              <input
                className="w-full rounded-twin-lg border border-[var(--twin-hairline-strong)] px-3 py-2 text-sm"
                placeholder="按名称筛选下方列表"
                value={itemKeyword}
                onChange={(e) => setItemKeyword(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--twin-body)]">选择物品</label>
              <select
                className="w-full rounded-twin-lg border border-[var(--twin-hairline-strong)] px-3 py-2 text-sm"
                value={selectedItemId === "" ? "" : String(selectedItemId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedItemId(v === "" ? "" : Number(v));
                  setAuditPage(1);
                }}
              >
                <option value="">请选择物品…</option>
                {filteredItems.map((it) => (
                  <option key={it.id} value={String(it.id)}>
                    {auditHotItemIds.has(it.id) ? "※ " : ""}
                    {it.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedItemId === "" || exportingAudit}
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-twin-level-1 disabled:opacity-50"
              onClick={() => void exportAudit()}
            >
              {exportingAudit ? "导出中…" : "导出 Excel（单表审计明细）"}
            </button>
            <button
              type="button"
              disabled={selectedItemId === "" || auditFetching}
              className="rounded-full border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-4 py-2 text-xs text-[var(--twin-body)]"
              onClick={() => qc.invalidateQueries({ queryKey: auditQueryKey })}
            >
              刷新表格
            </button>
            <button
              type="button"
              disabled={selectedItemId === "" || mergedAuditRows.length === 0}
              className={`rounded-full px-4 py-2 text-xs font-medium shadow-twin-level-1 disabled:opacity-50 ${
                auditTableEditing ? "bg-amber-500 text-white" : "border border-violet-300 bg-violet-50 text-violet-800"
              }`}
              onClick={() => setAuditTableEditing((v) => !v)}
            >
              {auditTableEditing ? "完成编辑" : "编辑表格"}
            </button>
            <span className="text-xs text-[var(--twin-mute)]">※ 下拉中优先显示有流水或领用还原的物品</span>
          </div>
          <div className="overflow-x-auto rounded-twin-lg border border-[var(--twin-hairline)]">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]">
                <tr>
                  <th className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">变动时间</th>
                  <th className="border-b border-[var(--twin-hairline)] px-2 py-2">物资名称</th>
                  <th className="border-b border-[var(--twin-hairline)] px-2 py-2">类型</th>
                  <th className="border-b border-[var(--twin-hairline)] px-2 py-2">变动数量</th>
                  <th className="border-b border-[var(--twin-hairline)] px-2 py-2">现存</th>
                  <th className="border-b border-[var(--twin-hairline)] px-2 py-2">处理人</th>
                  <th className="border-b border-[var(--twin-hairline)] px-2 py-2">领用人</th>
                  <th className="border-b border-[var(--twin-hairline)] px-2 py-2">备注</th>
                </tr>
              </thead>
              <tbody>
                {mergedAuditRows.map((row) => {
                  const rk = auditMergedRowKey(row);
                  const draft = auditCellDraft[rk] || {};
                  if (row.kind === "movement") {
                    const m = row.movement;
                    const baseRemark = m.remark || "";
                    const remarkVal = draft.remark !== undefined ? draft.remark : baseRemark;
                    const stockBase = m.stockAfter != null ? String(m.stockAfter) : "";
                    const stockVal = draft.stockAfter !== undefined ? draft.stockAfter : stockBase;
                    const q = m.qty != null ? Number(m.qty) : 0;
                    return (
                      <tr key={rk} className="hover:bg-[var(--twin-canvas-soft)]">
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">{toTimeText(m.createdAt)}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{m.itemName || "-"}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">
                          {movementInOutLabelRow(m.movementType, q)}
                        </td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{movementChangeQtySignedDisplay(m)}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">
                          {auditTableEditing ? (
                            <input
                              className="w-20 min-w-0 rounded-twin-sm border border-[var(--twin-hairline-strong)] px-1 py-0.5"
                              value={stockVal}
                              onChange={(e) =>
                                setAuditCellDraft((prev) => ({
                                  ...prev,
                                  [rk]: { ...prev[rk], stockAfter: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            <span>{stockVal || "—"}</span>
                          )}
                        </td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{m.operatorName || m.operatorUserId || "-"}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{m.applicantName || m.applicantUserId || "-"}</td>
                        <td className="border-b border-[var(--twin-hairline)] px-2 py-2">
                          {auditTableEditing ? (
                            <input
                              className="min-w-[8rem] max-w-[14rem] rounded-twin-sm border border-[var(--twin-hairline-strong)] px-1 py-0.5"
                              value={remarkVal}
                              onChange={(e) =>
                                setAuditCellDraft((prev) => ({
                                  ...prev,
                                  [rk]: { ...prev[rk], remark: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            <span>{remarkVal || "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                  const h = row.restored;
                  const baseRemark = "自领用单还原";
                  const remarkVal = draft.remark !== undefined ? draft.remark : baseRemark;
                  const stockVal = draft.stockAfter !== undefined ? draft.stockAfter : "";
                  const oq = h.outboundQty != null ? Number(h.outboundQty) : 0;
                  const changeSigned = String(-Math.abs(oq));
                  return (
                    <tr key={rk} className="hover:bg-violet-50/40">
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">{toTimeText(h.outboundTime)}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{h.itemName || "-"}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">出库</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{changeSigned}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">
                        {auditTableEditing ? (
                          <input
                            className="w-20 min-w-0 rounded-twin-sm border border-[var(--twin-hairline-strong)] px-1 py-0.5"
                            value={stockVal}
                            onChange={(e) =>
                              setAuditCellDraft((prev) => ({
                                ...prev,
                                [rk]: { ...prev[rk], stockAfter: e.target.value },
                              }))
                            }
                          />
                        ) : (
                          <span className="text-[var(--twin-mute)]">{stockVal || "—"}</span>
                        )}
                      </td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{h.fulfilledByName || h.fulfilledByUserId || "-"}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{h.applicantName || h.applicantUserId || "-"}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">
                        {auditTableEditing ? (
                          <input
                            className="min-w-[8rem] max-w-[14rem] rounded-twin-sm border border-[var(--twin-hairline-strong)] px-1 py-0.5"
                            value={remarkVal}
                            onChange={(e) =>
                              setAuditCellDraft((prev) => ({
                                ...prev,
                                [rk]: { ...prev[rk], remark: e.target.value },
                              }))
                            }
                          />
                        ) : (
                          <span className="text-[var(--twin-body)]">{remarkVal}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {mergedAuditRows.length === 0 && !auditFetching ? (
              <div className="p-4 text-center text-xs text-[var(--twin-mute)]">
                本页暂无数据（流水与领用还原均为空，或翻页后无记录）
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-[var(--twin-mute)]">
            本页合并 {mergedAuditRows.length} 行（流水 {auditRows.length} 条 + 还原 {restoredRows.length} 条，按时间倒序）；流水共{" "}
            {auditTotal} 条、还原共 {restoredTotal} 条；翻页仍按两类各自分页后合并本页。
          </p>
          {Math.max(auditTotal, restoredTotal) > auditSize ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--twin-body)]">
              <button
                type="button"
                className="rounded-twin-sm border border-[var(--twin-hairline-strong)] px-2 py-1 disabled:opacity-40"
                disabled={auditPage <= 1}
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span>
                第 {auditPage} 页（流水 {Math.max(1, Math.ceil(auditTotal / auditSize))} 页 / 还原{" "}
                {Math.max(1, Math.ceil(restoredTotal / auditSize))} 页）
              </span>
              <button
                type="button"
                className="rounded-twin-sm border border-[var(--twin-hairline-strong)] px-2 py-1 disabled:opacity-40"
                disabled={auditPage >= Math.max(Math.ceil(auditTotal / auditSize), Math.ceil(restoredTotal / auditSize), 1)}
                onClick={() => setAuditPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
