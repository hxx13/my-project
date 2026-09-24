/** 手机版 — 动物订购子页（复用 PC 端 reference-data 数据层，移动端重排 UI） */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/hooks/queryKeys";
import {
  useRefDataList,
  useRefCart,
  useOrderCycles,
  useSpecTemplates,
  useAddToCart,
  useUpdateCartItem,
  useRemoveCartItem,
  useClearCart,
  useClearMyDraftCart,
  useSubmitOrder,
  useApprovedAups,
  useMarkCartPackageReady,
  useWithdrawCartPackage,
  useOrders,
} from "@/api/hooks/useReferenceData";
import { useAnimalOrderTimePolicy } from "@/api/hooks/useAnimalOrderTime";
import {
  resolveSharedCartGroupId,
  resolveOrderGroupName,
  splitGroupNames,
  type RefCartItem,
  type RefDataItem,
  loadOrderToCart,
  applyOrderEdit,
  discardOrderEdit,
} from "@/api/domains/referenceData.api";
import { releaseCageReservation } from "@/api/domains/animalOrderCage.api";
import { authStorage } from "@/features/auth/authStorage";
import { formatDateTimeAsiaShanghaiMinute } from "@/lib/formatDateTimeAsiaShanghai";
import { useAupMyRoles } from "@/features/aup/hooks/useAup";
import { getTypeConfig } from "@/features/reference-data/typeRegistry";
import { webImageSrc } from "@/utils/mediaUrl";
import MobileOrderRecordsView from "./MobileOrderRecordsView";
import "./animal-order-scope.css";
import CartTree, { CartTreeModeToggle, type CartTreeMode } from "@/features/reference-data/CartTree";
import { useCartQuotaConvergence } from "@/features/reference-data/useCartQuotaConvergence";
import { refCardLines, refCardPrice, specRowsOf, specQuotaLine } from "@/features/reference-data/ReferenceCard";
import { useSpecQuotaBatch } from "@/features/reference-data/useSpecQuotaBatch";
import SpecSelectPanel, { type OrderPickupInfo, type PickupMode } from "@/features/reference-data/SpecSelectPanel";
import MobileCagePickerSheet from "@/pages/mobile/MobileCagePickerSheet";
import type { PickedCage } from "@/pages/mobile/cagePickerLogic";
import { allocateInOrder, allocatedTotal } from "@/features/reference-data/cageAllocation";
import CampusGate from "@/features/reference-data/CampusGate";
import { ANIMAL_ORDER_CAMPUSES, readStoredCampus, storeCampus, type AnimalOrderCampus } from "@/features/reference-data/campus";
import { appConfirm } from "@/lib/appDialog";
import { cn } from "@/lib/utils";
import { SplitSidebarScrollLayout } from "@/components/layout/ScrollFillLayout";
import { Loader2, WifiOff, ShoppingCart, X, ChevronRight, ChevronLeft, ChevronDown, Check, ClipboardList, MapPin } from "lucide-react";

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

