import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import {
  createOrReuseSupplyClaimPdfLink,
  downloadPersonalClaimExcel,
  fetchSupplyClaimDetail,
  fetchSupplyClaimFormsMerged,
  type SupplyClaimOrder,
  type SupplyClaimLine,
} from "@/api/domains/supplies.api";
import { PdfPreviewDialog } from "@/components/common/PdfPreviewDialog";
import { PrintDispatchDialog } from "@/features/print-station/PrintDispatchDialog";
import {
  useSupplyPendingTasks,
  useSupplyRecentClosed,
  useFulfillSupplyClaim,
  useDeleteAdminSupplyClaim,
  useAdminClaimRecycle,
  usePurgeAdminClaimByIds,
  usePurgeAllAdminClaims,
  useRestoreAdminClaim,
} from "@/api/hooks/useSupplies";

import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import { webImageSrc } from "@/utils/mediaUrl";

import { appConfirm } from "@/lib/appDialog";
type TabKey = "pending" | "done" | "recycle";

function toTextTime(v?: string | null) {
  return formatDateTimeAsiaShanghai(v);
}

function claimStatusText(s: string) {
  if (s === "PENDING") return "待出库";
  if (s === "FULFILLED") return "已完成";
  if (s === "WITHDRAWN") return "已撤回";
  return s || "-";
}

function applicantLabel(o: SupplyClaimOrder) {
  return (o.applicantName && o.applicantName.trim()) || o.userId || "-";
}

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

/** 批量导出领用单的单次上限（与后端 MAX_BATCH_FORMS 对齐，前端先拦，免得白跑一次几分钟的请求） */
const MAX_BATCH_FORMS = 20;

