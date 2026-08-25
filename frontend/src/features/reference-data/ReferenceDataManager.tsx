import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
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
  type RefCartItem,
  type RefDataItem,
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
import SpecSelectPanel from "./SpecSelectPanel";
import SpecTemplateManager from "./SpecTemplateManager";
import OrderTimeManager from "./OrderTimeManager";
import OrderHistoryPanel from "./OrderHistoryPanel";
import type { CartLine } from "./CartDrawer";

import { appConfirm } from "@/lib/appDialog";
interface DrillSegment {
  id: number;
  label: string;
  typeKey: string;
}

interface ReferenceDataManagerProps {
  mode: "admin" | "console" | "student";
}

type CartTreeMode = "aup-user-spec" | "spec-user";

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
  const [cartTreeMode, setCartTreeMode] = useState<CartTreeMode>("aup-user-spec");
  const [packageRemark, setPackageRemark] = useState("");
  const [submitRemark, setSubmitRemark] = useState("");
  const [itemLabelMap, setItemLabelMap] = useState<Record<number, string>>({});

  const role = authStorage.getRole() || "MEMBER";
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

  const { data: timePolicy } = useAnimalOrderTimePolicy(breedCategoryKey);
  const orderingBlocked = timePolicy != null && !timePolicy.canOrderNow;

  const typeConfig = getTypeConfig(activeTypeKey);
  const allTypes = getAllTypeConfigs();

  // 共享购物车：pg-{projectGroupId}，否则归一化课题组名。
  // 课题组名优先取登录用户（userInfo），缺失时回退到已批准 AUP 记录的 projectGroupName
  // （STAFF_ 账号 sys_user.project_group_name 常为空，但 AUP 记录有值）。
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
  const myDraftLines = useMemo(
    () => cartLines.filter((l) => l.addedBy === currentUserId && l.packageStatus !== "READY"),
    [cartLines, currentUserId],
  );
  const myReadyLines = useMemo(
    () => cartLines.filter((l) => l.addedBy === currentUserId && l.packageStatus === "READY"),
    [cartLines, currentUserId],
  );
  const readyLines = useMemo(() => cartLines.filter((l) => l.packageStatus === "READY"), [cartLines]);

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

  const handleSpecConfirm = useCallback(async (entries: { optionLabel: string; qty: number }[]) => {
    if (orderingBlocked) {
      toast.error(timePolicy?.closedReason ?? "当前不可购");
      return;
    }
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
      toast.error("没有 READY 订单包可提交，请先让实验员提交给 PI");
      return;
    }
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

  const parentOptionItems = useMemo(() => {
    if (!typeConfig?.parentType) return [];
    return parentListItems.map((po) => {
      const fd = po.fieldData as Record<string, unknown> | undefined;
      return { id: po.id, label: String(fd?.title || fd?.subtitle || `ID ${po.id}`) };
    });
  }, [typeConfig?.parentType, parentListItems]);

  // ── Cart tree rendering ──

  const cartTreeContent = useMemo(() => {
    if (cartLines.length === 0) {
      return <div className="py-6 text-center text-xs text-[var(--twin-mute)]">共享购物车是空的</div>;
    }

    const renderLine = (line: CartLine) => {
      const canEdit = isPi || line.addedBy === currentUserId;
      return (
        <div key={line.key} className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--twin-ink)] truncate">{line.itemLabel}</div>
              <div className="mt-0.5 text-[11px] text-[var(--twin-mute)]">
                {line.specLabel && <span>{line.specLabel}</span>}
                <span className="ml-1 rounded bg-slate-200/80 px-1 py-0.5 text-[10px]">
                  {line.packageStatus === "READY" ? "READY" : "DRAFT"}
                </span>
              </div>
            </div>
            {canEdit ? (
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" className="h-6 w-6 rounded border border-[var(--twin-hairline)] bg-white text-xs" onClick={() => handleCartQtyChange(line, line.qty - 1)}>−</button>
                <span className="w-8 text-center text-xs font-semibold tabular-nums">{line.qty}</span>
                <button type="button" className="h-6 w-6 rounded bg-sky-600 text-xs font-bold text-white" onClick={() => handleCartQtyChange(line, line.qty + 1)}>+</button>
              </div>
            ) : (
              <span className="text-xs font-semibold tabular-nums shrink-0">×{line.qty}</span>
            )}
          </div>
          {line.packageRemark && (
            <div className="mt-1 text-[10px] text-[var(--twin-mute)] truncate">包备注：{line.packageRemark}</div>
          )}
        </div>
      );
    };

    if (cartTreeMode === "spec-user") {
      const bySpec = new Map<string, CartLine[]>();
      for (const line of cartLines) {
        const sk = `${line.itemId}::${line.specLabel || "-"}`;
        if (!bySpec.has(sk)) bySpec.set(sk, []);
        bySpec.get(sk)!.push(line);
      }
      return Array.from(bySpec.entries()).map(([sk, lines]) => (
        <div key={sk} className="space-y-1.5">
          <div className="text-[11px] font-semibold text-[var(--twin-ink)]">
            {lines[0].itemLabel}{lines[0].specLabel ? ` · ${lines[0].specLabel}` : ""}
          </div>
          {Array.from(new Map(lines.map((l) => [l.addedBy, l.addedByLabel || l.addedBy])).entries()).map(([uid, label]) => (
            <div key={uid} className="pl-2 space-y-1">
              <div className="text-[10px] text-[var(--twin-mute)]">实验员 · {label}</div>
              {lines.filter((l) => l.addedBy === uid).map(renderLine)}
            </div>
          ))}
        </div>
      ));
    }

    // 默认：AUP → 实验员 → 规格
    const byAup = new Map<string, CartLine[]>();
    for (const line of cartLines) {
      const ak = String(line.aupRecordId ?? "none");
      if (!byAup.has(ak)) byAup.set(ak, []);
      byAup.get(ak)!.push(line);
    }
    return Array.from(byAup.entries()).map(([ak, aupLines]) => (
      <div key={ak} className="space-y-1.5">
        <div className="text-[11px] font-semibold text-sky-700">AUP · {aupLines[0].aupLabel}</div>
        {Array.from(new Map(aupLines.map((l) => [l.addedBy, l.addedByLabel || l.addedBy])).entries()).map(([uid, label]) => (
          <div key={uid} className="pl-2 space-y-1">
            <div className="text-[10px] text-[var(--twin-mute)]">实验员 · {label}</div>
            {aupLines.filter((l) => l.addedBy === uid).map(renderLine)}
          </div>
        ))}
      </div>
    ));
  }, [cartLines, cartTreeMode, isPi, currentUserId, handleCartQtyChange]);

  if (!typeConfig) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-[var(--twin-mute)]">
        未知数据类型: {activeTypeKey}
      </div>
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
            className="h-8 w-full max-w-md rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 text-xs outline-none ring-sky-500 focus:ring-2"
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
            <button type="button" className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors whitespace-nowrap" onClick={() => setOrderHistoryOpen(true)}>
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

            {isPi && (
              <div className="flex gap-1 px-3 pt-2">
                <button
                  type="button"
                  className={`rounded-full px-2.5 py-0.5 text-[10px] ${cartTreeMode === "aup-user-spec" ? "bg-sky-600 text-white" : "border border-[var(--twin-hairline)] text-[var(--twin-mute)]"}`}
                  onClick={() => setCartTreeMode("aup-user-spec")}
                >
                  AUP→实验员
                </button>
                <button
                  type="button"
                  className={`rounded-full px-2.5 py-0.5 text-[10px] ${cartTreeMode === "spec-user" ? "bg-sky-600 text-white" : "border border-[var(--twin-hairline)] text-[var(--twin-mute)]"}`}
                  onClick={() => setCartTreeMode("spec-user")}
                >
                  规格→实验员
                </button>
              </div>
            )}

            <div className="min-h-0 overflow-y-auto px-3 py-2 space-y-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
              {cartTreeContent}
            </div>

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
                <button type="button" className="text-xs text-red-500 disabled:opacity-50" disabled={cartCount === 0} onClick={handleClearCart}>清空</button>
                <button
                  type="button"
                  disabled={orderingBlocked || submitOrderMut.isPending || readyLines.length === 0}
                  onClick={() => setSubmitConfirmOpen(true)}
                  className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {submitOrderMut.isPending ? "提交中…" : `正式提交 (${readyLines.length})`}
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
        />
      )}

      {templateManagerOpen && <SpecTemplateManager onClose={() => setTemplateManagerOpen(false)} />}
      {timeManagerOpen && <OrderTimeManager onClose={() => setTimeManagerOpen(false)} />}
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
              将提交 {readyLines.length} 条 READY 行（可跨多个 AUP），生成一张订单进入接收人整单审批。
            </div>
            {timePolicy?.canOrderNow && timePolicy.estimatedDeliveryDate && (
              <div className="mb-2 text-xs text-[var(--twin-body)]">
                预计送达：{timePolicy.estimatedDeliveryDate}
              </div>
            )}
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
