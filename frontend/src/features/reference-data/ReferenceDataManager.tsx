import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams, useBlocker } from "react-router-dom";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/hooks/queryKeys";
import {
  useRefDataList,
  useSpecTemplates,
  useRefCart,
  useCreateRefData,
  useUpdateRefData,
  useDeleteRefData,
  useAddToCart,
  useUpdateCartItem,
  useRemoveCartItem,
  useClearCart,
  useSubmitOrder,
  useApprovedAups,
  useMarkCartPackageReady,
  useWithdrawCartPackage,
} from "@/api/hooks/useReferenceData";
import { useAnimalOrderTimePolicy } from "@/api/hooks/useAnimalOrderTime";
import {
  resolveSharedCartGroupId,
  resolveOrderGroupName,
  splitGroupNames,
  type RefCartItem,
  type RefDataItem,
  applyOrderEdit,
  discardOrderEdit,
} from "@/api/domains/referenceData.api";
import { authStorage } from "@/features/auth/authStorage";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";
import { hasMinRole } from "@/features/auth/roleAccess";
import { useAupMyRoles } from "@/features/aup/hooks/useAup";
import {
  getTypeConfig,
  getAllTypeConfigs,
  type ReferenceTypeConfig,
} from "./typeRegistry";
import CardGrid from "./CardGrid";
import BreadcrumbBar from "./BreadcrumbBar";
import EditModal from "./EditModal";
import SpecSelectPanel, { type OrderPickupInfo } from "./SpecSelectPanel";
import SpecTemplateManager from "./SpecTemplateManager";
import OrderTimeManager from "./OrderTimeManager";
import OrderHistoryPanel from "./OrderHistoryPanel";
import CampusGate from "./CampusGate";
import { ANIMAL_ORDER_CAMPUSES, readStoredCampus, storeCampus, type AnimalOrderCampus } from "./campus";
import type { CartLine } from "./CartDrawer";
import CartTree from "./CartTree";

import { appConfirm } from "@/lib/appDialog";
interface DrillSegment {
  id: number;
  label: string;
  typeKey: string;
}