export default function AdminSuppliesProcessPage() {  const navigate = useNavigate();
  const location = useLocation();
  const role = authStorage.getRole() || "MEMBER";
  const canProcess = hasMinRole(role, "SENIOR");
  const canReadMine = hasMinRole(role, "STAFF");
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, SupplyClaimOrder>>({});
  const [grantMapCache, setGrantMapCache] = useState<Record<string, Record<number, boolean>>>({});
  const [remarkMapCache, setRemarkMapCache] = useState<Record<string, Record<number, string>>>({});
  const [fulfillQtyCache, setFulfillQtyCache] = useState<Record<string, Record<number, number>>>({});
  /** 领用楼层（订单级，领用单表头那一栏）：出库时手填 */
  const [floorCache, setFloorCache] = useState<Record<string, string>>({});
  const [fulfillingIds, setFulfillingIds] = useState<Record<string, boolean>>({});
  const [selectedRecycleIds, setSelectedRecycleIds] = useState<string[]>([]);
  /** 正在预览《内部物品领用单》的那条记录（连同取回的字节与单号文件名） */
  const [formPreview, setFormPreview] = useState<{ row: SupplyClaimOrder; blob: Blob; fileName: string } | null>(null);
  /** 批量导出领用单时勾选的已完成单 */
  const [selectedDoneIds, setSelectedDoneIds] = useState<string[]>([]);
  const [batchExporting, setBatchExporting] = useState(false);
  /**
   * 要派发到打印工位的领用单（临时文件）。
   * 走 pendingFile：确认打到哪台机器时才上传，取消则服务端不留东西（与转移单同款）。
   */
  const [printFile, setPrintFile] = useState<File | null>(null);
  const [printRowId, setPrintRowId] = useState<string | null>(null);

  const { data: pendingRows = [], isLoading: pendingLoading } = useSupplyPendingTasks();
  // 上限 500：管理端要能翻到**所有**已完成的领用单（后端也放到了 500），好按单补打领用单。
  // 只看 FULFILLED —— 「已撤回」不是「已完成」，混在一起会把撤回单也当成能补打的单子。
  const { data: doneRows = [], isLoading: doneLoading } = useSupplyRecentClosed(500, "FULFILLED");
  const { data: recycleData, isLoading: recycleLoading } = useAdminClaimRecycle({ page: 1, size: 200 });
  const recycleRows = recycleData?.data ?? [];

  const fulfillMut = useFulfillSupplyClaim();
  const deleteMut = useDeleteAdminSupplyClaim();
  const purgeByIdsMut = usePurgeAdminClaimByIds();
  const purgeAllMut = usePurgeAllAdminClaims();
  const restoreMut = useRestoreAdminClaim();

  const allRows = [...pendingRows, ...doneRows, ...recycleRows];

  const toggleExpand = (id: string) => {
    if (expandedIds[id]) {
      setExpandedIds(prev => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    setExpandedIds(prev => ({ ...prev, [id]: true }));
    if (detailCache[id]) return;

    // 列表接口已返回 lines，直接从行数据构建缓存，无需再调详情 API
    const row = allRows.find(r => r.id === id);
    const lines = row?.lines;
    if (lines && lines.length > 0) {
      const initial: Record<number, boolean> = {};
      const remarks: Record<number, string> = {};
      const qtys: Record<number, number> = {};
      lines.forEach((line) => {
        initial[line.id] = line.fulfilledQty > 0;
        if (line.remark) remarks[line.id] = line.remark;
        qtys[line.id] = line.qty;
      });
      setDetailCache(prev => ({ ...prev, [id]: row as SupplyClaimOrder }));
      setGrantMapCache(prev => ({ ...prev, [id]: initial }));
      setRemarkMapCache(prev => ({ ...prev, [id]: remarks }));
      setFulfillQtyCache(prev => ({ ...prev, [id]: qtys }));
      return;
    }

    // 兜底：列表没 lines 时才调详情
    fetchSupplyClaimDetail(id).then(d => {
      setDetailCache(prev => ({ ...prev, [id]: d }));
      const initial: Record<number, boolean> = {};
      const remarks: Record<number, string> = {};
      const qtys: Record<number, number> = {};
      (d.lines || []).forEach((line) => {
        initial[line.id] = line.fulfilledQty > 0;
        if (line.remark) remarks[line.id] = line.remark;
        qtys[line.id] = line.qty;
      });
      setGrantMapCache(prev => ({ ...prev, [id]: initial }));
      setRemarkMapCache(prev => ({ ...prev, [id]: remarks }));
      setFulfillQtyCache(prev => ({ ...prev, [id]: qtys }));
    }).catch(error => {
      toast.error(error instanceof Error ? error.message : "加载详情失败");
      setExpandedIds(prev => { const n = { ...prev }; delete n[id]; return n; });
    });
  };

  const collapseOne = (id: string) => {
    setExpandedIds(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const linesAllCheckedFor = (id: string) => {
    const detail = detailCache[id];
    const grantMap = grantMapCache[id] || {};
    return detail && detail.lines && detail.lines.length > 0
      ? detail.lines.every((l) => !!grantMap[l.id])
      : false;
  };

  const toggleAllLinesFor = (id: string) => {
    const detail = detailCache[id];
    if (!detail?.lines) return;
    const grantMap = grantMapCache[id] || {};
    const next = !detail.lines.every((l) => !!grantMap[l.id]);
    const patch: Record<number, boolean> = {};
    detail.lines.forEach((l) => { patch[l.id] = next; });
    setGrantMapCache(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const submitFulfill = async (claimId: string) => {
    const detail = detailCache[claimId];
    if (!detail || !canProcess || detail.status !== "PENDING") return;
    const grantMap = grantMapCache[claimId] || {};
    const remarkMap = remarkMapCache[claimId] || {};
    const fulfillQtyMap = fulfillQtyCache[claimId] || {};
    const lines = (detail.lines || []).map((line: SupplyClaimLine) => ({
      lineId: line.id,
      grant: !!grantMap[line.id],
      fulfillQty: grantMap[line.id] ? (fulfillQtyMap[line.id] ?? line.qty) : undefined,
      remark: remarkMap[line.id]?.trim() || undefined,
    }));
    setFulfillingIds(prev => ({ ...prev, [claimId]: true }));
    try {
      await fulfillMut.mutateAsync({ id: claimId, lines, claimFloor: floorCache[claimId]?.trim() || undefined });
      collapseOne(claimId);
    } catch {
      // error handled by mutation
    } finally {
      setFulfillingIds(prev => { const n = { ...prev }; delete n[claimId]; return n; });
    }
  };

  const exportClaimExcel = async (claimId: string) => {
    try {
      const blob = await downloadPersonalClaimExcel(claimId);
      downloadBlob(blob, `supply-claim-${claimId}.xlsx`);
      toast.success("已导出 Excel");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    }
  };

  const loading = pendingLoading || doneLoading || recycleLoading;

  /**
   * 取领用单 PDF：先让后端生成/复用分享链接（已出库的是那一刻归档的、带出库人签名的那一份），
   * 再凭链接里的 token 拉字节。**文件名用链接里带的**（就是单号，如 20260923-位亚磊-1.pdf），
   * 与纸面印的一致，不用 claimId 那种 SC_<uuid>。
   */
  const resolveClaimForm = async (row: SupplyClaimOrder) => {
    const created = await createOrReuseSupplyClaimPdfLink(row.id);
    const url = created?.downloadUrl;
    if (!url) throw new Error("领用单生成失败");
    const res = await fetch(url);
    if (!res.ok) throw new Error("领用单打开失败");
    return { blob: await res.blob(), fileName: created?.fileName || `领用单-${row.id}.pdf` };
  };

  /** 预览：取一次字节，预览弹窗与后面的「打印」共用同一份（不再各拉一遍）。 */
  const openClaimForm = async (row: SupplyClaimOrder) => {
    try {
      const resolved = await resolveClaimForm(row);
      setFormPreview({ row, ...resolved });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载领用单失败");
    }
  };

  /** 打印领用单：取同一份字节落成 File，再交给派发弹窗选打印机（份数/工位在弹窗里选）。 */
  const printClaimForm = async (row: SupplyClaimOrder) => {
    try {
      const resolved = await resolveClaimForm(row);
      setPrintRowId(row.id);
      setPrintFile(new File([resolved.blob], resolved.fileName, { type: "application/pdf" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载领用单失败");
    }
  };

  /** 批量导出领用单：后端把选中的几张合并成一份多页 PDF 回传（顺序即勾选顺序）。 */
  const batchExportForms = async () => {
    if (!selectedDoneIds.length) {
      toast.error("请先勾选要领用单");
      return;
    }
    setBatchExporting(true);
    try {
      const blob = await fetchSupplyClaimFormsMerged(selectedDoneIds);
      downloadBlob(blob, `领用单合并-${selectedDoneIds.length}张.pdf`);
      toast.success(`已导出 ${selectedDoneIds.length} 张领用单`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量导出失败");
    } finally {
      setBatchExporting(false);
    }
  };

  const renderClaimCard = (row: SupplyClaimOrder, tab: TabKey) => {    const expanded = !!expandedIds[row.id];
    const detail = detailCache[row.id];
    const grantMap = grantMapCache[row.id] || {};
    const remarkMap = remarkMapCache[row.id] || {};
    const isPending = tab === "pending";
    const isRecycle = tab === "recycle";
    const isDone = tab === "done";
    const isFulfilling = !!fulfillingIds[row.id];
    const headerLines = detail?.lines || row.lines;
    const itemNamesText = headerLines && headerLines.length > 0
      ? headerLines.map(l => l.snapshotName).join('、')
      : null;

    return (
      <div key={row.id} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
        {/* 卡片头部 — 点击展开/收起 */}
        <button
          type="button"
          className="w-full cursor-pointer p-3 text-left"
          onClick={() => toggleExpand(row.id)}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-[var(--twin-ink)] min-w-0 flex-1 truncate">
              {applicantLabel(row)}
              {itemNamesText && <span className="text-xs text-[var(--twin-mute)] font-normal ml-1">({itemNamesText})</span>}
            </div>
            <div className="text-xs text-[var(--twin-mute)] shrink-0">{claimStatusText(row.status)}</div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--twin-mute)]">
              申请：{toTextTime(row.createdAt)}
              {isDone ? ` | 完成：${toTextTime(row.fulfilledAt)}` : ""}
              {isRecycle && row.deletedTime ? ` | 删除：${toTextTime(row.deletedTime)}` : ""}
            </span>
            {/* ⋮ 菜单 — 在时间戳行末尾 */}
            <span className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
              <span
                className="inline-flex size-6 items-center justify-center rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(menuOpenId === row.id ? null : row.id);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="2.5" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13.5" r="1.5" />
                </svg>
              </span>
              {menuOpenId === row.id && (
                <>
                  <span
                    className="fixed inset-0 z-[1]"
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }}
                  />
                  <span className="absolute right-0 top-full z-[2] mt-1 min-w-[130px] rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-1 shadow-twin-level-3 block text-left">
                    <span
                      className="block w-full px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(null);
                        void openClaimForm(row);
                      }}
                    >
                      预览领用单
                    </span>
                    <span
                      className="block w-full px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(null);
                        void printClaimForm(row);
                      }}
                    >
                      打印领用单
                    </span>
                    {!isRecycle && (
                      <span
                        className="block w-full px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(null);
                          void exportClaimExcel(row.id);
                        }}
                      >
                        导出 Excel
                      </span>
                    )}
                    {canProcess && !isRecycle && (
                      <span
                        className="block w-full px-3 py-1.5 text-xs text-red-600 hover:bg-[var(--twin-canvas-soft)] cursor-pointer"
                        onClick={async (e) => {
                          e.stopPropagation();
                          setMenuOpenId(null);
                          if (!await appConfirm("确认删除该申请单到回收站？")) return;
                          deleteMut.mutate(row.id);
                        }}
                      >
                        删除申请单
                      </span>
                    )}
                    {canProcess && isRecycle && (
                      <span
                        className="block w-full px-3 py-1.5 text-xs text-red-600 hover:bg-[var(--twin-canvas-soft)] cursor-pointer"
                        onClick={async (e) => {
                          e.stopPropagation();
                          setMenuOpenId(null);
                          if (!await appConfirm("确认彻底删除该申请单？")) return;
                          purgeByIdsMut.mutate([row.id]);
                        }}
                      >
                        彻底删除
                      </span>
                    )}
                  </span>
                </>
              )}
            </span>
          </div>
        </button>

        {/* 展开区域 */}
        {expanded && detail && (
          <div className="border-t border-[var(--twin-hairline)]">
            <div
              className="max-h-[360px] overflow-y-auto px-3 py-2 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <div className="mb-2 text-xs text-[var(--twin-body)]">
                申请人：{applicantLabel(detail)} | 状态：{claimStatusText(detail.status)} | 申请：{toTextTime(detail.createdAt)}
              </div>
              <div className="space-y-2">
                {(() => {
                  const lines = detail.lines || [];
                  const groups: Record<string, typeof lines> = {};
                  for (const line of lines) {
                    const key = line.specSnapshot || "__no_spec__";
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(line);
                  }
                  return Object.entries(groups).map(([groupKey, groupLines]) => {
                    const specLabel = groupKey !== "__no_spec__" ? formatSpecLabel(groupKey) : "";
                    return (
                      <div key={groupKey} className="space-y-1.5">
                        {specLabel ? (
                          <div className="text-xs font-medium text-[var(--twin-link-deep)] pl-1">
                            规格：{specLabel}
                          </div>
                        ) : null}
                        {groupLines.map((line) => (
                          <div key={line.id} className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-sm">
                            <div className="flex items-center gap-3">
                              {line.coverUrl ? (
                                <img
                                  src={webImageSrc(line.coverUrl)}
                                  alt={line.snapshotName}
                                  className="h-12 w-12 rounded-[var(--app-radius-container)] object-cover border border-[var(--twin-hairline)] shrink-0"
                                />
                              ) : (
                                <div className="h-12 w-12 rounded-[var(--app-radius-container)] bg-[var(--twin-canvas)] border border-[var(--twin-hairline)] flex items-center justify-center shrink-0">
                                  <span className="text-xs text-[var(--twin-mute)]">{line.snapshotName?.charAt(0) || "?"}</span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="text-[var(--twin-ink)] truncate">{line.snapshotName}</span>
                                  <span className="text-xs text-[var(--twin-mute)] shrink-0 tabular-nums">
                                    申请 ×{line.qty}
                                  </span>
                                  {!isPending && Number(line.fulfilledQty) > 0 ? (
                                    <span className="text-xs text-[var(--twin-mute)] shrink-0 tabular-nums">
                                      已发 ×{line.fulfilledQty}
                                    </span>
                                  ) : null}
                                </div>
                                {canProcess && isPending ? (
                                  <div className="mt-1 flex items-center gap-1.5 text-xs flex-wrap">
                                    <span className="text-[var(--twin-mute)] shrink-0">发放数量</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={line.qty}
                                      value={fulfillQtyCache[row.id]?.[line.id] ?? line.qty}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.min(line.qty, parseInt(e.target.value) || 1));
                                        setFulfillQtyCache(prev => ({
                                          ...prev,
                                          [row.id]: { ...prev[row.id], [line.id]: v },
                                        }));
                                      }}
                                      className="w-14 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-xs text-[var(--twin-ink)]"
                                    />
                                    <span className="text-[var(--twin-mute)] shrink-0">/ {line.qty}</span>
                                    <span className="text-[var(--twin-mute)] shrink-0 ml-1">备注</span>
                                    <input
                                      type="text"
                                      placeholder="可选"
                                      value={remarkMap[line.id] || ""}
                                      onChange={(e) => setRemarkMapCache(prev => ({
                                        ...prev,
                                        [row.id]: { ...prev[row.id], [line.id]: e.target.value },
                                      }))}
                                      className="flex-1 min-w-[60px] rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-xs text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]"
                                    />
                                  </div>
                                ) : null}
                                {!isPending && remarkMap[line.id] ? (
                                  <div className="mt-1 text-xs text-[var(--twin-mute)]">备注：{remarkMap[line.id]}</div>
                                ) : null}
                              </div>
                              {canProcess && isPending ? (
                                <label className="inline-flex items-center gap-1.5 text-xs text-[var(--twin-body)] shrink-0">
                                  <AdminSwitchScaled
                                    size="3.5"
                                    checked={!!grantMap[line.id]}
                                    onChange={(checked) => setGrantMapCache(prev => ({
                                      ...prev,
                                      [row.id]: { ...prev[row.id], [line.id]: checked },
                                    }))}
                                  />
                                  出库
                                </label>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* 底部操作栏 */}
            <div className="flex items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-3 pt-2">
              {canProcess && isPending ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] whitespace-nowrap"
                      onClick={() => toggleAllLinesFor(row.id)}
                    >
                      {linesAllCheckedFor(row.id) ? "取消全选" : "一键全选"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm text-sky-700 whitespace-nowrap"
                      onClick={() => {
                        collapseOne(row.id);
                        navigate(`${toAdminRoutePath("/admin/supplies")}?reviseClaimId=${encodeURIComponent(row.id)}`, {
                          state: { returnTo: `${location.pathname}${location.search}` },
                        });
                      }}
                    >
                      修改领用单
                    </button>
                    <label className="flex items-center gap-1.5 text-sm text-[var(--twin-body)] whitespace-nowrap">
                      领用楼层
                      <input
                        type="text"
                        value={floorCache[row.id] ?? ""}
                        onChange={(e) => setFloorCache((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        placeholder="如 3楼 301（可留空）"
                        className="w-40 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] whitespace-nowrap"
                      onClick={() => collapseOne(row.id)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 whitespace-nowrap"
                      onClick={() => void submitFulfill(row.id)}
                      disabled={isFulfilling}
                    >
                      {isFulfilling ? "提交中..." : "确认出库"}
                    </button>
                  </div>
                </>
              ) : null}
              {canProcess && isRecycle ? (
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-50"
                    disabled={restoreMut.isPending}
                    onClick={() => {
                      restoreMut.mutate(row.id, {
                        onSuccess: () => setSelectedRecycleIds((prev) => prev.filter((id) => id !== row.id)),
                      });
                    }}
                  >
                    恢复
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] whitespace-nowrap"
                    onClick={() => collapseOne(row.id)}
                  >
                    收起
                  </button>
                </div>
              ) : null}
              {isDone ? (
                <div className="flex items-center justify-end gap-2 w-full">
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] whitespace-nowrap"
                    onClick={() => collapseOne(row.id)}
                  >
                    收起
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!canReadMine) {
    return <div className="p-6 text-sm text-[var(--twin-body)]">无权限访问物资处理页。</div>;
  }

  return (
    <div className="space-y-4">
      <AdminSubPageHeader
        fallbackTo="/admin/supplies"
        backLabel="返回领用物资"
        title="物资处理台"
        description="处理待出库领用单、查看已结单与回收站；预览/导出跳转至领用审计页的个人单次视图。"
      />
      <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--twin-ink)]">物资处理台</h2>
          <div className="inline-flex rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5 text-xs font-medium">
            <button
              type="button"
              className={`rounded-full px-4 py-1.5 ${activeTab === "pending" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm" : "text-[var(--twin-body)]"}`}
              onClick={() => setActiveTab("pending")}
            >
              待处理
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-1.5 ${activeTab === "done" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm" : "text-[var(--twin-body)]"}`}
              onClick={() => setActiveTab("done")}
            >
              已处理
            </button>
            {canProcess ? (
              <button
                type="button"
                className={`rounded-full px-4 py-1.5 ${activeTab === "recycle" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm" : "text-[var(--twin-body)]"}`}
                onClick={() => setActiveTab("recycle")}
              >
                回收站
              </button>
            ) : null}
          </div>
        </div>

        {loading ? <DataSkeleton variant="table" rows={4} /> : null}

        {!loading && activeTab === "pending" ? (
          <div className="space-y-2">
            {pendingRows.map((row) => renderClaimCard(row, "pending"))}
            {pendingRows.length === 0 ? <EmptyState title="暂无待处理物资单" /> : null}
          </div>
        ) : null}

        {!loading && activeTab === "done" ? (
          <div className="space-y-2">
            {doneRows.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-xs text-[var(--twin-body)]">
                <span>
                  已选 {selectedDoneIds.length} / {doneRows.length} 张（一次最多 {MAX_BATCH_FORMS} 张）
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--twin-body)]"
                    onClick={() => setSelectedDoneIds(
                      selectedDoneIds.length ? [] : doneRows.slice(0, MAX_BATCH_FORMS).map((r) => r.id)
                    )}
                  >
                    {selectedDoneIds.length ? "清空选择" : `选前 ${MAX_BATCH_FORMS} 张`}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedDoneIds.length || batchExporting}
                    className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                    onClick={() => void batchExportForms()}
                  >
                    {batchExporting ? "导出中…" : "导出领用单 PDF"}
                  </button>
                </span>
              </div>
            ) : null}
            {doneRows.map((row) => (
              <div key={row.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-4 shrink-0"
                  checked={selectedDoneIds.includes(row.id)}
                  onChange={(e) => setSelectedDoneIds((prev) =>
                    e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                  )}
                />
                <div className="flex-1 min-w-0">{renderClaimCard(row, "done")}</div>
              </div>
            ))}
            {doneRows.length === 0 ? <EmptyState title="暂无已完成的物资单" /> : null}
          </div>
        ) : null}

        {!loading && activeTab === "recycle" && canProcess ? (
          <>
            <div className="mb-2 text-xs text-[var(--twin-mute)]">申请单回收站（7天后自动清空）</div>
            {recycleLoading ? <DataSkeleton variant="table" rows={3} /> : null}
            {!recycleLoading && recycleRows.length === 0 ? <EmptyState title="回收站为空" /> : null}
            <div className="space-y-2">
              {recycleRows.map((row) => (
                <div key={row.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-4 shrink-0"
                    checked={selectedRecycleIds.includes(row.id)}
                    onChange={(e) => setSelectedRecycleIds((prev) => e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))}
                  />
                  <div className="flex-1 min-w-0">{renderClaimCard(row, "recycle")}</div>
                </div>
              ))}
            </div>
            {recycleRows.length > 0 ? (
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
                  disabled={purgeByIdsMut.isPending}
                  onClick={async () => {
                    if (!selectedRecycleIds.length) return toast.error("请先勾选回收站申请单");
                    if (!await appConfirm(`确认彻底删除 ${selectedRecycleIds.length} 条回收站申请单吗？`)) return;
                    purgeByIdsMut.mutate(selectedRecycleIds, {
                      onSuccess: () => setSelectedRecycleIds([]),
                    });
                  }}
                >
                  批量彻底删除
                </button>
                <button
                  type="button"
                  className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  disabled={purgeAllMut.isPending}
                  onClick={async () => {
                    if (!await appConfirm("确认一键清空回收站吗？")) return;
                    purgeAllMut.mutate(undefined, {
                      onSuccess: () => setSelectedRecycleIds([]),
                    });
                  }}
                >
                  一键清空
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {formPreview ? (
        <PdfPreviewDialog
          title="内部物品领用单"
          fileName={formPreview.fileName}
          fetchPdf={async () => formPreview.blob}
          onClose={() => setFormPreview(null)}
        />
      ) : null}

      {/* 打印领用单：选打印机/份数都交给派发弹窗（临时文件，确认时才上传） */}
      {printFile && printRowId ? (
        <PrintDispatchDialog
          open
          onOpenChange={(v) => {
            if (!v) {
              setPrintFile(null);
              setPrintRowId(null);
            }
          }}
          sourceType="ADMIN_FILE"
          sourceId={printRowId}
          fileName={printFile.name}
          pendingFile={printFile}
        />
      ) : null}
    </div>
  );
}
