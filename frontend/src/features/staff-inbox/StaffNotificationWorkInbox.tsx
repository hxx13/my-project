import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
} from "@/api/domains/notification.api";
import {
  fetchPurchaseOrderDetail,
  fetchPurchaseOrders,
  type PurchaseOrderRecord,
} from "@/api/domains/purchase.api";
import {
  fetchRepairOrderDetail,
  fetchRepairOrders,
  type RepairOrderRecord,
} from "@/api/domains/repair.api";
import {
  createOrReuseSupplyClaimPdfLink,
  fetchSupplyClaimDetail,
  listSupplyClaimPdfLinks,
  fetchSupplyPendingTasks,
  fetchSupplyRecentClosedClaims,
  fulfillSupplyClaim,
  type SupplyClaimLine,
  type SupplyClaimOrder,
  type SupplyClaimPdfLinkItem,
} from "@/api/domains/supplies.api";
import { ADMIN_NOTIFICATION_SSE_PUSH_EVENT } from "@/features/admin/adminPendingBadgesEvents";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { formatBeijingDateTimeFull, formatBeijingDateTimeMedium } from "@/utils/beijingTime";
import { webImageSrc } from "@/utils/mediaUrl";

export type StaffInboxWorkTab = "notice" | "pending" | "done";

type WorkKind = "claim" | "repair" | "purchase";

export interface StaffInboxUnifiedItem {
  key: string;
  workKind: WorkKind;
  id: string;
  kindLabel: string;
  title: string;
  sub: string;
  sortAt: number;
}

type UnifiedItem = StaffInboxUnifiedItem;

function sortKeyFrom(v: string | undefined | null) {
  if (!v) return 0;
  const t = Date.parse(String(v).replace(" ", "T"));
  return Number.isFinite(t) ? t : 0;
}

function claimStatusText(s: string) {
  if (s === "PENDING") return "待出库";
  if (s === "FULFILLED") return "已完成";
  if (s === "WITHDRAWN") return "已撤回";
  return s || "-";
}

function orderStatusText(s: string) {
  if (s === "PENDING") return "待处理";
  if (s === "PROCESSING") return "处理中";
  if (s === "COMPLETED") return "已完成";
  return s || "-";
}

function claimApplicantLabel(o: SupplyClaimOrder) {
  const n = (o.applicantName && o.applicantName.trim()) || "";
  if (n) return n;
  return (o.userId && o.userId.trim()) || "-";
}

function orderApplicantLabel(row: RepairOrderRecord | PurchaseOrderRecord) {
  const n = (row.applicantName && row.applicantName.trim()) || "";
  if (n) return n;
  return (row.applicantId && row.applicantId.trim()) || "-";
}

function workOrderListParams(isAdmin: boolean, status: string) {
  if (isAdmin) {
    return { page: 1, size: 40, status, includePrivate: true, onlyMine: false };
  }
  return { page: 1, size: 40, status, onlyMine: true };
}

export type StaffNotificationWorkInboxProps = {
  activeTab?: StaffInboxWorkTab;
  onActiveTabChange?: (t: StaffInboxWorkTab) => void;
  /** 为 false 时由外层（如 StaffMessagesPage）渲染「通知 / 待处理 / 已处理」切换条 */
  showWorkTabBar?: boolean;
  /** 嵌入消息页「通知」列：系统通知 + 待处理 + 已处理纵向堆叠，点击行由外层打开右侧详情 */
  stackedNotifyColumn?: boolean;
  onSelectNotificationRow?: (row: NotificationRecord) => void;
  onSelectWorkItemRow?: (item: UnifiedItem) => void;
  /** 列表未读/条数变化时回调，供外层角标逐级穿透 */
  onCountsChange?: (c: { noticeUnread: number; pendingCount: number; doneCount: number }) => void;
};

export type StaffNotificationWorkInboxHandle = {
  openClaimById: (orderId: string) => Promise<void>;
  openRepairById: (id: string) => Promise<void>;
  openPurchaseById: (id: string) => Promise<void>;
  /** 右侧内联详情操作后刷新左侧列表与角标 */
  reloadWorkLists: () => Promise<void>;
};