export default function MobileAnimalOrderView({ jwtMode: _jwtMode, onRegisterExitGuard }: { jwtMode?: boolean; onRegisterExitGuard?: (fn: (() => Promise<boolean>) | null) => void }) {
  const [activeTypeKey, setActiveTypeKey] = useState("SUPPLIER");
  const [drillStack, setDrillStack] = useState<DrillSegment[]>([]);
  const [specSelectItem, setSpecSelectItem] = useState<RefDataItem | null>(null);
  // ── 笼位链路（与 PC ReferenceDataManager 同款的页面级状态） ──
  const [pickedCages, setPickedCages] = useState<PickedCage[]>([]);
  const [allocPinned, setAllocPinned] = useState<Record<string, number>>({});
  const [maxQuantityPerCage, setMaxQuantityPerCage] = useState(0);
  const [cageSpecCtx, setCageSpecCtx] = useState<{ specOptionLabel: string; quantity: number }>({
    specOptionLabel: "",
    quantity: 0,
  });
  const [cagePickerOpen, setCagePickerOpen] = useState(false);
  /** 领用方式：饲养=预定笼位（默认），取走=不占笼位不选房间 */
  const [pickupMode, setPickupMode] = useState<PickupMode>("FARM");
  /** 购物车「定位」的目标笼位：非空时抽屉以「只定位」形态打开，不经过规格面板 */
  const [locateCageId, setLocateCageId] = useState<string | null>(null);
  /** +1 = 让笼位抽屉切到「按顺序分配」页（点标题行的进度） */
  const [openAllocTick, setOpenAllocTick] = useState(0);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  /** 购物车分组视角：持在页面里，因为切换器画在抽屉标题行（列表区归 CartTree 渲染） */
  const [cartTreeMode, setCartTreeMode] = useState<CartTreeMode>("aup-user-spec");
  const [aupPickerOpen, setAupPickerOpen] = useState(false);
  const [campusSheetOpen, setCampusSheetOpen] = useState(false);
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);
  const [editOrderId, setEditOrderId] = useState<number | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitRemark, setSubmitRemark] = useState("");
  const [packageRemark, setPackageRemark] = useState("");
  const [itemLabelMap, setItemLabelMap] = useState<Record<number, string>>({});
  // 校区：首次进入强制选择，之后记住并可在顶栏切换
  const [campus, setCampus] = useState<AnimalOrderCampus | null>(() => readStoredCampus());
  const [selectedAupId, setSelectedAupId] = useState<string>(() => {
    try { return localStorage.getItem("ref_active_aup") || ""; } catch { return ""; }
  });

  /**
   * 笼位分配：按选中顺序铺满（每笼上限 maxQuantityPerCage），最后一个笼位拿余数。
   * 规格面板填的只是总数，每笼实际拿多少由这里算。
   */
  const cageAlloc = useMemo(
    () => allocateInOrder(
      cageSpecCtx.quantity,
      pickedCages.map((c) => c.animalCageId),
      maxQuantityPerCage,
      allocPinned,
    ),
    [cageSpecCtx.quantity, pickedCages, maxQuantityPerCage, allocPinned],
  );

  /** 规格面板每次填数量都回报；值没变就不 set，避免 effect 来回触发 */
  const handleCageContextChange = useCallback(
    (ctx: { specOptionLabel: string; quantity: number }) => {
      setCageSpecCtx((prev) =>
        prev.specOptionLabel === ctx.specOptionLabel && prev.quantity === ctx.quantity ? prev : ctx,
      );
    },
    [],
  );

  /** 退出选购：有已锁笼位先确认，再清状态并逐个释放预定 */
  const exitCageSession = useCallback(async () => {
    if (pickedCages.length > 0) {
      if (!await appConfirm(`已选 ${pickedCages.length} 个笼位将被释放，确定退出？`)) return;
    }
    setPickedCages([]);
    setAllocPinned({});
    setCagePickerOpen(false);
    setSpecSelectItem(null);
    setLocateCageId(null);
    for (const r of pickedCages) {
      try { await releaseCageReservation(r.reservationId); } catch { /* 启动清理兜底 */ }
    }
  }, [pickedCages]);

  /** 领用方式切换：取走关掉笼位抽屉并放掉已选笼位，饲养再打开 */
  const handlePickupModeChange = useCallback((mode: PickupMode) => {
    setPickupMode(mode);
    if (mode === "TAKE") {
      setCagePickerOpen(false);
      const cur = pickedCages;
      setPickedCages([]);
      setAllocPinned({});
      for (const r of cur) {
        void releaseCageReservation(r.reservationId).catch(() => {});
      }
    } else {
      setCagePickerOpen(true);
    }
  }, [pickedCages]);

  const qc = useQueryClient();

  const userInfo = authStorage.getUserInfo();
  const currentUserName = userInfo?.displayName?.trim() || userInfo?.username?.trim() || userInfo?.id?.trim() || "";
  const currentUserId = userInfo?.id?.trim() || "";
  const projectGroupName = userInfo?.projectGroupName?.trim() || "";

  const { data: approvedAups = [] } = useApprovedAups();

  // 本人课题组名（userInfo.projectGroupName 可能是多组拼接串，必须拆开）
  const myGroupNames = useMemo(() => splitGroupNames(projectGroupName), [projectGroupName]);

  // 下单归属课题组名：多课题组账号取所选 AUP 的课题组（单值），否则与同组其他人的口径对不上
  const orderGroupName = useMemo(
    () => resolveOrderGroupName(approvedAups, selectedAupId, myGroupNames),
    [approvedAups, selectedAupId, myGroupNames],
  );

  // 领用人候选范围：本人课题组（缺失时回退 AUP 课题组；仍为空则选购弹窗禁用领用人选择）
  const effectiveGroupNames = useMemo(
    () => (myGroupNames.length ? myGroupNames : orderGroupName ? [orderGroupName] : []),
    [myGroupNames, orderGroupName],
  );
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

  const { data: timePolicy } = useAnimalOrderTimePolicy(campus ?? undefined, breedCategoryKey);
  const orderingBlocked = timePolicy != null && !timePolicy.canOrderNow;

  // 共享购物车 key 走课题组名，不用 project_group.id —— 该表同名多行，同组不同账号可能解析到不同 id
  const groupId = useMemo(() => resolveSharedCartGroupId(null, orderGroupName), [orderGroupName]);

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
  const { data: templates = [] } = useSpecTemplates();
  const { data: serverCartItems = [], refetch: refetchCart } = useRefCart(groupId);
  const { data: orders = [] } = useOrders(groupId);

  /** 到货周期：当前周期 = 第一个 current 项；端点未就绪时为空 → 购物车全落「本周期」 */
  const { data: cycles = [] } = useOrderCycles(campus ?? undefined, breedCategoryKey);
  const currentCycle = useMemo(() => cycles.find((c) => c.current)?.cycle ?? null, [cycles]);

  // 一屏卡片逐规格剩余量：一次批量请求 + 15s 轮询
  const specQuotaByKey = useSpecQuotaBatch(items, templates, campus ?? undefined, currentCycle);

  // 侧边栏：当前层级父类型的兄弟项（下钻后切换父级用）
  const sidebarParentType = typeConfig?.parentType;
  const sidebarParentId = drillStack.length >= 2 ? drillStack[drillStack.length - 2].id : undefined;
  const { data: sidebarItems = [] } = useRefDataList(sidebarParentType ?? "", sidebarParentId);

  const addToCartMut = useAddToCart();
  const updateCartMut = useUpdateCartItem();
  const removeCartMut = useRemoveCartItem();
  const clearCartMut = useClearCart();
  const clearMyDraftMut = useClearMyDraftCart();
  const submitOrderMut = useSubmitOrder();
  const markReadyMut = useMarkCartPackageReady();
  const withdrawMut = useWithdrawCartPackage();

  const activeAup = useMemo(
    () => approvedAups.find((a) => String(a.id) === String(selectedAupId)) || null,
    [approvedAups, selectedAupId],
  );

  const aupLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of approvedAups) m.set(String(a.id), a.registerNo);
    return m;
  }, [approvedAups]);

  const cartLines = useMemo(() => {
    return (serverCartItems || []).map((ci: RefCartItem) => {
      const addedByName = (ci.addedByName || "").trim();
      return {
        id: ci.id,
        key: String(ci.id),
        itemId: ci.refDataId,
        itemLabel: (ci.refDataLabel || "").trim() || itemLabelMap[ci.refDataId] || `ID ${ci.refDataId}`,
        specLabel: parseSpecLabel(ci.specSelections),
        qty: ci.quantity || 0,
        unitPrice: ci.unitPrice ?? null,
        lineAmount: ci.lineAmount ?? null,
        pickupRoomName: ci.pickupRoomName ?? null,
        collectorName: ci.collectorName ?? null,
        deliveryCycle: ci.deliveryCycle ?? null,
        aupRecordId: ci.aupRecordId,
        aupLabel: aupLabelById.get(String(ci.aupRecordId)) || "未归属",
        packageStatus: ci.packageStatus || "DRAFT",
        packageRemark: ci.packageRemark,
        remark: ci.remark,
        addedBy: ci.addedBy,
        addedByLabel: addedByName || (ci.addedBy === currentUserId ? currentUserName : "") || ci.addedBy || "",
      };
    });
  }, [serverCartItems, itemLabelMap, aupLabelById, currentUserId, currentUserName]);

  /** 每个商品在购物车里的总数量（含规格/无规格），「选择规格」按钮角标用 */
  const qtyByRefDataId = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of cartLines) {
      m.set(l.itemId, (m.get(l.itemId) || 0) + l.qty);
    }
    return m;
  }, [cartLines]);

  const cartCount = useMemo(() => cartLines.reduce((s, l) => s + l.qty, 0), [cartLines]);

  // 购物车实时总金额：只累加已定价的行；全车无定价时为 null（显示「—」而非 0）
  const cartTotalAmount = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const l of cartLines) {
      if (l.lineAmount == null) continue;
      any = true;
      sum += l.lineAmount;
    }
    return any ? sum : null;
  }, [cartLines]);
  const myDraftLines = useMemo(
    () => cartLines.filter((l) => l.addedBy === currentUserId && l.packageStatus !== "READY"),
    [cartLines, currentUserId],
  );
  const myReadyLines = useMemo(
    () => cartLines.filter((l) => l.addedBy === currentUserId && l.packageStatus === "READY"),
    [cartLines, currentUserId],
  );
  // PI 是最终提交人，本人加购的行不必再走「提交给 PI」确认，直接纳入提交范围
  const readyLines = useMemo(
    () => cartLines.filter((l) => l.packageStatus === "READY" || (isPi && l.addedBy === currentUserId)),
    [cartLines, isPi, currentUserId],
  );

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
    toast(`当前使用 AUP：${activeAup ? `${activeAup.registerNo || `AUP#${activeAup.id}`}${activeAup.projectGroupName ? ` · ${activeAup.projectGroupName}` : ""}` : selectedAupId}`);
    setSpecSelectItem(item);
    setPickupMode("FARM");
    // 开选购 = 展开底部面板的笼位抽屉
    setCagePickerOpen(true);
  }, [orderingBlocked, timePolicy?.closedReason, selectedAupId, groupId, activeAup]);

  /**
   * 购物车「定位」：关掉购物车、就地打开笼位抽屉并聚焦那一格。
   * 与 PC `ReferenceDataManager.onLocateCage` 同一语义（就地聚焦，不是跳笼架页），
   * 差别只在移动端没有「规格面板」这一层，所以用一个 locateCageId 让抽屉独立打开。
   */
  const handleLocateCage = useCallback((cageId: string) => {
    if (!selectedAupId) {
      toast.error("请先选择 AUP");
      setAupPickerOpen(true);
      return;
    }
    setCartSheetOpen(false);
    setSpecSelectItem(null);
    setLocateCageId(cageId);
    setCagePickerOpen(true);
  }, [selectedAupId]);

  /**
   * 规格面板把「加入购物车」动作交上来：按钮画在笼位的房间那一行（照小程序），
   * 规格收起时也点得到。存 ref 不存 state —— 每次渲染面板都会重新交一次，
   * 存 state 会变成「渲染→setState→渲染」的循环。
   */
  const specConfirmRef = useRef<(() => void) | null>(null);
  const provideSpecConfirm = useCallback((fn: (() => void) | null) => {
    specConfirmRef.current = fn;
  }, []);

  const handleSpecConfirm = useCallback(async (
    entries: {
      optionLabel: string;
      qty: number;
      remark?: string;
      reservationId?: string;
      pickupRoomId?: string;
      pickupRoomName?: string;
    }[],
    pickup: OrderPickupInfo,
  ) => {
    if (!specSelectItem || !selectedAupId || !groupId) return;
    const aupId = Number(selectedAupId);
    let ok = 0;
    for (const entry of entries) {
      // 笼位路径下房间来自该行自己的笼位；非笼位路径用弹窗里选的那个房间
      const roomId = entry.pickupRoomId || pickup.pickupRoomId;
      const roomName = entry.pickupRoomName || pickup.pickupRoomName;
      // 取走没有房间，不是漏填
      if (!roomId && pickup.pickupMode !== "TAKE") {
        toast.error("请选择领用方式/房间");
        continue;
      }
      try {
        await addToCartMut.mutateAsync({
          groupId,
          body: {
            refDataId: specSelectItem.id,
            aupRecordId: aupId,
            quantity: entry.qty,
            // 无规格物品不写 spec_selections，服务端据此回退到物品自身的 price
            ...(entry.optionLabel ? { specSelections: { option: entry.optionLabel } } : {}),
            pickupRoomId: roomId || undefined,
            pickupRoomName: roomName || undefined,
            // 领用方式随行落库：取走的房间/笼位都是空，审核页与导出只能靠它分辨
            pickupMode: pickup.pickupMode,
            // 到货周期：本周期不传，预约传具体日期
            ...(pickup.deliveryCycle ? { deliveryCycle: pickup.deliveryCycle } : {}),
            ...(pickup.collectorId ? { collectorId: pickup.collectorId } : {}),
            ...(pickup.collectorName ? { collectorName: pickup.collectorName } : {}),
            ...(entry.remark ? { remark: entry.remark } : {}),
            // 一个笼位一条行：加购成功即把该笼位的预定挂到本行
            ...(entry.reservationId ? { reservationId: Number(entry.reservationId) } : {}),
            // 编辑中加购：归入这场编辑会话，放弃时一并清、保存时一并写回原单
            ...(editOrderId ? { editingOrderId: editOrderId } : {}),
          },
        });
        ok += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加入失败");
      }
    }
    if (ok > 0) { toast.success(`已加入购物车 (${ok} 项)`); void refetchCart(); }
    // 多选的盒子最后没分到老鼠 → 自动取消掉它（释放预定），别白占着
    const usedReservationIds = new Set(entries.map((e) => e.reservationId).filter(Boolean) as string[]);
    for (const c of pickedCages) {
      if (usedReservationIds.has(c.reservationId)) continue;
      try { await releaseCageReservation(c.reservationId); } catch { /* 启动清理兜底 */ }
    }
    setPickedCages([]);
    setAllocPinned({});
    setSpecSelectItem(null);
    setCagePickerOpen(false);
  }, [specSelectItem, selectedAupId, groupId, addToCartMut, refetchCart, editOrderId, pickedCages]);

  // ── 编辑模式：从订单记录页点「编辑」进入 ──
  // 编辑期间原单不动，回填行带 editing_order_id 标记；保存才写回原单，放弃只清回填行。
  const handleStartEdit = useCallback(async (orderId: number) => {
    if (editOrderId != null && editOrderId !== orderId) {
      toast.error(`请先保存或放弃对订单 #${editOrderId} 的修改`);
      return;
    }
    try {
      await loadOrderToCart(orderId);
      setEditOrderId(orderId);
      setOrderHistoryOpen(false);
      setCartSheetOpen(true);
      void refetchCart();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "回填购物车失败");
    }
  }, [editOrderId, refetchCart]);

  const handleApplyEdit = useCallback(async (): Promise<boolean> => {
    if (!editOrderId) return false;
    setEditBusy(true);
    try {
      await applyOrderEdit(editOrderId);
      toast.success("订单已保存");
      setEditOrderId(null);
      void refetchCart();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
      return false;
    } finally { setEditBusy(false); }
  }, [editOrderId, refetchCart]);

  const handleDiscardEdit = useCallback(async () => {
    if (!editOrderId) return;
    if (!await appConfirm("放弃本次编辑？\n\n购物车里回填的内容会被清除，原订单保持不变。")) return;
    setEditBusy(true);
    try {
      await discardOrderEdit(editOrderId);
      toast.success("已放弃编辑");
      setEditOrderId(null);
      void refetchCart();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "放弃编辑失败");
    } finally { setEditBusy(false); }
  }, [editOrderId, refetchCart]);

  // 退出子页拦截：正在编辑就提示；确认离开＝自动回退（清空回填行，原单不动）。
  // 关购物车不在拦截范围——那只是收起来继续选购，编辑态还在。
  const editOrderIdRef = useRef<number | null>(editOrderId);
  useEffect(() => { editOrderIdRef.current = editOrderId; }, [editOrderId]);
  useEffect(() => {
    if (!onRegisterExitGuard) return;
    onRegisterExitGuard(async () => {
      const id = editOrderIdRef.current;
      if (id == null) return true;
      if (!await appConfirm(`正在编辑订单 #${id}，离开将放弃本次修改（回填内容清空，原订单不受影响）。`)) return false;
      try {
        await discardOrderEdit(id);
        editOrderIdRef.current = null; // 已回退，别再让卸载兜底重复调一次
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "放弃编辑失败");
        return false;
      }
    });
    return () => onRegisterExitGuard(null);
  }, [onRegisterExitGuard]);

  // 兜底：非返回键的离开（浏览器返回等）也要回退，不留中间态
  useEffect(() => () => {
    const id = editOrderIdRef.current;
    if (id != null) void discardOrderEdit(id).catch(() => {});
  }, []);

  // 刷新/关标签页提醒（应用内离开由上面的退出守卫处理）
  useEffect(() => {
    if (!editOrderId) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editOrderId]);

  // 每行周期上限 + 被挤占收敛：他人提交吃掉了某 (规格, 周期) 的可用量时，本车才收敛并提示（不静默）
  const cartQuotaMax = useCartQuotaConvergence({
    lines: cartLines,
    campus,
    isPi,
    currentUserId,
    onConverge: (line, newQty) => {
      updateCartMut.mutate({ id: line.id, body: { quantity: newQty } }, { onSuccess: () => void refetchCart() });
    },
  });

  const handleCartQtyChange = useCallback((line: { id: number; addedBy: string; itemLabel?: string; specLabel?: string }, qty: number) => {
    if (!isPi && line.addedBy !== currentUserId) { toast.error("只能修改本人加购的行"); return; }
    if (qty <= 0) { removeCartMut.mutate(line.id, { onSuccess: () => void refetchCart() }); return; }
    // 周期上限闸门。天花板已扣掉他人占用、且不把本行算进去（见 useCartQuotaConvergence）；
    // 没取到（未配上限 / 端点失败）时不拦，提交时后端仍是权威校验。
    const max = cartQuotaMax.get(line.id);
    if (max != null && qty > max) {
      toast.error(`${line.specLabel || line.itemLabel} 本周期最多可订 ${max} 只`);
      return;
    }
    updateCartMut.mutate({ id: line.id, body: { quantity: qty } }, { onSuccess: () => void refetchCart() });
  }, [isPi, currentUserId, removeCartMut, updateCartMut, refetchCart, cartQuotaMax]);

  const handleClearCart = useCallback(async () => {
    if (!isPi) { toast.error("仅组长可清空共享购物车"); return; }
    if (!await appConfirm("确认清空课题组共享购物车？此操作不可撤销。")) return;
    clearCartMut.mutate(groupId, { onSuccess: () => { setCartSheetOpen(false); void refetchCart(); } });
  }, [isPi, clearCartMut, groupId, refetchCart]);

  /**
   * 清空本人「加购了但还没提交给组长」的草稿行。任何身份可用，只作用于本人的行。
   * 与 handleClearCart 是两件事：那个是组长清整个共享购物车。
   * 已提交的行（READY）不动 —— 那批已进组长待办，要撤销走「撤回 READY」。
   */
  const handleClearMyDraft = useCallback(async () => {
    if (myDraftLines.length === 0) { toast.error("没有可清空的草稿行"); return; }
    if (!await appConfirm(`确认清空本人 ${myDraftLines.length} 行未提交的草稿？此操作不可撤销。\n\n已提交给组长的订单包不受影响。`)) return;
    clearMyDraftMut.mutate(groupId, { onSuccess: () => void refetchCart() });
  }, [myDraftLines.length, clearMyDraftMut, groupId, refetchCart]);

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
    if (readyLines.length === 0) { toast.error("没有可提交的行：本人加购的行，或实验员已提交给 PI 的订单包"); return; }
    submitOrderMut.mutate(
      {
        groupId,
        submitterId: currentUserId,
        submitterName: currentUserName,
        projectGroupName: orderGroupName,
        cartIds: readyLines.map((l) => l.id),
        submitRemark: submitRemark.trim() || undefined,
        campus: campus ?? undefined,
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
  }, [orderingBlocked, timePolicy?.closedReason, isPi, readyLines, submitOrderMut, groupId, currentUserId, currentUserName, orderGroupName, submitRemark, campus, qc, refetchCart]);

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
        <ul className="space-y-2">
          {items.map((item) => {
            const purchasable = (item.fieldData as Record<string, unknown>)?.purchasable === true;
            const hasChildren = (item.childCount ?? 0) > 0;
            const canDrill = !!typeConfig?.childType && hasChildren;
            const lines = refCardLines(item);
            const priceText = refCardPrice(item);
            const quotaSegments = specQuotaLine(item, specRowsOf(item, templates), specQuotaByKey);
            const imageUrl = fieldVal(item, "imageUrl");
            const cover = imageUrl ? webImageSrc(imageUrl) : null;
            return (
              <li
                key={item.id}
                /* 一个物品一张卡：白底 + 投影 + 圆角 + 卡间距（照小程序 .goods），不再挤在一个带分隔线的长条里 */
                className={cn(
                  "flex gap-2 rounded-[var(--student-radius-md)] bg-[var(--student-surface)] p-3 shadow-[0_2px_7px_rgba(15,23,42,0.06)]",
                  canDrill && "active:bg-[var(--student-canvas-soft)]",
                )}
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
                <div className="min-w-0 flex-1 py-0.5">
                  {/* 主标题 + 副标题同排；描述单独一行 */}
                  <p className="truncate text-[13px] font-semibold leading-snug text-[var(--student-ink)]">
                    {lines[0] || `ID ${item.id}`}
                    {lines[1] && (
                      <span className="ml-1.5 text-[11px] font-normal text-[var(--student-mute)]">{lines[1]}</span>
                    )}
                  </p>
                  {lines[2] && <p className="mt-0.5 break-words text-[11px] text-[var(--student-mute)]">{lines[2]}</p>}
                  {/* 价格与操作控件同一行：控件不再绝对定位，既不抢文本宽度也不独占一行 */}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className={cn("text-[11px] tabular-nums", priceText ? "font-bold text-[var(--student-primary)]" : "font-medium text-[var(--student-mute)]")}>
                      {priceText || "待定"}
                    </p>
                    <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {purchasable && (
                      <button
                        type="button"
                        disabled={orderingBlocked}
                        onClick={() => handleAddToCart(item)}
                        className="relative shrink-0 rounded-full bg-[var(--student-canvas-soft)] px-2.5 py-1 text-xs font-medium text-[var(--student-ink)] disabled:opacity-50"
                      >
                        选择规格
                        {(qtyByRefDataId.get(item.id) || 0) > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--student-danger)] px-0.5 text-[10px] font-bold text-white">
                            {qtyByRefDataId.get(item.id)}
                          </span>
                        )}
                      </button>
                    )}
                      {canDrill && <ChevronRight className="size-4 text-[var(--student-mute)]" />}
                    </div>
                  </div>
                  {quotaSegments.length > 0 && (
                    <div className="mt-0.5 truncate text-[11px] tabular-nums">
                      {quotaSegments.map((s, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-[var(--student-mute)]"> · </span>}
                          <span className={s.unconfigured ? "text-[var(--student-mute)]" : "text-[var(--student-body)]"}>{s.text}</span>
                        </span>
                      ))}
                    </div>
                  )}
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
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
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
                /* 与小程序同款：一块圆角条目，选中=实心主色 + 投影（原来只有一条 2px 左边框，没立体感） */
                className={cn(
                  "mb-1 block w-full rounded-[var(--student-radius-sm)] px-2 py-2 text-left text-[11px] leading-snug transition-colors",
                  active ? "ao-side-item-on font-semibold" : "text-[var(--student-body)] hover:bg-[var(--student-surface)]",
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

  if (!campus) {
    return (
      <div className="h-full bg-[var(--student-canvas)]">
        <CampusGate
          onSelect={(c) => {
            storeCampus(c);
            setCampus(c);
          }}
        />
      </div>
    );
  }

  return (
    <div className="animal-order-scope flex h-full min-h-0 flex-col bg-[var(--student-canvas)]">
      {/* 加购上下文：校区 + AUP 合成一条紧凑栏，各自点开面板（订单入口只保留底部购物车旁那一个） */}
      <div className="shrink-0 border-b border-[var(--student-hairline)] bg-[var(--student-surface)] px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCampusSheetOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-1.5 text-xs font-medium text-[var(--student-ink)] active:opacity-70"
          >
            <MapPin className="size-3.5 text-[var(--student-primary)]" />
            {campus ? `${campus}校区` : "选择校区"}
            <ChevronDown className="size-3 opacity-60" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (approvedAups.length === 0) { toast.error("本课题组暂无已批准的 AUP 计划书"); return; }
              setAupPickerOpen(true);
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium active:opacity-70",
              activeAup ? "border-sky-200 bg-sky-50 text-[var(--student-ink)]" : "border-amber-200 bg-amber-50 text-amber-800",
            )}
          >
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-sky-600">AUP</span>
            <span className="min-w-0 flex-1 truncate text-left">
              {activeAup ? activeAup.registerNo : "未选择 AUP（必选）"}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </button>
        </div>

        {orderingBlocked && timePolicy && (
          <div className="mt-1.5 rounded-[var(--student-radius-sm)] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            {timePolicy.closedReason}
            {timePolicy.nextOpenAt && (
              <span className="ml-1">下次开放：{formatDateTimeAsiaShanghaiMinute(timePolicy.nextOpenAt)}</span>
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

      {/* 列表：下钻 + 侧边栏。直接挂在根 flex-col 下——中间夹任何非 flex 层都会让 flex-1 高度失效、右侧滚不动 */}
      {drillStack.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-24 pt-2">{cardContent}</div>
      ) : (
        <SplitSidebarScrollLayout
          sidebarClassName="flex w-24 shrink-0 flex-col border-r border-[var(--student-hairline)] bg-[var(--student-canvas-soft)]"
          contentClassName="px-2 pt-1.5 pb-24"
          sidebar={sidebarRail}
        >
          {cardContent}
        </SplitSidebarScrollLayout>
      )}

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
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--student-hairline)] px-4 py-3">
              <p className="min-w-0 truncate text-sm font-bold text-[var(--student-ink)]">购物车 · {cartCount} 件</p>
              <div className="flex shrink-0 items-center gap-2">
                {/* 分组视角切换器放在标题行（原先埋在列表顶部）。**不再判 isPi** —— 与小程序一致：
                    分组只是看法、不涉及权限；判身份会让非组长账号永远看不到这个控件 */}
                {cartLines.length > 0 && (
                  <CartTreeModeToggle mode={cartTreeMode} onChange={setCartTreeMode} mobile />
                )}
                <button type="button" onClick={() => setCartSheetOpen(false)} className="flex size-8 items-center justify-center rounded-[var(--student-radius-sm)] text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)]">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {orderingBlocked && timePolicy && (
              <div className="mx-3 mt-2 rounded-[var(--student-radius-sm)] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                {timePolicy.closedReason}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <CartTree
                layout="mobile"
                lines={cartLines}
                isPi={isPi}
                currentUserId={currentUserId}
                onQtyChange={handleCartQtyChange}
                mode={cartTreeMode}
                onModeChange={setCartTreeMode}
                hideModeToggle
                currentCycle={currentCycle}
                /* 购物车定位 = 就地打开笼位抽屉并聚焦那一格；跳笼架页那种是审核页面的定位 */
                onLocateCage={handleLocateCage}
              />
            </div>

            {/* 实时总金额：只统计已定价的行 */}
            {cartTotalAmount != null && (
              <div className="shrink-0 flex items-center justify-between border-t border-[var(--student-hairline)] px-4 py-2">
                <span className="text-xs text-[var(--student-mute)]">合计金额</span>
                <span className="text-sm font-bold text-sky-700">¥{cartTotalAmount.toFixed(2)}</span>
              </div>
            )}

            {/* 包备注对所有人开放；PI 的备注在下单时快照成订单行备注 */}
            <div className="flex shrink-0 items-center gap-2 border-t border-[var(--student-hairline)] px-3 py-2.5">
                <input
                  type="text"
                  placeholder={isPi ? "备注（写给你自己加购的行）" : "订单包统一备注"}
                  value={packageRemark}
                  onChange={(e) => setPackageRemark(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-[var(--student-hairline)] bg-white px-2.5 py-1.5 text-xs outline-none"
                />
                {myDraftLines.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearMyDraft}
                    disabled={orderingBlocked || clearMyDraftMut.isPending}
                    title="只删本人加购、还没提交给组长的行；已提交的不动"
                    className="shrink-0 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--student-error)] disabled:opacity-50"
                  >
                    清空草稿
                  </button>
                )}
                {myReadyLines.length > 0 && (
                  <button
                    type="button"
                    onClick={handleWithdrawPackage}
                    disabled={withdrawMut.isPending}
                    className="shrink-0 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--student-body)] disabled:opacity-50"
                  >
                    撤回
                  </button>
                )}
                <button
                  type="button"
                  disabled={orderingBlocked || myDraftLines.length === 0 || markReadyMut.isPending}
                  onClick={handleMarkPackageReady}
                  className="shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-success)] px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {markReadyMut.isPending ? "提交中…" : isPi ? `保存备注 (${myDraftLines.length})` : "提交给 PI"}
                </button>
              </div>

            {/* 编辑模式横幅：保存/放弃统一在这里，且禁掉另开新单，避免留下中间态 */}
            {editOrderId != null && (
              <div className="shrink-0 border-t border-sky-200 bg-sky-50 px-3 py-2">
                <div className="text-xs font-semibold text-sky-900">正在编辑订单 #{editOrderId}</div>
                <div className="mt-0.5 text-[11px] text-sky-800/80">
                  改完点「保存」写回原单（单号不变）；点「放弃」清空回填内容，原单不受影响。
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" disabled={editBusy} onClick={() => void handleDiscardEdit()} className="rounded-full border border-sky-300 px-3 py-1 text-[11px] text-sky-800 disabled:opacity-50">放弃编辑</button>
                  <button type="button" disabled={editBusy} onClick={() => void handleApplyEdit()} className="rounded-full bg-sky-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50">{editBusy ? "保存中…" : "保存"}</button>
                </div>
              </div>
            )}

            {/* PI：正式提交。两个按钮按内容宽度靠右并排，不再一左一右拉开 */}
            {isPi && (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--student-hairline)] px-4 py-3">
                <button
                  type="button"
                  disabled={cartCount === 0 || editOrderId != null}
                  onClick={handleClearCart}
                  className="shrink-0 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--student-body)] disabled:opacity-50"
                >
                  清空全组
                </button>
                <button
                  type="button"
                  disabled={orderingBlocked || submitOrderMut.isPending || readyLines.length === 0 || editOrderId != null}
                  onClick={() => setSubmitConfirmOpen(true)}
                  title={editOrderId != null ? "编辑模式下请用上方「保存」写回原单，不能另开新单" : undefined}
                  className="shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--student-primary-foreground)] disabled:opacity-50"
                >
                  {submitOrderMut.isPending ? "提交中…" : editOrderId != null ? "编辑中（用上方保存）" : `正式提交 (${readyLines.length})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 校区选择 Sheet */}
      {campusSheetOpen && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/35" onClick={() => setCampusSheetOpen(false)} aria-hidden />
          <div className="relative flex flex-col overflow-hidden rounded-t-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--student-hairline)] px-4 py-3">
              <p className="text-base font-bold text-[var(--student-ink)]">选择校区</p>
              <button type="button" onClick={() => setCampusSheetOpen(false)} className="flex size-8 items-center justify-center rounded-[var(--student-radius-sm)] text-[var(--student-mute)]">
                <X className="size-4" />
              </button>
            </div>
            <p className="px-4 pt-2 text-[11px] text-[var(--student-mute)]">可购时间、预计送达与订单归属均按校区区分</p>
            <div className="px-3 pb-3 pt-2">
              {ANIMAL_ORDER_CAMPUSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { storeCampus(c); setCampus(c); setCampusSheetOpen(false); }}
                  className={cn(
                    "mb-2 flex w-full items-center gap-2 rounded-[var(--student-radius-sm)] border px-3 py-2.5 text-left text-sm",
                    campus === c
                      ? "border-[var(--student-primary)] bg-[color-mix(in_srgb,var(--student-primary)_10%,transparent)] font-semibold text-[var(--student-ink)]"
                      : "border-[var(--student-hairline)] text-[var(--student-body)]",
                  )}
                >
                  <MapPin className="size-4 shrink-0 text-[var(--student-primary)]" />
                  {c}校区
                  {campus === c && <Check className="ml-auto size-4 text-[var(--student-primary)]" />}
                </button>
              ))}
            </div>
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
            <div className="mb-2 text-xs text-[var(--student-mute)]">将提交 {readyLines.length} 行（本人加购的行 + 实验员已提交给 PI 的订单包），生成一张订单进入审批。</div>
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
      <MobileOrderRecordsView onEdit={(id) => void handleStartEdit(id)} />
        </div>
      )}

      {/* 选笼位底部面板：摘要条 + 规格面板 + 笼位抽屉同处一列（不 portal，令牌只在 shell 作用域内生效） */}
      {(specSelectItem || locateCageId) && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end">
          {/* 点遮罩 = 退出选购（规格不再能折叠，没有「先收起再关」那一级了） */}
          <div
            className="absolute inset-0 bg-black/35"
            onClick={() => void exitCageSession()}
            aria-hidden
          />
          <div
            className="relative flex h-[92vh] min-h-0 flex-col overflow-hidden rounded-t-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            {/* 1. 标题行：品系 · 规格（含已选规格选项）+ 分配进度 + 关闭。
                   原来这行是「选择笼位 · 未填数量」，而规格型号在下面的面板标题里，
                   两行说的是同一件事 —— 现在只剩这一行，也不再有展开/收起 */}
            {specSelectItem && (
            <div
              className={cn(
                "flex shrink-0 items-center gap-2 border-b border-[var(--student-hairline)] px-3 py-2",
                allocatedTotal(cageAlloc.alloc) !== cageSpecCtx.quantity
                  ? "bg-amber-50 text-amber-800"
                  : "text-[var(--student-ink)]",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                {[
                  drillStack.length > 0 ? drillStack[drillStack.length - 1].label : "",
                  fieldVal(specSelectItem, "title") || `ID ${specSelectItem.id}`,
                  cageSpecCtx.specOptionLabel,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums opacity-80">
                已选 {pickedCages.length} 笼 · 已分配 {allocatedTotal(cageAlloc.alloc)}/{cageSpecCtx.quantity}
              </span>
              {/* 「分配」= 开分配浮层（笼位网格不卸载）；分配不齐时整行已经变琥珀色。
                  选了笼位又填了总数才有得调，否则进去是空列表 —— 与小程序同一个门槛 */}
              {pickedCages.length > 0 && cageSpecCtx.quantity > 0 && (
                <button
                  type="button"
                  onClick={() => setOpenAllocTick((n) => n + 1)}
                  className="shrink-0 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-2.5 py-1 text-xs font-medium text-[var(--student-ink)] active:opacity-70"
                >
                  分配
                </button>
              )}
              <button
                type="button"
                onClick={() => void exitCageSession()}
                aria-label="关闭选购"
                className="flex size-7 shrink-0 items-center justify-center rounded-[var(--student-radius-sm)] text-[var(--student-mute)]"
              >
                <X className="size-4" />
              </button>
            </div>
            )}

            {/* 2. 规格面板（标题已在上面那一行，面板自己不再重复画标题） */}
            {specSelectItem && (
              <SpecSelectPanel
                mobileShell
                item={specSelectItem}
                parentLabel={drillStack.length > 0 ? drillStack[drillStack.length - 1].label : undefined}
                onConfirm={handleSpecConfirm}
                onClose={() => void exitCageSession()}
                orderingBlocked={orderingBlocked}
                groupNames={effectiveGroupNames}
                selfUserId={currentUserId}
                selfUserName={currentUserName}
                aupRecordId={selectedAupId}
                pickedCages={pickedCages}
                allocByCageId={cageAlloc.alloc}
                maxQuantityPerCage={maxQuantityPerCage}
                onCageContextChange={handleCageContextChange}
                onProvideConfirm={provideSpecConfirm}
                pickupMode={pickupMode}
                onPickupModeChange={handlePickupModeChange}
                campus={campus ?? undefined}
                categoryKey={breedCategoryKey}
              />
            )}

            {/* 取走没有笼位抽屉，提交按钮画在规格面板下面 */}
            {pickupMode === "TAKE" && specSelectItem && (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--student-hairline)] px-3 py-2">
                <button
                  type="button"
                  className="rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--student-body)]"
                  onClick={() => void exitCageSession()}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={orderingBlocked}
                  className="rounded-[var(--student-radius-sm)] bg-[var(--student-success)] px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => specConfirmRef.current?.()}
                >
                  加入购物车
                </button>
              </div>
            )}

            {/* 3. 笼位抽屉 */}
            {cagePickerOpen && selectedAupId && (
              <MobileCagePickerSheet
                aupRecordId={selectedAupId}
                campus={campus}
                specOptionLabel={cageSpecCtx.specOptionLabel}
                quantity={cageSpecCtx.quantity}
                pickedCages={pickedCages}
                onPickedCagesChange={setPickedCages}
                alloc={cageAlloc.alloc}
                allocPinned={allocPinned}
                onAllocPinnedChange={setAllocPinned}
                onMaxQuantityChange={setMaxQuantityPerCage}
                onClose={() => void exitCageSession()}
                focusCageId={locateCageId}
                onSubmit={() => specConfirmRef.current?.()}
                submitDisabled={orderingBlocked}
                openAllocTick={openAllocTick}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