interface ReferenceDataManagerProps {
  mode: "admin" | "console" | "student";
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

export default function ReferenceDataManager({ mode }: ReferenceDataManagerProps) {
  const [activeTypeKey, setActiveTypeKey] = useState("SUPPLIER");
  const [drillStack, setDrillStack] = useState<DrillSegment[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [editModal, setEditModal] = useState<{ mode: "create" | "edit"; item?: RefDataItem } | null>(null);
  const [specSelectItem, setSpecSelectItem] = useState<RefDataItem | null>(null);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [timeManagerOpen, setTimeManagerOpen] = useState(false);
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [aupPickerOpen, setAupPickerOpen] = useState(false);
  const [selectedAupId, setSelectedAupId] = useState<string>(() => {
    try { return localStorage.getItem("ref_active_aup") || ""; } catch { return ""; }
  });
  const [packageRemark, setPackageRemark] = useState("");
  const [submitRemark, setSubmitRemark] = useState("");
  const [itemLabelMap, setItemLabelMap] = useState<Record<number, string>>({});
  // 校区：首次进入强制选择，之后记住并可在顶栏切换
  const [campus, setCampus] = useState<AnimalOrderCampus | null>(() => readStoredCampus());

  const role = authStorage.getRole() || "MEMBER";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userInfo = authStorage.getUserInfo();
  const currentUserName = userInfo?.displayName?.trim() || userInfo?.username?.trim() || userInfo?.id?.trim() || "";
  const currentUserId = userInfo?.id?.trim() || "";
  const projectGroupName = userInfo?.projectGroupName?.trim() || "";
  const { data: approvedAups = [] } = useApprovedAups();
  const { data: myRoles } = useAupMyRoles();
  const isPi = !!myRoles?.isPi;
  const isAdmin = mode === "admin" && hasMinRole(role, "SUPER_ADMIN");
  const currentParentId = drillStack.length > 0 ? drillStack[drillStack.length - 1].id : undefined;

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

  const typeConfig = getTypeConfig(activeTypeKey);
  const allTypes = getAllTypeConfigs();

  // 本人课题组名（userInfo.projectGroupName 可能是多组拼接串，必须拆开）
  const myGroupNames = useMemo(() => splitGroupNames(projectGroupName), [projectGroupName]);

  // 下单归属课题组名：多课题组账号取所选 AUP 的课题组（单值），否则与同组其他人的口径对不上
  const orderGroupName = useMemo(
    () => resolveOrderGroupName(approvedAups, selectedAupId, myGroupNames),
    [approvedAups, selectedAupId, myGroupNames],
  );

  // 共享购物车 key 走课题组名，不用 project_group.id —— 该表同名多行（3105 行 / 98 个组名），
  // 同组不同账号可能解析到不同 id，反倒把同组人拆进不同购物车。
  const groupId = useMemo(() => resolveSharedCartGroupId(null, orderGroupName), [orderGroupName]);

  // 领用人候选范围：本人课题组（缺失时回退 AUP 课题组；仍为空则选购弹窗禁用领用人选择）
  const effectiveGroupNames = useMemo(
    () => (myGroupNames.length ? myGroupNames : orderGroupName ? [orderGroupName] : []),
    [myGroupNames, orderGroupName],
  );

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

  // 丢弃旧个人 localStorage 车，避免与共享车并存
  useEffect(() => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("ref_cart_") && !k.startsWith("ref_cart_pg-")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }, []);

  const { data: items = [], isLoading, isError, error } = useRefDataList(activeTypeKey, currentParentId);
  const { data: parentListItems = [] } = useRefDataList(typeConfig?.parentType ?? "", undefined);
  const { data: templates = [] } = useSpecTemplates();
  const { data: serverCartItems = [], refetch: refetchCart } = useRefCart(groupId);

  // ── 编辑模式：由订单记录页带 ?editOrder={id} 跳进来 ──
  // 编辑期间原单不动，回填行带 editing_order_id 标记；保存才写回原单，放弃只清回填行。
  const editingOrderId = useMemo(() => {
    const raw = searchParams.get("editOrder");
    const n = Number(raw);
    return raw && Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);
  const [editActive, setEditActive] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [pendingExit, setPendingExit] = useState(false);

  useEffect(() => {
    setEditActive(!!editingOrderId);
    if (editingOrderId) {
      // 进入编辑：自动打开购物车并刷新，让用户直接看到回填结果
      setCartSheetOpen(true);
      void refetchCart();
    }
  }, [editingOrderId, refetchCart]);

  const exitEdit = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("editOrder");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // 保存/放弃后：先解除编辑态再跳回记录页，避免自己的离开拦截把自己挡住
  useEffect(() => {
    if (pendingExit && !editActive) {
      setPendingExit(false);
      navigate(mode === "student" ? "/student/animal-order/records" : "/console/admin/animal-order-review");
    }
  }, [pendingExit, editActive, navigate, mode]);

  const handleApplyEdit = useCallback(async () => {
    if (!editingOrderId) return;
    setEditBusy(true);
    try {
      await applyOrderEdit(editingOrderId);
      toast.success("订单已保存");
      setPendingExit(true);
      exitEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally { setEditBusy(false); }
  }, [editingOrderId, exitEdit]);

  const handleDiscardEdit = useCallback(async () => {
    if (!editingOrderId) return;
    if (!await appConfirm("放弃本次编辑？\n\n购物车里回填的内容会被清除，原订单保持不变。")) return;
    setEditBusy(true);
    try {
      await discardOrderEdit(editingOrderId);
      toast.success("已放弃编辑");
      setPendingExit(true);
      exitEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "放弃编辑失败");
    } finally { setEditBusy(false); }
  }, [editingOrderId, exitEdit]);

  // 离开拦截：编辑中切路由先确认（回填行带标记，回来再点编辑可原样恢复）
  const blocker = useBlocker(editActive);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void (async () => {
      const leave = await appConfirm("订单还在编辑中，尚未保存。\n\n离开不会改动原订单，购物车里的回填内容保留；回来点「编辑」可继续。\n\n确定离开？");
      if (leave) blocker.proceed(); else blocker.reset();
    })();
  }, [blocker]);

  // 刷新/关标签页同样提醒
  useEffect(() => {
    if (!editActive) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editActive]);

  const sidebarParentType = typeConfig?.parentType;
  const sidebarParentId = drillStack.length >= 2 ? drillStack[drillStack.length - 2].id : undefined;
  const { data: sidebarItems = [] } = useRefDataList(sidebarParentType ?? "", sidebarParentId);

  const createMut = useCreateRefData();
  const updateMut = useUpdateRefData();
  const deleteMut = useDeleteRefData();
  const addToCartMut = useAddToCart();
  const updateCartMut = useUpdateCartItem();
  const removeCartMut = useRemoveCartItem();
  const clearCartMut = useClearCart();
  const submitOrderMut = useSubmitOrder();
  const markReadyMut = useMarkCartPackageReady();
  const withdrawMut = useWithdrawCartPackage();
  const qc = useQueryClient();

