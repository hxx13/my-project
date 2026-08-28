/** 手机版 — 动物订购子页（复用 PC 端 reference-data 数据层，移动端重排 UI） */
import { useState, useMemo, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/hooks/queryKeys";
import {
  useRefDataList,
  useRefCart,
  useAddToCart,
  useUpdateCartItem,
  useRemoveCartItem,
  useClearCart,
  useSubmitOrder,
  useApprovedAups,
  useMarkCartPackageReady,
  useWithdrawCartPackage,
  useOrders,
} from "@/api/hooks/useReferenceData";
import { useAnimalOrderTimePolicy } from "@/api/hooks/useAnimalOrderTime";
import {
  resolveSharedCartGroupId,
  type RefCartItem,
  type RefDataItem,
} from "@/api/domains/referenceData.api";
import { authStorage } from "@/features/auth/authStorage";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";
import { useAupMyRoles } from "@/features/aup/hooks/useAup";
import { getTypeConfig } from "@/features/reference-data/typeRegistry";
import { webImageSrc } from "@/utils/mediaUrl";
import SpecSelectPanel from "@/features/reference-data/SpecSelectPanel";
import { appConfirm } from "@/lib/appDialog";
import { cn } from "@/lib/utils";
import { SplitSidebarScrollLayout } from "@/components/layout/ScrollFillLayout";
import { Loader2, WifiOff, ShoppingCart, X, ChevronRight, ChevronLeft, ClipboardList } from "lucide-react";

interface DrillSegment {
  id: number;
  label: string;
  typeKey: string;
}

function parseSpecLabel(ss?: Record<string, string> | string): string {
  if (!ss) return "";
  let obj: Record<string, string> = {};
  if (typeof ss === "string") {
    try { obj = JSON.parse(ss); } catch { return ss; }
  } else {
    obj = ss;
  }
  return obj.option || Object.values(obj).filter(Boolean)[0] || "";
}

function fieldVal(item: RefDataItem, key: string): string {
  const fd = item.fieldData as Record<string, unknown> | undefined;
  const v = fd?.[key];
  return v == null ? "" : String(v);
}

function hasSpecForItem(item: RefDataItem): boolean {
  const raw = (item.fieldData as Record<string, unknown>)?.specTemplateIds;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) && p.length > 0; } catch { return raw.trim().length > 0; }
  }
  return false;
}