export const StaffNotificationWorkInbox = forwardRef<StaffNotificationWorkInboxHandle, StaffNotificationWorkInboxProps>(
  function StaffNotificationWorkInbox(
    {
      activeTab = "notice",
      onActiveTabChange,
      showWorkTabBar = false,
      stackedNotifyColumn = false,
      onSelectNotificationRow,
      onSelectWorkItemRow,
      onCountsChange,
    },
    ref
  ) {
  const role = authStorage.getRole() || "STUDENT";
  const isAdmin = hasMinRole(role, "ADMIN");
  const canStaff = hasMinRole(role, "STAFF");

  const [rows, setRows] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const [unifiedPending, setUnifiedPending] = useState<UnifiedItem[]>([]);
  const [unifiedDone, setUnifiedDone] = useState<UnifiedItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [doneLoading, setDoneLoading] = useState(false);

  const [modalKind, setModalKind] = useState<"claim" | "repair" | "purchase" | null>(null);
  const [claimDetail, setClaimDetail] = useState<SupplyClaimOrder | null>(null);
  const [workOrderDetail, setWorkOrderDetail] = useState<RepairOrderRecord | PurchaseOrderRecord | null>(null);
  const [grantMap, setGrantMap] = useState<Record<number, boolean>>({});
  const [fulfilling, setFulfilling] = useState(false);
  const [claimLinkRows, setClaimLinkRows] = useState<SupplyClaimPdfLinkItem[]>([]);
  const [claimLinkLoading, setClaimLinkLoading] = useState(false);

  const closeModals = () => {
    setModalKind(null);
    setClaimDetail(null);
    setWorkOrderDetail(null);
    setGrantMap({});
    setFulfilling(false);
    setClaimLinkRows([]);
    setClaimLinkLoading(false);
  };

  const loadData = useCallback(
    async (options?: { showLoading?: boolean; showError?: boolean }) => {
      const showLoading = options?.showLoading ?? true;
      const showError = options?.showError ?? true;
      if (showLoading) setLoading(true);
      try {
        const data = await fetchNotifications(1, 100, onlyUnread, {
          ...(canStaff ? { excludeBizTypes: "REPAIR,PURCHASE,SUPPLIES_CLAIM" } : {}),
        });
        setRows(data.data || []);
      } catch (error) {
        if (showError) {
          toast.error(error instanceof Error ? error.message : "加载通知失败");
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [onlyUnread, canStaff]
  );

  const loadPendingUnified = useCallback(
    async (showLoading: boolean) => {
      if (!canStaff) return;
      if (showLoading) setPendingLoading(true);
      try {
        const wo = (st: string) => workOrderListParams(isAdmin, st);
        const [claims, rPen, rProc, pPen, pProc] = await Promise.all([
          fetchSupplyPendingTasks(),
          fetchRepairOrders(wo("PENDING")),
          fetchRepairOrders(wo("PROCESSING")),
          fetchPurchaseOrders(wo("PENDING")),
          fetchPurchaseOrders(wo("PROCESSING")),
        ]);

        const merged: UnifiedItem[] = [];
        (claims || []).forEach((o) => {
          merged.push({
            key: `claim_${o.id}`,
            workKind: "claim",
            id: o.id,
            kindLabel: "物资领用",
            title: claimApplicantLabel(o),
            sub: `${formatBeijingDateTimeMedium(o.createdAt)} · ${claimStatusText(o.status)}`,
            sortAt: sortKeyFrom(o.createdAt),
          });
        });

        const pushOrders = (list: RepairOrderRecord[] | PurchaseOrderRecord[], kindLabel: string, workKind: "repair" | "purchase") => {
          list.forEach((row) => {
            const applicant = orderApplicantLabel(row);
            merged.push({
              key: `${workKind}_${row.id}_${row.status}`,
              workKind,
              id: row.id,
              kindLabel,
              title: row.location || "-",
              sub: `${applicant} · ${orderStatusText(row.status)} · ${formatBeijingDateTimeMedium(row.createTime)}`,
              sortAt: sortKeyFrom(row.startTime || row.createTime),
            });
          });
        };

        pushOrders(rPen.data || [], "报修", "repair");
        pushOrders(rProc.data || [], "报修", "repair");
        pushOrders(pPen.data || [], "采购", "purchase");
        pushOrders(pProc.data || [], "采购", "purchase");

        merged.sort((a, b) => b.sortAt - a.sortAt);
        setUnifiedPending(merged);
      } catch {
        setUnifiedPending([]);
      } finally {
        setPendingLoading(false);
      }
    },
    [canStaff, isAdmin]
  );

  const loadDoneUnified = useCallback(
    async (showLoading: boolean) => {
      if (!canStaff) return;
      if (showLoading) setDoneLoading(true);
      try {
        const wo = workOrderListParams(isAdmin, "COMPLETED");
        const [claims, rDone, pDone] = await Promise.all([
          fetchSupplyRecentClosedClaims(40),
          fetchRepairOrders(wo),
          fetchPurchaseOrders(wo),
        ]);

        const merged: UnifiedItem[] = [];
        (claims || []).forEach((o) => {
          const endLine = o.status === "WITHDRAWN" ? "已撤回" : `已完成 · ${formatBeijingDateTimeMedium(o.fulfilledAt)}`;
          merged.push({
            key: `claim_done_${o.id}`,
            workKind: "claim",
            id: o.id,
            kindLabel: "物资领用",
            title: claimApplicantLabel(o),
            sub: `${formatBeijingDateTimeMedium(o.createdAt)} · ${endLine}`,
            sortAt: sortKeyFrom(o.fulfilledAt || o.createdAt),
          });
        });

        const pushDone = (list: RepairOrderRecord[] | PurchaseOrderRecord[], kindLabel: string, workKind: "repair" | "purchase") => {
          list.forEach((row) => {
            const applicant = orderApplicantLabel(row);
            merged.push({
              key: `${workKind}_done_${row.id}`,
              workKind,
              id: row.id,
              kindLabel,
              title: row.location || "-",
              sub: `${applicant} · 已完成 · 完成 ${formatBeijingDateTimeMedium(row.finishTime)}`,
              sortAt: sortKeyFrom(row.finishTime || row.createTime),
            });
          });
        };

        pushDone(rDone.data || [], "报修", "repair");
        pushDone(pDone.data || [], "采购", "purchase");

        merged.sort((a, b) => b.sortAt - a.sortAt);
        setUnifiedDone(merged);
      } catch {
        setUnifiedDone([]);
      } finally {
        setDoneLoading(false);
      }
    },
    [canStaff, isAdmin]
  );

  useEffect(() => {
    if (!stackedNotifyColumn) return;
    void loadData({ showLoading: true, showError: true });
  }, [stackedNotifyColumn, onlyUnread, loadData]);

  useEffect(() => {
    if (!stackedNotifyColumn || !canStaff) return;
    void loadPendingUnified(true);
    void loadDoneUnified(true);
  }, [stackedNotifyColumn, canStaff, loadPendingUnified, loadDoneUnified]);

  useEffect(() => {
    if (stackedNotifyColumn) return;
    if (activeTab !== "notice") return;
    void loadData({ showLoading: true, showError: true });
  }, [stackedNotifyColumn, activeTab, onlyUnread, loadData]);

  useEffect(() => {
    if (stackedNotifyColumn) return;
    if (activeTab === "pending") void loadPendingUnified(true);
    else if (activeTab === "done") void loadDoneUnified(true);
  }, [stackedNotifyColumn, activeTab, loadPendingUnified, loadDoneUnified]);

  /** 列表刷新由 AdminLayout 常驻 SSE 收到后派发 ADMIN_NOTIFICATION_SSE_PUSH_EVENT，避免与侧栏角标各开一条连接 */
  useEffect(() => {
    const onSsePush = () => {
      void loadData({ showLoading: false, showError: false });
      if (canStaff) {
        void loadPendingUnified(false);
        void loadDoneUnified(false);
      }
    };
    window.addEventListener(ADMIN_NOTIFICATION_SSE_PUSH_EVENT, onSsePush);
    return () => window.removeEventListener(ADMIN_NOTIFICATION_SSE_PUSH_EVENT, onSsePush);
  }, [loadData, loadPendingUnified, loadDoneUnified, canStaff]);

  useEffect(() => {
    if (!onCountsChange) return;
    const noticeUnread = rows.reduce((n, r) => n + (r.isRead === 0 ? 1 : 0), 0);
    onCountsChange({
      noticeUnread,
      pendingCount: unifiedPending.length,
      doneCount: unifiedDone.length,
    });
  }, [rows, unifiedPending.length, unifiedDone.length, onCountsChange]);

  const openClaimModal = async (orderId: string) => {
    try {
      const d = await fetchSupplyClaimDetail(orderId);
      setWorkOrderDetail(null);
      setClaimDetail(d);
      const gm: Record<number, boolean> = {};
      (d.lines || []).forEach((l) => {
        gm[l.id] = true;
      });
      setGrantMap(gm);
      setModalKind("claim");
      setClaimLinkLoading(true);
      try {
        const links = await listSupplyClaimPdfLinks(orderId);
        setClaimLinkRows(links.links || []);
      } finally {
        setClaimLinkLoading(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载领用单失败");
    }
  };

  const displayClaimLink = (item: SupplyClaimPdfLinkItem) => item.downloadUrl || item.downloadPath;

  const generateClaimLink = async () => {
    if (!claimDetail) return;
    setClaimLinkLoading(true);
    try {
      const created = await createOrReuseSupplyClaimPdfLink(claimDetail.id);
      const links = await listSupplyClaimPdfLinks(claimDetail.id);
      setClaimLinkRows(links.links || []);
      const copyText = created.downloadUrl || created.downloadPath;
      if (copyText) await navigator.clipboard.writeText(copyText);
      toast.success(created.reused ? "已复用链接（已复制）" : "已生成链接（已复制）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "获取链接失败");
    } finally {
      setClaimLinkLoading(false);
    }
  };

  const openWorkOrderModal = async (kind: "repair" | "purchase", id: string) => {
    try {
      const d =
        kind === "repair" ? await fetchRepairOrderDetail(id) : await fetchPurchaseOrderDetail(id);
      setClaimDetail(null);
      setGrantMap({});
      setWorkOrderDetail(d);
      setModalKind(kind);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "无权限或加载失败");
    }
  };

  const openClaimModalRef = useRef(openClaimModal);
  openClaimModalRef.current = openClaimModal;
  const openWorkOrderModalRef = useRef(openWorkOrderModal);
  openWorkOrderModalRef.current = openWorkOrderModal;

  const reloadWorkLists = useCallback(async () => {
    await loadData({ showLoading: false, showError: true });
    if (canStaff) {
      await Promise.all([loadPendingUnified(false), loadDoneUnified(false)]);
    }
  }, [loadData, loadPendingUnified, loadDoneUnified, canStaff]);
  const reloadWorkListsRef = useRef(reloadWorkLists);
  reloadWorkListsRef.current = reloadWorkLists;

  useImperativeHandle(
    ref,
    () => ({
      openClaimById: async (orderId: string) => {
        await openClaimModalRef.current(orderId);
      },
      openRepairById: async (id: string) => {
        await openWorkOrderModalRef.current("repair", id);
      },
      openPurchaseById: async (id: string) => {
        await openWorkOrderModalRef.current("purchase", id);
      },
      reloadWorkLists: async () => {
        await reloadWorkListsRef.current();
      },
    }),
    []
  );

  const onWorkItemClick = (item: UnifiedItem) => {
    if (onSelectWorkItemRow) {
      onSelectWorkItemRow(item);
      return;
    }
    if (item.workKind === "claim") {
      void openClaimModal(item.id);
      return;
    }
    if (item.workKind === "repair" || item.workKind === "purchase") {
      void openWorkOrderModal(item.workKind, item.id);
    }
  };

  const handleFulfill = async () => {
    if (!claimDetail || !isAdmin || claimDetail.status !== "PENDING") return;
    const lines = (claimDetail.lines || []).map((l) => ({
      lineId: l.id,
      grant: grantMap[l.id] === true,
      fulfillQty: l.qty,
    }));
    if (!lines.some((x) => x.grant)) {
      toast.error("请至少勾选一行");
      return;
    }
    setFulfilling(true);
    try {
      await fulfillSupplyClaim(claimDetail.id, lines);
      toast.success("已确认出库");
      closeModals();
      await loadData({ showLoading: false, showError: true });
      if (canStaff) {
        await Promise.all([loadPendingUnified(false), loadDoneUnified(false)]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "出库失败");
    } finally {
      setFulfilling(false);
    }
  };

  const handleRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      await loadData({ showLoading: false, showError: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "标记已读失败");
    }
  };

  const handleReadAll = async () => {
    if (!window.confirm("确认全部标记已读？")) return;
    try {
      await markAllNotificationsRead();
      toast.success("已全部标记为已读");
      await loadData({ showLoading: false, showError: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const bizTypeZh = (bizType?: string) => {
    if (bizType === "REPAIR") return "报修";
    if (bizType === "PURCHASE") return "采购";
    if (bizType === "SUPPLIES_CLAIM") return "物资领用";
    return bizType || "-";
  };

  const eventTypeZh = (eventType?: string) => {
    if (eventType === "CREATED") return "已创建";
    if (eventType === "STARTED") return "已接单";
    if (eventType === "COMPLETED") return "已完成";
    if (eventType === "WITHDRAWN") return "已撤回";
    if (eventType === "DELETED") return "已删除";
    if (eventType === "RESTORED") return "已恢复";
    return eventType || "-";
  };

  const tabBtn = (tab: StaffInboxWorkTab, label: string) => (
    <button
      type="button"
      key={tab}
      onClick={() => onActiveTabChange?.(tab)}
      className={`rounded-lg border px-4 py-2 text-sm font-medium ${
        activeTab === tab ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {label}
    </button>
  );

  const countBadge = (n: number) =>
    n > 0 ? (
      <span className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white tabular-nums ring-1 ring-rose-800/25">
        {n > 99 ? "99+" : n}
      </span>
    ) : null;

  const noticeUnreadCount = rows.reduce((acc, r) => acc + (r.isRead === 0 ? 1 : 0), 0);

  const isPublicText = (n: number | undefined) => {
    if (n === 1) return "公开";
    if (n === 0) return "非公开";
    return "";
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
      {!stackedNotifyColumn && showWorkTabBar && canStaff ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {tabBtn("notice", "通知")}
          {tabBtn("pending", "待处理")}
          {tabBtn("done", "已处理")}
        </div>
      ) : null}

      {stackedNotifyColumn ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
            <label className="text-sm text-slate-700">
              <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} className="mr-2" />
              仅看未读
            </label>
            {canStaff ? (
              <span className="text-xs text-slate-500">待处理 / 已处理已并入本栏；点卡片后在右侧看全文</span>
            ) : (
              <span className="text-xs text-slate-500">点卡片后在右侧看全文</span>
            )}
            <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => void handleReadAll()}>
              全部已读
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
            <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="truncate">系统通知</span>
                  {countBadge(noticeUnreadCount)}
                </div>
                <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">向内穿透 · 会话角标 → 会话 Tab → 本栏</span>
              </div>
              {loading && <div className="py-2 text-sm text-slate-500">加载中...</div>}
              {!loading && rows.length === 0 && (
                <div className="rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-500">暂无通知</div>
              )}
              <div className="max-h-[min(38vh,15rem)] space-y-1.5 overflow-y-auto pr-0.5 sm:max-h-[min(34vh,17rem)]">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      if (onSelectNotificationRow) {
                        onSelectNotificationRow(row);
                        return;
                      }
                      if (row.bizType === "SUPPLIES_CLAIM" && row.bizId) {
                        void openClaimModal(row.bizId);
                      }
                    }}
                    className={`flex w-full flex-col rounded-lg border px-2.5 py-2 text-left text-sm transition hover:bg-slate-50/90 ${
                      row.isRead ? "border-slate-100 bg-white" : "border-blue-300 bg-blue-50/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{row.title}</span>
                      {row.isRead === 0 ? countBadge(1) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{formatBeijingDateTimeFull(row.createTime)}</div>
                    <div className="mt-1 line-clamp-2 text-left text-xs text-slate-600">{row.content}</div>
                    {row.isRead === 0 ? (
                      <button
                        type="button"
                        className="mt-1.5 self-end text-[11px] text-blue-700 underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRead(row.id);
                        }}
                      >
                        标记已读
                      </button>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>

            {canStaff ? (
              <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    待处理
                    {countBadge(unifiedPending.length)}
                  </div>
                </div>
                {pendingLoading ? (
                  <div className="text-sm text-slate-500">加载中…</div>
                ) : unifiedPending.length === 0 ? (
                  <div className="text-sm text-slate-500">暂无待处理工单</div>
                ) : (
                  <ul className="max-h-[min(32vh,13rem)] space-y-1.5 overflow-y-auto pr-0.5">
                    {unifiedPending.map((item) => (
                      <li key={item.key}>
                        <button
                          type="button"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50/40"
                          onClick={() => onWorkItemClick(item)}
                        >
                          <div className="text-[10px] font-medium text-blue-700">{item.kindLabel}</div>
                          <div className="truncate font-medium text-slate-900">{item.title}</div>
                          <div className="truncate text-[11px] text-slate-500">{item.sub}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {canStaff ? (
              <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-900">
                  已处理
                  <span className="text-[10px] font-normal text-slate-400">({unifiedDone.length})</span>
                </div>
                {doneLoading ? (
                  <div className="text-sm text-slate-500">加载中…</div>
                ) : unifiedDone.length === 0 ? (
                  <div className="text-sm text-slate-500">暂无已处理记录</div>
                ) : (
                  <ul className="max-h-[min(28vh,11rem)] space-y-1.5 overflow-y-auto pr-0.5">
                    {unifiedDone.map((item) => (
                      <li key={item.key}>
                        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-sm hover:border-blue-300 hover:bg-blue-50/40">
                          <button type="button" className="w-full text-left" onClick={() => onWorkItemClick(item)}>
                            <div className="text-[10px] font-medium text-emerald-700">{item.kindLabel}</div>
                            <div className="truncate font-medium text-slate-900">{item.title}</div>
                            <div className="truncate text-[11px] text-slate-500">{item.sub}</div>
                          </button>
                          {item.workKind === "claim" ? (
                            <div className="mt-1.5 flex justify-end">
                              <button
                                type="button"
                                className="rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-800"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const created = await createOrReuseSupplyClaimPdfLink(item.id);
                                    const text = created.downloadUrl || created.downloadPath;
                                    if (text) await navigator.clipboard.writeText(text);
                                    toast.success(created.reused ? "已复用链接（已复制）" : "已生成链接（已复制）");
                                  } catch (error) {
                                    toast.error(error instanceof Error ? error.message : "获取链接失败");
                                  }
                                }}
                              >
                                下载链接
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
        </>
      ) : (
        <>
          {activeTab === "notice" && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
              <label className="text-sm text-slate-700">
                <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} className="mr-2" />
                仅看未读
              </label>
              {canStaff && <span className="text-xs text-slate-500">工单类提醒已归并到「待处理 / 已处理」</span>}
              <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => void handleReadAll()}>
                全部已读
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {activeTab === "notice" && (
              <div className="space-y-2">
                {loading && <div className="text-sm text-slate-500">加载中...</div>}
                {!loading && rows.length === 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">暂无通知</div>
                )}
                {rows.map((row) => (
                  <div
                    key={row.id}
                    role={row.bizType === "SUPPLIES_CLAIM" && row.bizId ? "button" : undefined}
                    tabIndex={row.bizType === "SUPPLIES_CLAIM" && row.bizId ? 0 : undefined}
                    onClick={() => {
                      if (row.bizType === "SUPPLIES_CLAIM" && row.bizId) {
                        void openClaimModal(row.bizId);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (row.bizType === "SUPPLIES_CLAIM" && row.bizId && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        void openClaimModal(row.bizId!);
                      }
                    }}
                    className={`rounded-lg border border-slate-200 bg-white p-3.5 ${row.isRead ? "opacity-80" : "border-blue-300"} ${
                      row.bizType === "SUPPLIES_CLAIM" && row.bizId ? "cursor-pointer hover:border-blue-400" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-medium">{row.title}</div>
                      <div className="shrink-0 text-xs text-slate-500">{formatBeijingDateTimeFull(row.createTime)}</div>
                    </div>
                    <div className="text-sm text-slate-700">{row.content}</div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        业务: {bizTypeZh(row.bizType)} / 事件: {eventTypeZh(row.eventType)} / 单号: {row.bizId || "-"}
                        {row.bizType === "SUPPLIES_CLAIM" && row.bizId ? " · 点击查看明细" : ""}
                      </span>
                      {row.isRead === 0 ? (
                        <button
                          type="button"
                          className="rounded border border-blue-300 px-2 py-1 text-blue-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRead(row.id);
                          }}
                        >
                          标记已读
                        </button>
                      ) : (
                        <span>已读</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "pending" && canStaff && (
              <section className="rounded-lg border border-slate-200 bg-white p-3.5">
                <h3 className="mb-1 text-sm font-semibold text-slate-900">待处理</h3>
                <p className="mb-3 text-xs text-slate-500">物资领用、报修、采购等未完成工单（按时间倒序）</p>
                {pendingLoading ? (
                  <div className="text-sm text-slate-500">加载中…</div>
                ) : unifiedPending.length === 0 ? (
                  <div className="text-sm text-slate-500">暂无待处理工单</div>
                ) : (
                  <ul className="space-y-2">
                    {unifiedPending.map((item) => (
                      <li key={item.key}>
                        <button
                          type="button"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50/40"
                          onClick={() => onWorkItemClick(item)}
                        >
                          <div className="text-xs font-medium text-blue-700">{item.kindLabel}</div>
                          <div className="font-medium text-slate-900">{item.title}</div>
                          <div className="text-xs text-slate-500">{item.sub}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {activeTab === "done" && canStaff && (
              <section className="rounded-lg border border-slate-200 bg-white p-3.5">
                <h3 className="mb-1 text-sm font-semibold text-slate-900">已处理</h3>
                <p className="mb-3 text-xs text-slate-500">最近完成的出库、报修、采购（各取最近若干条）</p>
                {doneLoading ? (
                  <div className="text-sm text-slate-500">加载中…</div>
                ) : unifiedDone.length === 0 ? (
                  <div className="text-sm text-slate-500">暂无已处理记录</div>
                ) : (
                  <ul className="space-y-2">
                    {unifiedDone.map((item) => (
                      <li key={item.key}>
                        <div className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50/40">
                          <button type="button" className="w-full text-left" onClick={() => onWorkItemClick(item)}>
                            <div className="text-xs font-medium text-emerald-700">{item.kindLabel}</div>
                            <div className="font-medium text-slate-900">{item.title}</div>
                            <div className="text-xs text-slate-500">{item.sub}</div>
                          </button>
                          {item.workKind === "claim" && (
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                className="rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const created = await createOrReuseSupplyClaimPdfLink(item.id);
                                    const text = created.downloadUrl || created.downloadPath;
                                    if (text) await navigator.clipboard.writeText(text);
                                    toast.success(created.reused ? "已复用链接（已复制）" : "已生成链接（已复制）");
                                  } catch (error) {
                                    toast.error(error instanceof Error ? error.message : "获取链接失败");
                                  }
                                }}
                              >
                                下载链接
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </>
      )}

      {modalKind === "claim" && claimDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">出库处理 · 领用单</h3>
              <button type="button" className="text-sm text-slate-500" onClick={closeModals}>
                关闭
              </button>
            </div>
            <div className="mb-3 text-sm text-slate-600">
              状态: {claimStatusText(claimDetail.status)} · 申请人: {claimApplicantLabel(claimDetail)} ·{" "}
              {formatBeijingDateTimeMedium(claimDetail.createdAt)}
            </div>
            <ul className="mb-4 space-y-2 text-sm">
              {(claimDetail.lines || []).map((l: SupplyClaimLine) => (
                <li key={l.id} className="flex items-center justify-between rounded border px-2 py-2">
                  <div>
                    <div className="font-medium">{l.snapshotName}</div>
                    <div className="text-xs text-slate-500">
                      申请 {l.qty} · 已发 {l.fulfilledQty}
                    </div>
                  </div>
                  {isAdmin && claimDetail.status === "PENDING" ? (
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={grantMap[l.id] === true}
                        onChange={(e) => setGrantMap((m) => ({ ...m, [l.id]: e.target.checked }))}
                      />
                      发放
                    </label>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mb-4 rounded border border-slate-200 p-3 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-slate-700">PDF下载链接</span>
                <button
                  type="button"
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-800 disabled:opacity-50"
                  disabled={claimLinkLoading}
                  onClick={() => void generateClaimLink()}
                >
                  {claimLinkLoading ? "处理中…" : "获取下载链接"}
                </button>
              </div>
              {claimLinkRows.length === 0 ? (
                <div className="text-slate-500">{claimLinkLoading ? "加载中..." : "暂无链接"}</div>
              ) : (
                <div className="space-y-1">
                  {claimLinkRows.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1">
                      <span className="text-slate-600">{item.fileName || "-"}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-0.5"
                          onClick={async () => {
                            await navigator.clipboard.writeText(displayClaimLink(item));
                            toast.success("已复制");
                          }}
                        >
                          复制
                        </button>
                        <a
                          href={displayClaimLink(item)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-indigo-800"
                        >
                          打开
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isAdmin && claimDetail.status === "PENDING" ? (
              <button
                type="button"
                disabled={fulfilling}
                className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void handleFulfill()}
              >
                {fulfilling ? "提交中…" : "确认出库"}
              </button>
            ) : (
              <button type="button" className="w-full rounded border border-slate-200 py-2 text-sm" onClick={closeModals}>
                知道了
              </button>
            )}
          </div>
        </div>
      )}

      {(modalKind === "repair" || modalKind === "purchase") && workOrderDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">{modalKind === "repair" ? "报修单" : "采购单"}</h3>
              <button type="button" className="text-sm text-slate-500" onClick={closeModals}>
                关闭
              </button>
            </div>
            <div className="space-y-2 text-sm text-slate-700">
              <div>
                <span className="text-slate-500">状态：</span>
                {orderStatusText(workOrderDetail.status)}
              </div>
              <div>
                <span className="text-slate-500">申请人：</span>
                {orderApplicantLabel(workOrderDetail)}
              </div>
              {isPublicText(workOrderDetail.isPublic) ? (
                <div>
                  <span className="text-slate-500">可见性：</span>
                  {isPublicText(workOrderDetail.isPublic)}
                </div>
              ) : null}
              <div>
                <span className="text-slate-500">地点：</span>
                {workOrderDetail.location || "-"}
              </div>
              <div>
                <span className="text-slate-500">内容：</span>
                <div className="mt-1 whitespace-pre-wrap break-words">{workOrderDetail.content || "-"}</div>
              </div>
              {workOrderDetail.startTime ? (
                <div>
                  <span className="text-slate-500">接单时间：</span>
                  {formatBeijingDateTimeMedium(workOrderDetail.startTime)}
                </div>
              ) : null}
              {workOrderDetail.finishTime ? (
                <div>
                  <span className="text-slate-500">完成时间：</span>
                  {formatBeijingDateTimeMedium(workOrderDetail.finishTime)}
                </div>
              ) : null}
              {(workOrderDetail.processorName && workOrderDetail.processorName.trim()) ||
              (workOrderDetail.processorId && workOrderDetail.processorId.trim()) ? (
                <div>
                  <span className="text-slate-500">处理人：</span>
                  {(workOrderDetail.processorName && workOrderDetail.processorName.trim()) ||
                    workOrderDetail.processorId ||
                    "-"}
                </div>
              ) : null}
              {workOrderDetail.resultRemark ? (
                <div>
                  <span className="text-slate-500">处理说明：</span>
                  <div className="mt-1 whitespace-pre-wrap break-words">{workOrderDetail.resultRemark}</div>
                </div>
              ) : null}
            </div>

            {workOrderDetail.requestImages?.some((u) => webImageSrc(u)) ? (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold text-slate-800">申请附图</div>
                <div className="flex flex-wrap gap-2">
                  {workOrderDetail.requestImages
                    .map((u) => webImageSrc(u))
                    .filter(Boolean)
                    .map((src, i) => (
                      <img key={`req-${i}-${src}`} src={src} alt="" className="h-24 w-24 rounded border object-cover" />
                    ))}
                </div>
              </div>
            ) : null}
            {workOrderDetail.resultImages?.some((u) => webImageSrc(u)) ? (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold text-slate-800">处理附图</div>
                <div className="flex flex-wrap gap-2">
                  {workOrderDetail.resultImages
                    .map((u) => webImageSrc(u))
                    .filter(Boolean)
                    .map((src, i) => (
                      <img key={`res-${i}-${src}`} src={src} alt="" className="h-24 w-24 rounded border object-cover" />
                    ))}
                </div>
              </div>
            ) : null}

            <button type="button" className="mx-auto mt-6 block w-full max-w-xs rounded border border-slate-200 py-2 text-sm" onClick={closeModals}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