  const activeAup = useMemo(
    () => approvedAups.find((a) => String(a.id) === String(selectedAupId)) || null,
    [approvedAups, selectedAupId],
  );

  const aupLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of approvedAups) m.set(String(a.id), a.registerNo);
    return m;
  }, [approvedAups]);

  const filteredItems = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((item) => {
      const fd = item.fieldData ?? {};
      for (const key of Object.keys(fd)) {
        if (String(fd[key] ?? "").toLowerCase().includes(kw)) return true;
      }
      return String(item.id).includes(kw);
    });
  }, [items, searchKeyword]);

  const cartLines = useMemo((): CartLine[] => {
    return (serverCartItems || []).map((ci: RefCartItem) => {
      const specLabel = parseSpecLabel(ci.specSelections);
      const addedByName = (ci.addedByName || "").trim();
      return {
        id: ci.id,
        key: String(ci.id),
        itemId: ci.refDataId,
        itemLabel: (ci.refDataLabel || "").trim() || itemLabelMap[ci.refDataId] || `ID ${ci.refDataId}`,
        specLabel,
        qty: ci.quantity || 0,
        unitPrice: ci.unitPrice ?? null,
        lineAmount: ci.lineAmount ?? null,
        pickupRoomName: ci.pickupRoomName ?? null,
        collectorName: ci.collectorName ?? null,
        aupRecordId: ci.aupRecordId,
        aupLabel: ci.aupRecordId != null ? (aupLabelById.get(String(ci.aupRecordId)) || `AUP#${ci.aupRecordId}`) : "未归属",
        packageStatus: ci.packageStatus || "DRAFT",
        packageRemark: ci.packageRemark,
        addedBy: ci.addedBy,
        // 展示名以后端 addedByName 为准；仅当为空时回退本人会话名 / 原始 id
        addedByLabel: addedByName || (ci.addedBy === currentUserId ? currentUserName : "") || ci.addedBy || "",
      };
    });
  }, [serverCartItems, itemLabelMap, aupLabelById, currentUserId, currentUserName]);

  const cartCount = useMemo(() => cartLines.reduce((s, l) => s + l.qty, 0), [cartLines]);

  // 购物车实时总金额：只累加已定价的行；全车无定价时保持 null（显示「—」而非 0）
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

  // 本次提交的总金额（只算 readyLines），与购物车整车的合计区分开
  const readyTotalAmount = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const l of readyLines) {
      if (l.lineAmount == null) continue;
      any = true;
      sum += l.lineAmount;
    }
    return any ? sum : null;
  }, [readyLines]);

  const availableTypes = useMemo((): ReferenceTypeConfig[] => {
    if (drillStack.length > 0) return typeConfig ? [typeConfig] : [];
    return allTypes.filter((t) => !t.parentType);
  }, [drillStack, typeConfig, allTypes]);

  // ── Navigation ──

  const handleDrillDown = useCallback((item: RefDataItem) => {
    if (!typeConfig?.childType) return;
    const childConfig = getTypeConfig(typeConfig.childType);
    if (!childConfig) return;
    const fd = item.fieldData as Record<string, unknown> | undefined;
    const label = String(fd?.title || fd?.subtitle || `ID ${item.id}`);
    setDrillStack((prev) => [...prev, { id: item.id, label, typeKey: activeTypeKey }]);
    setActiveTypeKey(typeConfig.childType);
  }, [typeConfig, activeTypeKey]);

  const breadcrumbStack: DrillSegment[] = useMemo(() => {
    if (!typeConfig || drillStack.length === 0) return [];
    return drillStack;
  }, [typeConfig, drillStack]);

  const handleBreadcrumbNavigate = useCallback((index: number) => {
    if (drillStack.length === 0 || index < 0) {
      setDrillStack([]);
      const rootTypes = allTypes.filter((t) => !t.parentType);
      if (rootTypes.length > 0) setActiveTypeKey(rootTypes[0].typeKey);
      return;
    }
    const keepStack = drillStack.slice(0, index + 1);
    setDrillStack(keepStack);
    const lastSeg = keepStack[keepStack.length - 1];
    const lastConfig = getTypeConfig(lastSeg.typeKey);
    if (lastConfig?.childType) setActiveTypeKey(lastConfig.childType);
  }, [drillStack, allTypes]);

  const handleGoBack = useCallback(() => {
    if (drillStack.length === 0) return;
    const newStack = drillStack.slice(0, -1);
    setDrillStack(newStack);
    if (newStack.length === 0) {
      const rootTypes = allTypes.filter((t) => !t.parentType);
      if (rootTypes.length > 0) setActiveTypeKey(rootTypes[0].typeKey);
    } else {
      const lastSeg = newStack[newStack.length - 1];
      const lastConfig = getTypeConfig(lastSeg.typeKey);
      if (lastConfig?.childType) setActiveTypeKey(lastConfig.childType);
    }
  }, [drillStack, allTypes]);

  const handleSidebarSwitch = useCallback((item: RefDataItem) => {
    if (drillStack.length === 0) return;
    const fd = item.fieldData as Record<string, unknown> | undefined;
    setDrillStack([
      ...drillStack.slice(0, -1),
      { id: item.id, label: String(fd?.title || fd?.subtitle || `ID ${item.id}`), typeKey: drillStack[drillStack.length - 1].typeKey },
    ]);
  }, [drillStack]);

  const handleTypeSwitch = useCallback((typeKey: string) => {
    setActiveTypeKey(typeKey);
    setDrillStack([]);
  }, []);

  // ── CRUD ──

  const handleOpenCreate = useCallback(() => setEditModal({ mode: "create" }), []);
  const handleOpenEdit = useCallback((item: RefDataItem) => setEditModal({ mode: "edit", item }), []);

  const handleSave = useCallback((body: Record<string, unknown>) => {
    if (editModal?.mode === "create" && currentParentId != null && !body.parentId) {
      body.parentId = currentParentId;
    }
    if (editModal?.mode === "create") {
      createMut.mutate({ typeKey: activeTypeKey, body }, { onSuccess: () => setEditModal(null) });
    } else if (editModal?.mode === "edit" && editModal.item) {
      updateMut.mutate({ typeKey: activeTypeKey, id: editModal.item.id, body }, { onSuccess: () => setEditModal(null) });
    }
  }, [editModal, activeTypeKey, createMut, updateMut, currentParentId]);

  const handleDelete = useCallback(async (item: RefDataItem) => {
    if (!await appConfirm(`确认删除 "${item.fieldData?.title || `ID ${item.id}`}"？`)) return;
    deleteMut.mutate({ typeKey: activeTypeKey, id: item.id });
  }, [activeTypeKey, deleteMut]);

  // ── Cart ──

  const handleAddToCart = useCallback((item: RefDataItem) => {
    if (orderingBlocked) {
      toast.error(timePolicy?.closedReason ?? "当前不可购");
      return;
    }
    if (!selectedAupId) {
      toast.error("请先选择 AUP");
      setAupPickerOpen(true);
      return;
    }
    if (!groupId) {
      toast.error("无法确定课题组共享购物车，请确认已加入课题组");
      return;
    }
    const title = String((item.fieldData as Record<string, unknown>)?.title || `ID ${item.id}`);
    setItemLabelMap((prev) => ({ ...prev, [item.id]: title }));
    setSpecSelectItem(item);
  }, [orderingBlocked, timePolicy?.closedReason, selectedAupId, groupId]);

  const handleSpecConfirm = useCallback(async (
    entries: { optionLabel: string; qty: number }[],
    pickup: OrderPickupInfo,
  ) => {
    if (orderingBlocked) {
      toast.error(timePolicy?.closedReason ?? "当前不可购");
      return;
    }
    if (!specSelectItem || !selectedAupId || !groupId) return;
    if (!pickup.pickupRoomId) {
      toast.error("请选择领用方式/房间");
      return;
    }
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
            // 无规格物品不写 spec_selections，服务端据此回退到物品自身的 price
            ...(entry.optionLabel ? { specSelections: { option: entry.optionLabel } } : {}),
            pickupRoomId: pickup.pickupRoomId,
            pickupRoomName: pickup.pickupRoomName,
            ...(pickup.collectorId ? { collectorId: pickup.collectorId } : {}),
            ...(pickup.collectorName ? { collectorName: pickup.collectorName } : {}),
          },
        });
        ok += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "加入失败";
        if (msg.includes("请先选择 AUP")) toast.error("请先选择 AUP");
        else if (msg.includes("不符合当前AUP") || msg.includes("不符合当前")) toast.error("不符合当前AUP");
        else toast.error(msg);
      }
    }
    if (ok > 0) {
      toast.success(`已加入购物车 (${ok} 项)`);
      void refetchCart();
    }
    setSpecSelectItem(null);
  }, [orderingBlocked, timePolicy?.closedReason, specSelectItem, selectedAupId, groupId, addToCartMut, refetchCart]);

  const handleCartQtyChange = useCallback((line: CartLine, qty: number) => {
    if (!isPi && line.addedBy !== currentUserId) {
      toast.error("只能修改本人加购的行");
      return;
    }
    if (qty <= 0) {
      removeCartMut.mutate(line.id, { onSuccess: () => void refetchCart() });
      return;
    }
    updateCartMut.mutate({ id: line.id, body: { quantity: qty } }, { onSuccess: () => void refetchCart() });
  }, [isPi, currentUserId, removeCartMut, updateCartMut, refetchCart]);

  const handleClearCart = useCallback(async () => {
    if (!isPi) {
      toast.error("仅组长可清空共享购物车");
      return;
    }
    if (!await appConfirm("确认清空课题组共享购物车？此操作不可撤销。")) return;
    clearCartMut.mutate(groupId, {
      onSuccess: () => {
        setCartSheetOpen(false);
        void refetchCart();
      },
    });
  }, [isPi, clearCartMut, groupId, refetchCart]);

  const handleMarkPackageReady = useCallback(() => {
    if (orderingBlocked) {
      toast.error(timePolicy?.closedReason ?? "当前不可购");
      return;
    }
    if (myDraftLines.length === 0) {
      toast.error("没有可提交的草稿行");
      return;
    }
    markReadyMut.mutate(
      { groupId, body: { packageRemark: packageRemark.trim() || undefined } },
      {
        onSuccess: () => {
          setPackageRemark("");
          void refetchCart();
        },
      },
    );
  }, [orderingBlocked, timePolicy?.closedReason, myDraftLines.length, markReadyMut, groupId, packageRemark, refetchCart]);

  const handleWithdrawPackage = useCallback(() => {
    if (myReadyLines.length === 0) return;
    withdrawMut.mutate({ groupId }, { onSuccess: () => void refetchCart() });
  }, [myReadyLines.length, withdrawMut, groupId, refetchCart]);

  const handleSubmitOrder = useCallback(() => {
    if (orderingBlocked) {
      toast.error(timePolicy?.closedReason ?? "当前不可购");
      return;
    }
    if (!isPi) {
      toast.error("仅组长可正式提交申领单");
      return;
    }
    if (readyLines.length === 0) {
      toast.error("没有可提交的行：本人加购的行，或实验员已提交给 PI 的订单包");
      return;
    }
    submitOrderMut.mutate(
      {
        groupId,
        submitterId: currentUserId,
        submitterName: currentUserName,
        // 与购物车 groupId 同源：取所选 AUP 的课题组名（单值）。服务端也会自行校验归属。
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

  const parentOptionItems = useMemo(() => {
    if (!typeConfig?.parentType) return [];
    return parentListItems.map((po) => {
      const fd = po.fieldData as Record<string, unknown> | undefined;
      return { id: po.id, label: String(fd?.title || fd?.subtitle || `ID ${po.id}`) };
    });
  }, [typeConfig?.parentType, parentListItems]);

  if (!typeConfig) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-[var(--twin-mute)]">
        未知数据类型: {activeTypeKey}
      </div>
    );
  }

  if (!campus) {
    return (
      <CampusGate
        onSelect={(c) => {
          storeCampus(c);
          setCampus(c);
        }}
      />
    );
  }

  const chromeOffset =
    mode === "student" ? "var(--student-chrome-offset, 64px)" : "var(--admin-chrome-offset)";

  const aupIsland = createPortal(
    <button
      type="button"
      onClick={() => setAupPickerOpen(true)}
      className="pointer-events-auto fixed left-1/2 z-[var(--z-overlay)] flex max-w-[min(92vw,28rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-sky-200/90 bg-sky-50/95 px-3.5 py-1.5 text-left shadow-[0_8px_28px_rgba(14,165,233,0.28)] backdrop-blur-md hover:bg-sky-100 transition-colors"
      style={{ top: `calc(${chromeOffset} + 10px)` }}
      title="点击切换加购 AUP"
    >
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-sky-600">AUP</span>
      <span className="min-w-0 truncate text-xs font-semibold text-sky-900">
        {activeAup ? activeAup.registerNo : "点击选择加购上下文"}
      </span>
      {activeAup?.projectGroupName ? (
        <span className="hidden min-w-0 truncate text-[10px] text-sky-600 sm:inline">
          {activeAup.projectGroupName}
        </span>
      ) : null}
      <span className="shrink-0 text-[10px] text-sky-500">切换</span>
    </button>,
    document.body,
  );

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${mode === "student" ? "h-[calc(100dvh-var(--student-chrome-offset,64px))]" : "h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))]"}`}>
      {aupIsland}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">
        <div className="flex shrink-0 items-center gap-2 bg-[var(--twin-canvas)] px-3 py-2 overflow-visible">
          <BreadcrumbBar stack={breadcrumbStack} onNavigate={handleBreadcrumbNavigate} />
          <div className="flex shrink-0 items-center gap-1">
            {ANIMAL_ORDER_CAMPUSES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  storeCampus(c);
                  setCampus(c);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  campus === c
                    ? "bg-emerald-600 text-white"
                    : "border border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                }`}
              >
                {c}校区
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAupPickerOpen(true)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activeAup
                ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
            title="当前加购 AUP，点击可切换"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">AUP</span>
            {activeAup ? (
              <>
                <span className="font-semibold">{activeAup.registerNo}</span>
                {activeAup.projectGroupName ? (
                  <span className="max-w-[10rem] truncate opacity-70">{activeAup.projectGroupName}</span>
                ) : null}
              </>
            ) : (
              <span>选择 AUP</span>
            )}
            <span className="opacity-60">切换</span>
          </button>
          <div className="flex-1 min-w-0" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={`搜索${typeConfig.label}...`}
            className="h-8 w-full max-w-[12rem] shrink-0 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 text-xs outline-none ring-sky-500 focus:ring-2"
          />
          <div className="flex shrink-0 items-center gap-1">
            {isAdmin && (
              <>
                <button type="button" className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors whitespace-nowrap" onClick={() => setTemplateManagerOpen(true)}>
                  规格模板
                </button>
                <button type="button" className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors whitespace-nowrap" onClick={() => setTimeManagerOpen(true)}>
                  时间管理
                </button>
              </>
            )}
            <button
              type="button"
              className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors whitespace-nowrap"
              onClick={() => {
                // 学生端订单记录已是独立子路由（同款展示 + 课题组范围 + 只读）
                if (mode === "student") navigate("/student/animal-order/records");
                else setOrderHistoryOpen(true);
              }}
            >
              订单记录
            </button>
          </div>
          {drillStack.length === 0 && availableTypes.length > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              {availableTypes.map((t) => (
                <button
                  key={t.typeKey}
                  type="button"
                  onClick={() => handleTypeSwitch(t.typeKey)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTypeKey === t.typeKey
                      ? "bg-sky-600 text-white"
                      : "border border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-row">
          {drillStack.length > 0 && sidebarParentType && (
            <aside className="w-[140px] shrink-0 overflow-y-auto border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] py-2 flex flex-col">
              <button type="button" onClick={handleGoBack} className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--twin-link)] hover:bg-[var(--twin-canvas)] transition-colors border-b border-[var(--twin-hairline)] mb-1">
                <span className="text-sm leading-none">&larr;</span>
                <span>返回上一级</span>
              </button>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--twin-mute)]">
                {getTypeConfig(sidebarParentType)?.label ?? sidebarParentType}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {sidebarItems.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">暂无可选项</div>
                ) : (
                  sidebarItems.map((si) => {
                    const fd = si.fieldData as Record<string, unknown> | undefined;
                    const activeParentId = drillStack[drillStack.length - 1]?.id;
                    return (
                      <button
                        key={si.id}
                        type="button"
                        onClick={() => handleSidebarSwitch(si)}
                        className={`block w-full px-3 py-2 text-left text-xs leading-snug transition-colors ${
                          activeParentId === si.id
                            ? "border-l-2 border-[var(--twin-link)] bg-[var(--twin-canvas)] font-semibold text-[var(--twin-link)]"
                            : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"
                        }`}
                      >
                        <span className="truncate block">{String(fd?.title || fd?.subtitle || `ID ${si.id}`)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>
          )}

          <CardGrid
            items={filteredItems}
            typeConfig={typeConfig}
            isAdmin={isAdmin}
            mode={mode}
            onEdit={handleOpenEdit}
            onDrillDown={handleDrillDown}
            onAddToCart={handleAddToCart}
            onDelete={isAdmin ? handleDelete : undefined}
            onCreateNew={isAdmin ? handleOpenCreate : undefined}
            isLoading={isLoading}
            isError={isError}
            errorMessage={error?.message}
            orderingBlocked={orderingBlocked}
          />
        </div>
      </div>

      {/* Floating cart */}
      <div className="fixed right-14 z-50 flex flex-col items-end gap-2" style={{ bottom: "max(64px, env(safe-area-inset-bottom, 0px) + 48px)" }}>
        {cartSheetOpen && (
          <div className="w-[22rem] max-h-[70vh] flex flex-col rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-[0_8px_32px_rgba(0,0,0,0.18)] animate-[scale-in_0.2s_ease-out]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--twin-hairline)] gap-2">
              <span className="text-sm font-semibold text-[var(--twin-ink)]">共享购物车 · {cartCount} 件</span>
              <button onClick={() => setCartSheetOpen(false)} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] text-sm">✕</button>
            </div>

            {/* 编辑模式横幅：保存/放弃都在这里，别处不提供出口，避免链断在半路 */}
            {editActive && editingOrderId && (
              <div className="mx-3 mt-2 rounded-twin-md border border-sky-300 bg-sky-50 px-3 py-2">
                <div className="text-xs font-semibold text-sky-900">正在编辑订单 #{editingOrderId}</div>
                <div className="mt-0.5 text-[11px] text-sky-800/80">
                  改完点「保存」写回原单（单号不变）；点「放弃」清空回填内容，原单不受影响。
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={editBusy}
                    onClick={() => void handleDiscardEdit()}
                    className="rounded-full border border-sky-300 px-3 py-1 text-[11px] text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                  >
                    放弃编辑
                  </button>
                  <button
                    type="button"
                    disabled={editBusy}
                    onClick={() => void handleApplyEdit()}
                    className="rounded-full bg-sky-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {editBusy ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            )}

            {orderingBlocked && (
              <div className="mx-3 mt-2 rounded-twin-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div>{timePolicy?.closedReason}</div>
                <div className="mt-0.5 text-[11px]">
                  {timePolicy?.nextOpenAt && (
                    <span>下次开放：{formatDateTimeAsiaShanghai(timePolicy.nextOpenAt)}</span>
                  )}
                  {timePolicy?.estimatedDeliveryDate && (
                    <span className={timePolicy?.nextOpenAt ? " · " : ""}>
                      预计送达：{timePolicy.estimatedDeliveryDate}
                    </span>
                  )}
                </div>
              </div>
            )}

            {timePolicy?.canOrderNow && timePolicy.estimatedDeliveryDate && (
              <div className="mx-3 mt-2 px-1 text-xs text-[var(--twin-body)]">
                预计送达：{timePolicy.estimatedDeliveryDate}
              </div>
            )}

            <div className="min-h-0 overflow-y-auto px-3 py-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
              <CartTree
                layout="desktop"
                lines={cartLines}
                isPi={isPi}
                currentUserId={currentUserId}
                onQtyChange={handleCartQtyChange}
              />
            </div>

            {/* 实时总金额：只统计已定价的行 */}
            {cartTotalAmount != null && (
              <div className="shrink-0 border-t border-[var(--twin-hairline)] px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-[var(--twin-mute)]">合计金额</span>
                <span className="text-sm font-bold text-sky-700">¥{cartTotalAmount.toFixed(2)}</span>
              </div>
            )}

            {!isPi && (
              <div className="border-t border-[var(--twin-hairline)] px-3 py-2 space-y-2">
                <input
                  type="text"
                  placeholder="订单包统一备注（提交给 PI）"
                  value={packageRemark}
                  onChange={(e) => setPackageRemark(e.target.value)}
                  className="w-full rounded border border-[var(--twin-hairline)] bg-white px-2 py-1 text-[11px] outline-none"
                />
                <div className="flex gap-2 justify-end">
                  {myReadyLines.length > 0 && (
                    <button type="button" className="text-xs text-[var(--twin-mute)]" onClick={handleWithdrawPackage} disabled={withdrawMut.isPending}>
                      撤回 READY
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={orderingBlocked || myDraftLines.length === 0 || markReadyMut.isPending}
                    onClick={handleMarkPackageReady}
                  >
                    {markReadyMut.isPending ? "提交中…" : "提交给 PI"}
                  </button>
                </div>
              </div>
            )}

            {isPi && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
                <button type="button" className="text-xs text-red-500 disabled:opacity-50" disabled={cartCount === 0 || editActive} onClick={handleClearCart}>清空</button>
                <button
                  type="button"
                  disabled={orderingBlocked || submitOrderMut.isPending || readyLines.length === 0 || editActive}
                  onClick={() => setSubmitConfirmOpen(true)}
                  title={editActive ? "编辑模式下请用上方「保存」写回原单，不能另开新单" : undefined}
                  className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {submitOrderMut.isPending ? "提交中…" : editActive ? "编辑中（用上方保存）" : `正式提交 (${readyLines.length})`}
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setCartSheetOpen(!cartSheetOpen)}
          className={`relative flex items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
            cartSheetOpen
              ? "w-10 h-10 bg-[var(--twin-canvas)] border border-[var(--twin-hairline)]"
              : "w-12 h-12 bg-sky-600 hover:bg-sky-700 hover:scale-110"
          }`}
        >
          {cartSheetOpen ? (
            <span className="text-lg leading-none">✕</span>
          ) : (
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          )}
          {!cartSheetOpen && cartCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </button>
      </div>

      {editModal && typeConfig && (
        <EditModal
          mode={editModal.mode}
          typeConfig={typeConfig}
          item={editModal.item}
          parentOptions={parentOptionItems}
          templates={templates}
          defaultParentId={editModal.mode === "create" ? currentParentId : undefined}
          defaultParentLabel={drillStack.length > 0 ? drillStack[drillStack.length - 1].label : undefined}
          drillItemIds={drillStack.map((s) => s.id)}
          onSave={handleSave}
          onClose={() => setEditModal(null)}
        />
      )}

      {specSelectItem && (
        <SpecSelectPanel
          item={specSelectItem}
          parentLabel={drillStack.length > 0 ? drillStack[drillStack.length - 1].label : undefined}
          onConfirm={handleSpecConfirm}
          onClose={() => setSpecSelectItem(null)}
          orderingBlocked={orderingBlocked}
          groupNames={effectiveGroupNames}
          selfUserId={currentUserId}
          selfUserName={currentUserName}
        />
      )}

      {templateManagerOpen && <SpecTemplateManager onClose={() => setTemplateManagerOpen(false)} />}
      {timeManagerOpen && <OrderTimeManager campus={campus} onClose={() => setTimeManagerOpen(false)} />}
      {orderHistoryOpen && <OrderHistoryPanel groupId={groupId} onClose={() => setOrderHistoryOpen(false)} />}

      {/* AUP 切换：portal 到 body，避开 AdminLayout 内容区 stacking context */}
      {aupPickerOpen && createPortal(
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAupPickerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-sm font-semibold text-[var(--twin-ink)]">选择加购 AUP</div>
            {approvedAups.length === 0 ? (
              <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 text-xs text-[var(--twin-mute)]">
                本课题组暂无已批准的 AUP 计划书。
              </div>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {approvedAups.map((aup) => (
                  <button
                    key={aup.id}
                    type="button"
                    className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                      String(selectedAupId) === String(aup.id)
                        ? "bg-sky-600 text-white"
                        : "hover:bg-[var(--twin-canvas-soft)] text-[var(--twin-ink)]"
                    }`}
                    onClick={() => {
                      setSelectedAupId(String(aup.id));
                      setAupPickerOpen(false);
                    }}
                  >
                    {aup.registerNo}
                    <span className={`ml-2 text-xs ${String(selectedAupId) === String(aup.id) ? "text-sky-100" : "text-[var(--twin-mute)]"}`}>
                      {aup.projectGroupName}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded-full border border-[var(--twin-hairline)] px-4 py-1.5 text-xs text-[var(--twin-mute)]" onClick={() => setAupPickerOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* PI 正式提交 */}
      {submitConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-xl">
            <div className="mb-3 text-sm font-semibold text-[var(--twin-ink)]">正式提交申领单</div>
            <div className="mb-2 text-xs text-[var(--twin-mute)]">
              将提交 {readyLines.length} 行（本人加购的行 + 实验员已提交给 PI 的订单包，可跨多个 AUP），生成一张订单进入接收人整单审批。
            </div>
            {timePolicy?.canOrderNow && timePolicy.estimatedDeliveryDate && (
              <div className="mb-2 text-xs text-[var(--twin-body)]">
                预计送达：{timePolicy.estimatedDeliveryDate}
              </div>
            )}
            <div className="mb-2 flex items-center justify-between rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
              <span className="text-xs text-[var(--twin-mute)]">订单总金额</span>
              <span className="text-sm font-bold text-sky-700">
                {readyTotalAmount != null ? `¥${readyTotalAmount.toFixed(2)}` : "未定价"}
              </span>
            </div>
            <textarea
              placeholder="整单备注（可选，默认不覆盖实验员包备注）"
              value={submitRemark}
              onChange={(e) => setSubmitRemark(e.target.value)}
              className="w-full rounded-twin-md border border-[var(--twin-hairline)] bg-white px-2 py-2 text-sm outline-none min-h-[72px]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-full border border-[var(--twin-hairline)] px-4 py-1.5 text-xs text-[var(--twin-mute)]" onClick={() => setSubmitConfirmOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                disabled={orderingBlocked || readyLines.length === 0 || submitOrderMut.isPending}
                onClick={handleSubmitOrder}
              >
                {submitOrderMut.isPending ? "提交中…" : "确认提交"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