export default function MobileAnimalOrderView({ jwtMode: _jwtMode }: { jwtMode?: boolean }) {
  const [activeTypeKey, setActiveTypeKey] = useState("SUPPLIER");
  const [drillStack, setDrillStack] = useState<DrillSegment[]>([]);
  const [specSelectItem, setSpecSelectItem] = useState<RefDataItem | null>(null);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [aupPickerOpen, setAupPickerOpen] = useState(false);
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitRemark, setSubmitRemark] = useState("");
  const [packageRemark, setPackageRemark] = useState("");
  const [itemLabelMap, setItemLabelMap] = useState<Record<number, string>>({});
  const [selectedAupId, setSelectedAupId] = useState<string>(() => {
    try { return localStorage.getItem("ref_active_aup") || ""; } catch { return ""; }
  });

  const qc = useQueryClient();

  const userInfo = authStorage.getUserInfo();
  const currentUserName = userInfo?.displayName?.trim() || userInfo?.username?.trim() || userInfo?.id?.trim() || "";
  const currentUserId = userInfo?.id?.trim() || "";
  const projectGroupName = userInfo?.projectGroupName?.trim() || "";

  const { data: approvedAups = [] } = useApprovedAups();
  const { data: myRoles } = useAupMyRoles();
  const isPi = !!myRoles?.isPi;

  const currentParentId = drillStack.length > 0 ? drillStack[drillStack.length - 1].id : undefined;
  const typeConfig = getTypeConfig(activeTypeKey);

  const breedCategoryKey = useMemo(() => {
    const breedSeg = drillStack.find((s) => s.typeKey === "ANIMAL_BREED");
    if (breedSeg) return String(breedSeg.id);
    if (specSelectItem?.parentId != null && activeTypeKey === "ANIMAL_STRAIN") {
      return String(specSelectItem.parentId);
    }
    return undefined;
  }, [drillStack, specSelectItem, activeTypeKey]);

  const { data: timePolicy } = useAnimalOrderTimePolicy(breedCategoryKey);
  const orderingBlocked = timePolicy != null && !timePolicy.canOrderNow;

  const groupId = useMemo(() => {
    const fromAup = approvedAups.find((a) => a.projectGroupId != null)?.projectGroupId;
    const effectiveGroupName =
      projectGroupName ||
      (approvedAups.find((a) => (a.projectGroupName || "").trim())?.projectGroupName ?? "");
    return resolveSharedCartGroupId(fromAup ?? null, effectiveGroupName);
  }, [approvedAups, projectGroupName]);

  useEffect(() => {
    if (!selectedAupId && approvedAups.length === 1) {
      setSelectedAupId(String(approvedAups[0].id));
    }
  }, [approvedAups, selectedAupId]);

  useEffect(() => {
    try {
      if (selectedAupId) localStorage.setItem("ref_active_aup", selectedAupId);
      else localStorage.removeItem("ref_active_aup");
    } catch { /* ignore */ }
  }, [selectedAupId]);

  const { data: items = [], isLoading, isError, error } = useRefDataList(activeTypeKey, currentParentId);
  const { data: serverCartItems = [], refetch: refetchCart } = useRefCart(groupId);
  const { data: orders = [] } = useOrders(groupId);

  // 侧边栏：当前层级父类型的兄弟项（下钻后切换父级用）
  const sidebarParentType = typeConfig?.parentType;
  const sidebarParentId = drillStack.length >= 2 ? drillStack[drillStack.length - 2].id : undefined;
  const { data: sidebarItems = [] } = useRefDataList(sidebarParentType ?? "", sidebarParentId);

  const addToCartMut = useAddToCart();
  const updateCartMut = useUpdateCartItem();
  const removeCartMut = useRemoveCartItem();
  const clearCartMut = useClearCart();
  const submitOrderMut = useSubmitOrder();
  const markReadyMut = useMarkCartPackageReady();
  const withdrawMut = useWithdrawCartPackage();

  const activeAup = useMemo(
    () => approvedAups.find((a) => String(a.id) === String(selectedAupId)) || null,
    [approvedAups, selectedAupId],
  );

  const cartLines = useMemo(() => {
    return (serverCartItems || []).map((ci: RefCartItem) => {
      const addedByName = (ci.addedByName || "").trim();
      return {
        id: ci.id,
        refDataId: ci.refDataId,
        itemLabel: (ci.refDataLabel || "").trim() || itemLabelMap[ci.refDataId] || `ID ${ci.refDataId}`,
        specLabel: parseSpecLabel(ci.specSelections),
        qty: ci.quantity || 0,
        aupRecordId: ci.aupRecordId,
        packageStatus: ci.packageStatus || "DRAFT",
        packageRemark: ci.packageRemark,
        addedBy: ci.addedBy,
        addedByLabel: addedByName || (ci.addedBy === currentUserId ? currentUserName : "") || ci.addedBy || "",
      };
    });
  }, [serverCartItems, itemLabelMap, currentUserId, currentUserName]);

  /** 无规格的可购商品：refDataId → 车行（直接加减数量用） */
  const plainCartByItem = useMemo(() => {
    const m = new Map<number, { id: number; qty: number }>();
    for (const l of cartLines) {
      if (l.specLabel) continue;
      m.set(l.refDataId, { id: l.id, qty: l.qty });
    }
    return m;
  }, [cartLines]);

  /** 每个商品在购物车里的总数量（含规格/无规格），「选择规格」按钮角标用 */
  const qtyByRefDataId = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of cartLines) {
      m.set(l.refDataId, (m.get(l.refDataId) || 0) + l.qty);
    }
    return m;
  }, [cartLines]);

  const cartCount = useMemo(() => cartLines.reduce((s, l) => s + l.qty, 0), [cartLines]);
  const myDraftLines = useMemo(
    () => cartLines.filter((l) => l.addedBy === currentUserId && l.packageStatus !== "READY"),
    [cartLines, currentUserId],
  );
  const myReadyLines = useMemo(
    () => cartLines.filter((l) => l.addedBy === currentUserId && l.packageStatus === "READY"),
    [cartLines, currentUserId],
  );
  const readyLines = useMemo(() => cartLines.filter((l) => l.packageStatus === "READY"), [cartLines]);

  // ── Navigation ──
  const handleDrillDown = useCallback((item: RefDataItem) => {
    if (!typeConfig?.childType) return;
    const label = String(fieldVal(item, "title") || fieldVal(item, "subtitle") || `ID ${item.id}`);
    setDrillStack((prev) => [...prev, { id: item.id, label, typeKey: activeTypeKey }]);
    setActiveTypeKey(typeConfig.childType);
  }, [typeConfig, activeTypeKey]);

  const handleGoBack = useCallback(() => {
    setDrillStack((prev) => {
      const next = prev.slice(0, -1);
      if (next.length === 0) setActiveTypeKey("SUPPLIER");
      else {
        const last = next[next.length - 1];
        const cfg = getTypeConfig(last.typeKey);
        if (cfg?.childType) setActiveTypeKey(cfg.childType);
      }
      return next;
    });
  }, []);

  const handleBreadcrumbNavigate = useCallback((index: number) => {
    if (index < 0) { setDrillStack([]); setActiveTypeKey("SUPPLIER"); return; }
    const keep = drillStack.slice(0, index + 1);
    setDrillStack(keep);
    const last = keep[keep.length - 1];
    const cfg = getTypeConfig(last.typeKey);
    if (cfg?.childType) setActiveTypeKey(cfg.childType);
  }, [drillStack]);

  const handleSidebarSwitch = useCallback((item: RefDataItem) => {
    if (drillStack.length === 0) return;
    const label = fieldVal(item, "title") || fieldVal(item, "subtitle") || `ID ${item.id}`;
    setDrillStack([
      ...drillStack.slice(0, -1),
      { id: item.id, label, typeKey: drillStack[drillStack.length - 1].typeKey },
    ]);
  }, [drillStack]);

  // ── Cart ──
  const handleAddToCart = useCallback((item: RefDataItem) => {
    if (orderingBlocked) { toast.error(timePolicy?.closedReason ?? "当前不可购"); return; }
    if (!selectedAupId) { toast.error("请先选择 AUP"); setAupPickerOpen(true); return; }
    if (!groupId) { toast.error("无法确定课题组共享购物车，请确认已加入课题组"); return; }
    const title = fieldVal(item, "title") || `ID ${item.id}`;
    setItemLabelMap((prev) => ({ ...prev, [item.id]: title }));
    setSpecSelectItem(item);
  }, [orderingBlocked, timePolicy?.closedReason, selectedAupId, groupId]);

  const handlePlainAdd = useCallback((item: RefDataItem) => {
    if (orderingBlocked) { toast.error(timePolicy?.closedReason ?? "当前不可购"); return; }
    if (!selectedAupId) { toast.error("请先选择 AUP"); setAupPickerOpen(true); return; }
    if (!groupId) { toast.error("无法确定课题组共享购物车，请确认已加入课题组"); return; }
    const title = fieldVal(item, "title") || `ID ${item.id}`;
    setItemLabelMap((prev) => ({ ...prev, [item.id]: title }));
    const existing = plainCartByItem.get(item.id);
    if (existing) {
      updateCartMut.mutate({ id: existing.id, body: { quantity: existing.qty + 1 } }, { onSuccess: () => void refetchCart() });
    } else {
      addToCartMut.mutate({ groupId, body: { refDataId: item.id, aupRecordId: Number(selectedAupId), quantity: 1 } }, { onSuccess: () => void refetchCart() });
    }
  }, [orderingBlocked, timePolicy?.closedReason, selectedAupId, groupId, plainCartByItem, updateCartMut, addToCartMut, refetchCart]);

  const handlePlainDec = useCallback((item: RefDataItem) => {
    const existing = plainCartByItem.get(item.id);
    if (!existing) return;
    if (existing.qty <= 1) {
      removeCartMut.mutate(existing.id, { onSuccess: () => void refetchCart() });
    } else {
      updateCartMut.mutate({ id: existing.id, body: { quantity: existing.qty - 1 } }, { onSuccess: () => void refetchCart() });
    }
  }, [plainCartByItem, removeCartMut, updateCartMut, refetchCart]);

  const handleSpecConfirm = useCallback(async (entries: { optionLabel: string; qty: number }[]) => {
    if (!specSelectItem || !selectedAupId || !groupId) return;
    const aupId = Number(selectedAupId);
    let ok = 0;
    for (const entry of entries) {
      try {
        await addToCartMut.mutateAsync({
          groupId,
          body: {
            refDataId: specSelectItem.id,
            aupRecordId: aupId,
            quantity: entry.qty,
            specSelections: { option: entry.optionLabel },
          },
        });
        ok += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加入失败");
      }
    }
    if (ok > 0) { toast.success(`已加入购物车 (${ok} 项)`); void refetchCart(); }
    setSpecSelectItem(null);
  }, [specSelectItem, selectedAupId, groupId, addToCartMut, refetchCart]);

  const handleCartQtyChange = useCallback((line: { id: number; addedBy: string }, qty: number) => {
    if (!isPi && line.addedBy !== currentUserId) { toast.error("只能修改本人加购的行"); return; }
    if (qty <= 0) { removeCartMut.mutate(line.id, { onSuccess: () => void refetchCart() }); return; }
    updateCartMut.mutate({ id: line.id, body: { quantity: qty } }, { onSuccess: () => void refetchCart() });
  }, [isPi, currentUserId, removeCartMut, updateCartMut, refetchCart]);

  const handleClearCart = useCallback(async () => {
    if (!isPi) { toast.error("仅组长可清空共享购物车"); return; }
    if (!await appConfirm("确认清空课题组共享购物车？此操作不可撤销。")) return;
    clearCartMut.mutate(groupId, { onSuccess: () => { setCartSheetOpen(false); void refetchCart(); } });
  }, [isPi, clearCartMut, groupId, refetchCart]);

  const handleMarkPackageReady = useCallback(() => {
    if (orderingBlocked) { toast.error(timePolicy?.closedReason ?? "当前不可购"); return; }
    if (myDraftLines.length === 0) { toast.error("没有可提交的草稿行"); return; }
    markReadyMut.mutate(
      { groupId, body: { packageRemark: packageRemark.trim() || undefined } },
      { onSuccess: () => { setPackageRemark(""); void refetchCart(); } },
    );
  }, [orderingBlocked, timePolicy?.closedReason, myDraftLines.length, markReadyMut, groupId, packageRemark, refetchCart]);

  const handleWithdrawPackage = useCallback(() => {
    if (myReadyLines.length === 0) return;
    withdrawMut.mutate({ groupId }, { onSuccess: () => void refetchCart() });
  }, [myReadyLines.length, withdrawMut, groupId, refetchCart]);

  const handleSubmitOrder = useCallback(() => {
    if (orderingBlocked) { toast.error(timePolicy?.closedReason ?? "当前不可购"); return; }
    if (!isPi) { toast.error("仅组长可正式提交申领单"); return; }
    if (readyLines.length === 0) { toast.error("没有 READY 订单包可提交"); return; }
    submitOrderMut.mutate(
      {
        groupId,
        submitterId: currentUserId,
        submitterName: currentUserName,
        projectGroupName,
        cartIds: readyLines.map((l) => l.id),
        submitRemark: submitRemark.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCartSheetOpen(false);
          setSubmitConfirmOpen(false);
          setSubmitRemark("");
          void qc.invalidateQueries({ queryKey: queryKeys.referenceData.all });
          void refetchCart();
        },
      },
    );
  }, [orderingBlocked, timePolicy?.closedReason, isPi, readyLines, submitOrderMut, groupId, currentUserId, currentUserName, projectGroupName, submitRemark, qc, refetchCart]);

  const breadcrumb: DrillSegment[] = drillStack;

  const cardContent = (
    <>
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-[var(--student-mute)] motion-reduce:animate-none" />
        </div>
      ) : isError ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <WifiOff className="size-7 text-[var(--student-mute)]" />
          <p className="text-xs text-[var(--student-mute)]">{error?.message || "加载失败"}</p>
        </div>
      ) : items.length === 0 ? (
        <p className="py-14 text-center text-[13px] text-[var(--student-mute)]">暂无可选项</p>
      ) : (
        <ul className="divide-y divide-[var(--student-hairline)] overflow-hidden rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface)]">
          {items.map((item) => {
            const purchasable = (item.fieldData as Record<string, unknown>)?.purchasable === true;
            const hasChildren = (item.childCount ?? 0) > 0;
            const canDrill = !!typeConfig?.childType && hasChildren;
            const title = fieldVal(item, "title") || `ID ${item.id}`;
            const subtitle = fieldVal(item, "subtitle");
            const desc = fieldVal(item, "description");
            const imageUrl = fieldVal(item, "imageUrl");
            const cover = imageUrl ? webImageSrc(imageUrl) : null;
            return (
              <li
                key={item.id}
                className={cn("flex gap-2 p-2", canDrill && "active:bg-[var(--student-canvas-soft)]")}
                onClick={canDrill ? () => handleDrillDown(item) : undefined}
              >
                {cover ? (
                  <div className="size-12 shrink-0 overflow-hidden rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)]">
                    <img src={cover} alt="" className="size-full object-cover" />
                  </div>
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] text-sm font-semibold text-[var(--student-mute)]">
                    {(typeConfig?.label || "品").charAt(0)}
                  </div>
                )}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="break-words text-[13px] font-semibold leading-snug text-[var(--student-ink)]">{title}</p>
                    {(subtitle || desc) && (
                      <p className="mt-0.5 break-words text-[11px] leading-snug text-[var(--student-mute)]">
                        {subtitle || desc}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {purchasable && hasSpecForItem(item) ? (
                      <button
                        type="button"
                        disabled={orderingBlocked}
                        onClick={() => handleAddToCart(item)}
                        className="relative shrink-0 rounded-full border border-[var(--student-primary-muted)] bg-[var(--student-primary-soft)] px-3 py-1 text-xs font-medium text-[var(--student-primary)] disabled:opacity-50"
                      >
                        选择规格
                        {(qtyByRefDataId.get(item.id) || 0) > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--student-danger)] px-0.5 text-[10px] font-bold text-white">
                            {qtyByRefDataId.get(item.id)}
                          </span>
                        )}
                      </button>
                    ) : purchasable ? (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={orderingBlocked || !plainCartByItem.get(item.id)}
                          onClick={() => handlePlainDec(item)}
                          className="flex size-6 items-center justify-center rounded border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-sm font-bold text-[var(--student-ink)] disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="min-w-5 text-center text-xs font-semibold tabular-nums">
                          {plainCartByItem.get(item.id)?.qty || 0}
                        </span>
                        <button
                          type="button"
                          disabled={orderingBlocked}
                          onClick={() => handlePlainAdd(item)}
                          className="flex size-6 items-center justify-center rounded bg-[var(--student-primary)] text-sm font-bold text-white disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    ) : null}
                    {canDrill && <ChevronRight className="size-4 shrink-0 text-[var(--student-mute)]" />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const sidebarRail = (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={handleGoBack}
        className="flex items-center gap-1 border-b border-[var(--student-hairline)] px-2 py-2.5 text-xs font-medium text-[var(--student-primary)]"
      >
        <ChevronLeft className="size-3.5" />
        <span>上一级</span>
      </button>
      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--student-mute)]">
        {getTypeConfig(sidebarParentType ?? "")?.label ?? ""}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sidebarItems.length === 0 ? (
          <p className="px-2 py-4 text-center text-[10px] text-[var(--student-mute)]">暂无</p>
        ) : (
          sidebarItems.map((si) => {
            const active = drillStack.length > 0 && drillStack[drillStack.length - 1].id === si.id;
            return (
              <button
                key={si.id}
                type="button"
                onClick={() => handleSidebarSwitch(si)}
                className={cn(
                  "block w-full px-2 py-2 text-left text-[11px] leading-snug transition-colors",
                  active
                    ? "border-l-2 border-[var(--student-primary)] bg-[var(--student-canvas)] font-semibold text-[var(--student-primary)]"
                    : "text-[var(--student-body)] hover:bg-[var(--student-canvas)]",
                )}
              >
                <span className="block break-words leading-snug">{fieldVal(si, "title") || fieldVal(si, "subtitle") || `ID ${si.id}`}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--student-canvas)]">
      {/* AUP + 订单记录 */}
      <div className="shrink-0 border-b border-[var(--student-hairline)] bg-[var(--student-surface)] px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAupPickerOpen(true)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-[var(--student-radius-sm)] border px-3 py-2 text-left",
              activeAup
                ? "border-sky-200 bg-sky-50"
                : "border-amber-200 bg-amber-50",
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">AUP</span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--student-ink)]">
              {activeAup ? activeAup.registerNo : "点击选择加购上下文（必选）"}
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-[var(--student-mute)]" />
          </button>
          <button
            type="button"
            onClick={() => setOrderHistoryOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-2.5 py-2 text-xs font-medium text-[var(--student-body)]"
          >
            <ClipboardList className="size-3.5" />
            订单记录
          </button>
        </div>

        {orderingBlocked && timePolicy && (
          <div className="mt-1.5 rounded-[var(--student-radius-sm)] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            {timePolicy.closedReason}
            {timePolicy.nextOpenAt && (
              <span className="ml-1">下次开放：{formatDateTimeAsiaShanghai(timePolicy.nextOpenAt)}</span>
            )}
          </div>
        )}
        {!orderingBlocked && timePolicy?.estimatedDeliveryDate && (
          <div className="mt-1.5 px-0.5 text-[11px] text-[var(--student-body)]">
            预计送达：{timePolicy.estimatedDeliveryDate}
          </div>
        )}
      </div>

      {/* 面包屑 */}
      {breadcrumb.length > 0 && (
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-[var(--student-hairline)] bg-[var(--student-surface)] px-2 py-1.5">
          <button
            type="button"
            onClick={() => handleBreadcrumbNavigate(-1)}
            className="flex shrink-0 items-center rounded px-1 py-0.5 text-xs font-medium text-[var(--student-primary)]"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          {breadcrumb.map((seg, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={`${seg.typeKey}-${seg.id}`} className="flex shrink-0 items-center gap-0.5">
                {i > 0 && <span className="text-[var(--student-mute)]">/</span>}
                <button
                  type="button"
                  onClick={() => handleBreadcrumbNavigate(i)}
                  className={cn(
                    "max-w-[120px] truncate rounded px-1.5 py-0.5 text-xs",
                    isLast ? "font-semibold text-[var(--student-ink)]" : "text-[var(--student-body)]",
                  )}
                >
                  {seg.label}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* 列表：下钻 + 侧边栏 */}
      <div className="min-h-0 flex-1">
        {drillStack.length === 0 ? (
          <div className="h-full overflow-y-auto overscroll-y-contain px-2 pb-24 pt-2">{cardContent}</div>
        ) : (
          <SplitSidebarScrollLayout
            sidebarClassName="flex w-[128px] shrink-0 flex-col border-r border-[var(--student-hairline)] bg-[var(--student-canvas-soft)]"
            contentClassName="px-2 pt-1.5 pb-24"
            sidebar={sidebarRail}
          >
            {cardContent}
          </SplitSidebarScrollLayout>
        )}
      </div>

      {/* 底部操作条 */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-[var(--student-hairline)] bg-[var(--student-surface)] px-3 py-2.5" style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}>
        <button
          type="button"
          onClick={() => setOrderHistoryOpen(true)}
          className="flex items-center gap-1 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-2.5 py-1.5 text-xs text-[var(--student-body)]"
        >
          <ClipboardList className="size-3.5" />
          订单
        </button>
        <button
          type="button"
          onClick={() => setCartSheetOpen(true)}
          className="relative flex flex-1 items-center justify-center gap-1.5 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] py-2 text-sm font-semibold text-[var(--student-primary-foreground)]"
        >
          <ShoppingCart className="size-4" />
          购物车
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--student-danger)] px-1 text-[10px] font-bold text-white">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </button>
      </div>

      {/* 购物车 Sheet */}
      {cartSheetOpen && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/35" onClick={() => setCartSheetOpen(false)} aria-hidden />
          <div className="relative flex max-h-[75vh] flex-col overflow-hidden rounded-t-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--student-hairline)] px-4 py-3">
              <p className="text-base font-bold text-[var(--student-ink)]">共享购物车 · {cartCount} 件</p>
              <button type="button" onClick={() => setCartSheetOpen(false)} className="flex size-8 items-center justify-center rounded-[var(--student-radius-sm)] text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)]">
                <X className="size-4" />
              </button>
            </div>

            {orderingBlocked && timePolicy && (
              <div className="mx-3 mt-2 rounded-[var(--student-radius-sm)] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                {timePolicy.closedReason}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {cartLines.length === 0 ? (
                <p className="py-8 text-center text-xs text-[var(--student-mute)]">共享购物车是空的</p>
              ) : (
                cartLines.map((line) => {
                  const canEdit = isPi || line.addedBy === currentUserId;
                  return (
                    <div key={line.id} className="flex items-center gap-2 border-b border-[var(--student-hairline)] py-2.5 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--student-ink)]">{line.itemLabel}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--student-mute)]">
                          {line.specLabel && <span>{line.specLabel} · </span>}
                          <span className="rounded bg-[var(--student-canvas-soft)] px-1 py-0.5 text-[10px]">
                            {line.packageStatus === "READY" ? "READY" : "DRAFT"}
                          </span>
                          {line.addedByLabel && <span className="ml-1">· {line.addedByLabel}</span>}
                        </p>
                        {line.packageRemark && <p className="mt-0.5 truncate text-[10px] text-[var(--student-mute)]">{line.packageRemark}</p>}
                      </div>
                      {canEdit ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => handleCartQtyChange(line, line.qty - 1)} className="size-6 rounded border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-xs font-bold text-[var(--student-ink)]">−</button>
                          <span className="w-6 text-center text-xs font-semibold tabular-nums">{line.qty}</span>
                          <button type="button" onClick={() => handleCartQtyChange(line, line.qty + 1)} className="size-6 rounded bg-[var(--student-primary)] text-xs font-bold text-white">+</button>
                        </div>
                      ) : (
                        <span className="shrink-0 text-xs font-semibold tabular-nums">×{line.qty}</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 实验员：提交包给 PI */}
            {!isPi && (
              <div className="shrink-0 border-t border-[var(--student-hairline)] px-3 py-2.5">
                <input
                  type="text"
                  placeholder="订单包统一备注（提交给 PI）"
                  value={packageRemark}
                  onChange={(e) => setPackageRemark(e.target.value)}
                  className="mb-2 w-full rounded border border-[var(--student-hairline)] bg-white px-2.5 py-1.5 text-xs outline-none"
                />
                <div className="flex items-center justify-end gap-2">
                  {myReadyLines.length > 0 && (
                    <button type="button" onClick={handleWithdrawPackage} disabled={withdrawMut.isPending} className="text-xs text-[var(--student-mute)]">
                      撤回 READY
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={orderingBlocked || myDraftLines.length === 0 || markReadyMut.isPending}
                    onClick={handleMarkPackageReady}
                    className="rounded-[var(--student-radius-sm)] bg-[var(--student-success)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {markReadyMut.isPending ? "提交中…" : "提交给 PI"}
                  </button>
                </div>
              </div>
            )}

            {/* PI：正式提交 */}
            {isPi && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--student-hairline)] px-4 py-3">
                <button type="button" disabled={cartCount === 0} onClick={handleClearCart} className="text-xs text-[var(--student-danger)] disabled:opacity-50">清空</button>
                <button
                  type="button"
                  disabled={orderingBlocked || submitOrderMut.isPending || readyLines.length === 0}
                  onClick={() => setSubmitConfirmOpen(true)}
                  className="rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-4 py-1.5 text-xs font-semibold text-[var(--student-primary-foreground)] disabled:opacity-50"
                >
                  {submitOrderMut.isPending ? "提交中…" : `正式提交 (${readyLines.length})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AUP 选择 Sheet */}
      {aupPickerOpen && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/35" onClick={() => setAupPickerOpen(false)} aria-hidden />
          <div className="relative max-h-[70vh] overflow-hidden rounded-t-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div className="flex items-center justify-between border-b border-[var(--student-hairline)] px-4 py-3">
              <p className="text-base font-bold text-[var(--student-ink)]">选择加购 AUP</p>
              <button type="button" onClick={() => setAupPickerOpen(false)} className="flex size-8 items-center justify-center rounded-[var(--student-radius-sm)] text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)]">
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[52vh] overflow-y-auto px-3 py-2">
              {approvedAups.length === 0 ? (
                <p className="py-8 text-center text-xs text-[var(--student-mute)]">本课题组暂无已批准的 AUP 计划书。</p>
              ) : (
                approvedAups.map((aup) => (
                  <button
                    key={aup.id}
                    type="button"
                    onClick={() => { setSelectedAupId(String(aup.id)); setAupPickerOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[var(--student-radius-sm)] px-3 py-2.5 text-left",
                      String(selectedAupId) === String(aup.id)
                        ? "bg-[var(--student-primary)] text-[var(--student-primary-foreground)]"
                        : "text-[var(--student-ink)] hover:bg-[var(--student-canvas-soft)]",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{aup.registerNo}</span>
                    {aup.projectGroupName && (
                      <span className="max-w-[10rem] truncate text-xs opacity-70">{aup.projectGroupName}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* PI 正式提交确认 */}
      {submitConfirmOpen && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={() => setSubmitConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-[var(--student-radius-lg)] bg-[var(--student-surface-raised)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-sm font-semibold text-[var(--student-ink)]">正式提交申领单</div>
            <div className="mb-2 text-xs text-[var(--student-mute)]">将提交 {readyLines.length} 条 READY 行，生成一张订单进入审批。</div>
            <textarea
              placeholder="整单备注（可选）"
              value={submitRemark}
              onChange={(e) => setSubmitRemark(e.target.value)}
              className="w-full rounded border border-[var(--student-hairline)] bg-white px-2.5 py-2 text-sm outline-none"
              rows={3}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setSubmitConfirmOpen(false)} className="rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] px-3 py-1.5 text-xs text-[var(--student-body)]">取消</button>
              <button
                type="button"
                disabled={submitOrderMut.isPending}
                onClick={handleSubmitOrder}
                className="rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-4 py-1.5 text-xs font-semibold text-[var(--student-primary-foreground)] disabled:opacity-50"
              >
                {submitOrderMut.isPending ? "提交中…" : "确认提交"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 订单记录 */}
      {orderHistoryOpen && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex min-h-0 flex-col bg-[var(--student-canvas)]">
          <div className="flex shrink-0 items-center border-b border-[var(--student-hairline)] bg-[var(--student-surface)] px-2" style={{ paddingTop: "env(safe-area-inset-top, 0px)", height: "calc(44px + env(safe-area-inset-top, 0px))" }}>
            <button type="button" onClick={() => setOrderHistoryOpen(false)} className="flex h-11 w-10 items-center justify-center" aria-label="返回">
              <ChevronLeft className="size-6 text-[var(--student-ink)]" />
            </button>
            <h2 className="flex-1 pr-10 text-center text-base font-semibold text-[var(--student-ink)]">我的订单</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {orders.length === 0 ? (
              <p className="py-16 text-center text-sm text-[var(--student-mute)]">暂无订单</p>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="mb-2.5 rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface)] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium text-[var(--student-ink)]">订单 #{o.id}</p>
                    <span className="shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--student-body)]">{o.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--student-mute)]">
                    {o.submittedAt ? formatDateTimeAsiaShanghai(o.submittedAt) : ""}
                    {o.estimatedDeliveryDate ? ` · 预计送达 ${o.estimatedDeliveryDate}` : ""}
                  </p>
                  {(o.lines?.length ?? 0) > 0 && (
                    <p className="mt-0.5 text-xs text-[var(--student-mute)]">
                      {(o.lines ?? []).map((l) => {
                        const chain = Array.isArray(l.hierarchyChain) ? l.hierarchyChain : [];
                        const name = chain.length ? (chain[0].displayName || `ID ${l.refDataId}`) : `ID ${l.refDataId}`;
                        return `${name} × ${l.quantity}`;
                      }).join("、")}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 规格选购弹窗（复用 PC 端） */}
      {specSelectItem && (
        <SpecSelectPanel
          item={specSelectItem}
          parentLabel={drillStack.length > 0 ? drillStack[drillStack.length - 1].label : undefined}
          onConfirm={handleSpecConfirm}
          onClose={() => setSpecSelectItem(null)}
          orderingBlocked={orderingBlocked}
        />
      )}
    </div>
  );
}
