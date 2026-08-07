import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
} from "@/api/hooks/useReferenceData";
import {
  replaceCart,
  fetchCart,
  type RefDataItem,
} from "@/api/domains/referenceData.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
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
import OrderHistoryPanel from "./OrderHistoryPanel";
import type { CartLine } from "./CartDrawer";

// ── Cart key helpers (follow supplies mall pattern) ──

function itemIdFromCartKey(key: string): number {
  const idx = key.indexOf("::");
  return Number(idx >= 0 ? key.slice(0, idx) : key);
}

// ── Types ──

interface DrillSegment {
  id: number;
  label: string;
  typeKey: string;
}

interface ReferenceDataManagerProps {
  mode: "admin" | "console" | "student";
}

export default function ReferenceDataManager({ mode }: ReferenceDataManagerProps) {
  const [activeTypeKey, setActiveTypeKey] = useState("SUPPLIER");
  const [drillStack, setDrillStack] = useState<DrillSegment[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [editModal, setEditModal] = useState<{
    mode: "create" | "edit";
    item?: RefDataItem;
  } | null>(null);
  const [specSelectItem, setSpecSelectItem] = useState<RefDataItem | null>(null);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  // Cart: spec-aware keys (like supplies mall) — { "123::age=6W|gender=male": 3 }
  const [cart, setCart] = useState<Record<string, number>>({});
  const [remarkMap, setRemarkMap] = useState<Record<string, string>>({});
  const [addedByMap, setAddedByMap] = useState<Record<string, string>>({});
  const [itemLabelMap, setItemLabelMap] = useState<Record<string, string>>({});
  const cartRef = useRef(cart);
  cartRef.current = cart;

  const role = authStorage.getRole() || "MEMBER";
  const userInfo = authStorage.getUserInfo();
  const currentUserName = userInfo?.displayName?.trim() || userInfo?.username?.trim() || userInfo?.id?.trim() || "";
  const currentUserId = userInfo?.id?.trim() || "";
  const projectGroupName = userInfo?.projectGroupName?.trim() || "";
  const isAdmin = mode === "admin" && hasMinRole(role, "SUPER_ADMIN");
  const currentParentId =
    drillStack.length > 0 ? drillStack[drillStack.length - 1].id : undefined;

  const typeConfig = getTypeConfig(activeTypeKey);
  const allTypes = getAllTypeConfigs();

  // Group ID for cart sharing
  const groupId = useMemo(() => {
    const uid = authStorage.getUserInfo()?.id?.trim();
    if (!uid) return "";
    const key = `ref_data_group_${uid}`;
    let gid = localStorage.getItem(key);
    if (!gid) {
      gid = `group-${uid}-${Date.now()}`;
      localStorage.setItem(key, gid);
    }
    return gid;
  }, []);

  // Data fetching
  const { data: items = [], isLoading, isError, error } = useRefDataList(activeTypeKey, currentParentId);
  const { data: parentListItems = [] } = useRefDataList(
    typeConfig?.parentType ?? "",
    undefined,
  );
  const { data: templates = [] } = useSpecTemplates();
  const { data: serverCartItems = [] } = useRefCart(groupId);

  // Sidebar items
  const sidebarParentType = typeConfig?.parentType;
  const sidebarParentId = drillStack.length >= 2
    ? drillStack[drillStack.length - 2].id
    : undefined;
  const { data: sidebarItems = [] } = useRefDataList(
    sidebarParentType ?? "",
    sidebarParentId,
  );

  // Mutations
  const createMut = useCreateRefData();
  const updateMut = useUpdateRefData();
  const deleteMut = useDeleteRefData();
  const addToCartMut = useAddToCart();
  const updateCartMut = useUpdateCartItem();
  const removeCartMut = useRemoveCartItem();
  const clearCartMut = useClearCart();
  const submitOrderMut = useSubmitOrder();

  const qc = useQueryClient();

  // ── Cart persistence: restore from localStorage + server on mount ──
  useEffect(() => {
    if (!groupId) return;
    // 1. Instant restore from localStorage
    const saved = localStorage.getItem(`ref_cart_${groupId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.cart) { setCart(parsed.cart); cartRef.current = parsed.cart; }
        if (parsed.remarkMap) setRemarkMap(parsed.remarkMap);
        if (parsed.addedByMap) setAddedByMap(parsed.addedByMap);
        if (parsed.itemLabelMap) setItemLabelMap(parsed.itemLabelMap);
      } catch { /* ignore */ }
    }
    // 2. Async restore from server (overwrites localStorage if newer)
    fetchCart(groupId).then(serverItems => {
      if (!serverItems || serverItems.length === 0) return;
      const sCart: Record<string, number> = {};
      const sRemarks: Record<string, string> = {};
      const sAddedBy: Record<string, string> = {};
      for (const ci of serverItems) {
        const key = buildCartKeyFromServerItem(ci.refDataId, ci.specSelections);
        sCart[key] = (sCart[key] || 0) + (ci.quantity || 0);
        if (ci.remark) sRemarks[key] = ci.remark;
        // Keep local addedBy if set (has displayName), otherwise fall back to server value
        if (ci.addedBy && !addedByMap[key]) sAddedBy[key] = ci.addedBy;
      }
      setCart(sCart); cartRef.current = sCart;
      setRemarkMap(sRemarks);
      setAddedByMap(sAddedBy);
      persistCartLocal(groupId, sCart, sRemarks, sAddedBy);
    }).catch(() => {});
  }, [groupId]);

  function buildCartKeyFromServerItem(refDataId: number, ss?: Record<string, string> | string): string {
    if (!ss) return String(refDataId);
    // Parse if JSON string like '{"option":"性别: 雌性"}'
    let obj: Record<string, string> = {};
    if (typeof ss === "string") {
      try { obj = JSON.parse(ss); } catch { return `${refDataId}::${ss}`; }
    } else {
      obj = ss;
    }
    // Extract option value
    const val = obj.option || Object.values(obj).filter(Boolean)[0];
    return val ? `${refDataId}::${val}` : String(refDataId);
  }

  // ── Persist cart to localStorage ──
  function persistCartLocal(gid: string, c: Record<string, number>, r: Record<string, string>, a: Record<string, string>) {
    try {
      localStorage.setItem(`ref_cart_${gid}`, JSON.stringify({ cart: c, remarkMap: r, addedByMap: a, itemLabelMap }));
    } catch { /* quota exceeded */ }
  }

  // ── Sync local cart → server (debounced) ──
  const syncTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const syncCartToServer = useCallback((nextCart: Record<string, number>) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      if (!groupId) return;
      const lines = Object.entries(nextCart)
        .filter(([, qty]) => qty > 0)
        .map(([key, qty]) => {
          const iid = itemIdFromCartKey(key);
          const idx = key.indexOf("::");
          const specSelections = idx >= 0 ? { option: key.slice(idx + 2) } : undefined;
          return { refDataId: iid, quantity: qty, specSelections, remark: remarkMap[key]?.trim() || undefined, addedBy: addedByMap[key] || undefined };
        });
      replaceCart(groupId, lines).catch(() => {});
    }, 400);
  }, [groupId, remarkMap, addedByMap]);

  // Filter items by search
  const filteredItems = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((item) => {
      const fd = item.fieldData ?? {};
      for (const key of Object.keys(fd)) {
        if (String(fd[key] ?? "").toLowerCase().includes(kw)) return true;
      }
      if (String(item.id).includes(kw)) return true;
      return false;
    });
  }, [items, searchKeyword]);

  // Cart count for badge
  const cartCount = useMemo(
    () => Object.values(cart).reduce((s, q) => s + q, 0),
    [cart],
  );

  // Available types at root
  const availableTypes = useMemo((): ReferenceTypeConfig[] => {
    if (drillStack.length > 0) {
      return typeConfig ? [typeConfig] : [];
    }
    return allTypes.filter((t) => !t.parentType);
  }, [drillStack, typeConfig, allTypes]);

  const cartLines = useMemo((): CartLine[] => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => {
        const iid = itemIdFromCartKey(key);
        const idx = key.indexOf("::");
        return {
          key,
          itemId: iid,
          itemLabel: itemLabelMap[key] || `ID ${iid}`,
          specLabel: idx >= 0 ? key.slice(idx + 2) : "",
          qty,
          remark: remarkMap[key] || "",
          addedBy: addedByMap[key] || "",
          icon: "",
          imageUrl: undefined,
        };
      });
  }, [cart, itemLabelMap, remarkMap, addedByMap]);

  // ── Navigation handlers ──

  const handleDrillDown = useCallback(
    (item: RefDataItem) => {
      if (!typeConfig?.childType) return;
      const childConfig = getTypeConfig(typeConfig.childType);
      if (!childConfig) return;
      const fd = item.fieldData as Record<string, unknown> | undefined;
      const label = String(fd?.title || fd?.subtitle || `ID ${item.id}`);
      setDrillStack((prev) => [
        ...prev,
        { id: item.id, label, typeKey: activeTypeKey },
      ]);
      setActiveTypeKey(typeConfig.childType);
    },
    [typeConfig, activeTypeKey],
  );

  const breadcrumbStack: DrillSegment[] = useMemo(() => {
    if (!typeConfig) return [];
    if (drillStack.length === 0) return [];
    return drillStack;
  }, [typeConfig, drillStack]);

  const handleBreadcrumbNavigate = useCallback(
    (index: number) => {
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
    },
    [drillStack, allTypes],
  );

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

  const handleSidebarSwitch = useCallback(
    (item: RefDataItem) => {
      if (drillStack.length === 0) return;
      const fd = item.fieldData as Record<string, unknown> | undefined;
      const newStack = [
        ...drillStack.slice(0, -1),
        { id: item.id, label: String(fd?.title || fd?.subtitle || `ID ${item.id}`), typeKey: drillStack[drillStack.length - 1].typeKey },
      ];
      setDrillStack(newStack);
    },
    [drillStack],
  );

  const handleTypeSwitch = useCallback((typeKey: string) => {
    setActiveTypeKey(typeKey);
    setDrillStack([]);
  }, []);

  // ── CRUD handlers ──

  const handleOpenCreate = useCallback(() => {
    setEditModal({ mode: "create" });
  }, []);

  const handleOpenEdit = useCallback((item: RefDataItem) => {
    setEditModal({ mode: "edit", item });
  }, []);

  const handleSave = useCallback(
    (body: Record<string, unknown>) => {
      if (editModal?.mode === "create" && currentParentId != null && !body.parentId) {
        body.parentId = currentParentId;
      }
      if (editModal?.mode === "create") {
        createMut.mutate(
          { typeKey: activeTypeKey, body },
          { onSuccess: () => setEditModal(null) },
        );
      } else if (editModal?.mode === "edit" && editModal.item) {
        updateMut.mutate(
          { typeKey: activeTypeKey, id: editModal.item.id, body },
          { onSuccess: () => setEditModal(null) },
        );
      }
    },
    [editModal, activeTypeKey, createMut, updateMut, currentParentId],
  );

  const handleDelete = useCallback(
    (item: RefDataItem) => {
      if (!window.confirm(`确认删除 "${item.fieldData?.title || `ID ${item.id}`}"？`))
        return;
      deleteMut.mutate({ typeKey: activeTypeKey, id: item.id });
    },
    [activeTypeKey, deleteMut],
  );

  // ── Cart handlers ──

  const handleAddToCart = useCallback(
    (item: RefDataItem) => {
      // Always open the spec panel — even items without specs need qty + remark input
      setSpecSelectItem(item);
    },
    [],
  );

  const handleSpecConfirm = useCallback(
    (entries: { optionLabel: string; qty: number; remark: string }[]) => {
      if (!specSelectItem) return;
      const nextCart = { ...cartRef.current };
      const nextRemarks = { ...remarkMap };
      const nextAddedBy = { ...addedByMap };
      const nextLabels = { ...itemLabelMap };
      const itemTitle = (specSelectItem.fieldData as Record<string, unknown>)?.title as string || `ID ${specSelectItem.id}`;
      for (const entry of entries) {
        const key = `${specSelectItem.id}::${entry.optionLabel}`;
        nextCart[key] = (nextCart[key] || 0) + entry.qty;
        if (entry.remark) nextRemarks[key] = entry.remark;
        nextAddedBy[key] = currentUserName;
        nextLabels[key] = itemTitle;
      }
      setCart(nextCart);
      setRemarkMap(nextRemarks);
      setAddedByMap(nextAddedBy);
      setItemLabelMap(nextLabels);
      cartRef.current = nextCart;
      persistCartLocal(groupId, nextCart, nextRemarks, nextAddedBy);
      syncCartToServer(nextCart);
      setSpecSelectItem(null);
      toast.success(`已加入购物车 (${entries.length} 项)`);
    },
    [specSelectItem, syncCartToServer, remarkMap],
  );

  const handleCartQtyChange = useCallback(
    (key: string, qty: number) => {
      const nextCart = { ...cartRef.current };
      if (qty <= 0) {
        delete nextCart[key];
      } else {
        nextCart[key] = qty;
      }
      setCart(nextCart);
      cartRef.current = nextCart;
      persistCartLocal(groupId, nextCart, remarkMap, addedByMap);
      syncCartToServer(nextCart);
      if (qty <= 0) {
        setRemarkMap(prev => { const n = { ...prev }; delete n[key]; return n; });
      }
    },
    [syncCartToServer],
  );

  const handleCartRemarkChange = useCallback(
    (key: string, remark: string) => {
      setRemarkMap(prev => ({ ...prev, [key]: remark }));
    },
    [],
  );

  const handleClearCart = useCallback(() => {
    if (!window.confirm("确认清空购物车？此操作不可撤销。")) return;
    setCart({});
    cartRef.current = {};
    setRemarkMap({});
    setAddedByMap({});
    localStorage.removeItem(`ref_cart_${groupId}`);
    setCartSheetOpen(false);
    clearCartMut.mutate(groupId);
  }, [clearCartMut, groupId]);

  const handleSubmitOrder = useCallback(() => {
    const lines = Object.entries(cartRef.current)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => {
        const iid = itemIdFromCartKey(key);
        const idx = key.indexOf("::");
        const specSelections = idx >= 0 ? { option: key.slice(idx + 2) } : undefined;
        return { refDataId: iid, quantity: qty, specSelections, lineRemark: remarkMap[key]?.trim() || undefined };
      });

    if (lines.length === 0) {
      toast.error("购物车是空的");
      return;
    }
    submitOrderMut.mutate(
      { groupId, submitterId: currentUserId, submitterName: currentUserName, projectGroupName, lines, submitRemark: "" },
      {
        onSuccess: () => {
          setCart({});
          cartRef.current = {};
          setRemarkMap({});
          setAddedByMap({});
          localStorage.removeItem(`ref_cart_${groupId}`);
          setCartSheetOpen(false);
          setSubmitConfirmOpen(false);
          void qc.invalidateQueries({ queryKey: queryKeys.referenceData.all });
        },
      },
    );
  }, [submitOrderMut, qc, groupId, remarkMap]);

  // ── Parent options for create modal ──

  const parentOptionItems = useMemo(() => {
    if (!typeConfig?.parentType) return [];
    return parentListItems.map((po) => {
      const fd = po.fieldData as Record<string, unknown> | undefined;
      return {
        id: po.id,
        label: String(fd?.title || fd?.subtitle || `ID ${po.id}`),
      };
    });
  }, [typeConfig?.parentType, parentListItems]);

  // ── Render ──

  if (!typeConfig) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-[var(--twin-mute)]">
        未知数据类型: {activeTypeKey}
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${mode === "student" ? "h-[calc(100dvh-var(--student-chrome-offset,64px))]" : "h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))]"}`}>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">
        {/* Header bar */}
        <div className="flex shrink-0 items-center gap-2 bg-[var(--twin-canvas)] px-3 py-2 overflow-visible">
          <BreadcrumbBar stack={breadcrumbStack} onNavigate={handleBreadcrumbNavigate} />

          <div className="flex-1 min-w-0" />

          {/* Search input */}
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={`搜索${typeConfig.label}...`}
            className="h-8 w-full max-w-md rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 text-xs outline-none ring-sky-500 focus:ring-2"
          />

          {/* Top-right entry buttons */}
          <div className="flex shrink-0 items-center gap-1">
            {isAdmin && (
              <button
                type="button"
                className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors whitespace-nowrap"
                onClick={() => setTemplateManagerOpen(true)}
              >
                规格模板
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors whitespace-nowrap"
              onClick={() => setOrderHistoryOpen(true)}
            >
              订单记录
            </button>
          </div>

          {/* Type switcher tabs */}
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

        {/* Body: flex row */}
        <div className="flex min-h-0 flex-1 flex-row">
          {/* Sidebar */}
          {drillStack.length > 0 && sidebarParentType && (
            <aside className="w-[140px] shrink-0 overflow-y-auto border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] py-2 flex flex-col">
              <button
                type="button"
                onClick={handleGoBack}
                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--twin-link)] hover:bg-[var(--twin-canvas)] transition-colors border-b border-[var(--twin-hairline)] mb-1"
              >
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

          {/* Card Grid */}
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
          />
        </div>

      </div>

      {/* Floating cart FAB — anchored to page bottom-right, consistent across all modes */}
      <div className="fixed right-4 bottom-6 z-50 flex flex-col items-end gap-2" style={{ bottom: "max(24px, env(safe-area-inset-bottom, 0px) + 8px)" }}>
        {/* Expanded panel */}
        {cartSheetOpen && (
          <div className="w-80 max-h-[60vh] flex flex-col rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-[0_8px_32px_rgba(0,0,0,0.18)] animate-[scale-in_0.2s_ease-out]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--twin-hairline)]">
              <span className="text-sm font-semibold text-[var(--twin-ink)]">购物车 · {cartCount} 件</span>
              <button onClick={() => setCartSheetOpen(false)} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] text-sm">✕</button>
            </div>
            <div className="min-h-0 overflow-y-auto px-3 py-2 space-y-2 [&::-webkit-scrollbar]:hidden" style={{scrollbarWidth:'none'}}>
              {cartLines.length === 0 ? (
                <div className="py-6 text-center text-xs text-[var(--twin-mute)]">购物车是空的</div>
              ) : (
                cartLines.map(line => (
                  <div key={line.key} className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--twin-ink)] truncate">{line.itemLabel}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--twin-mute)]">
                          {line.specLabel && <span>{line.specLabel}</span>}
                          {line.addedBy && <span> — {line.addedBy}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button type="button" className="h-6 w-6 rounded border border-[var(--twin-hairline)] bg-white text-xs" onClick={() => handleCartQtyChange(line.key, line.qty - 1)}>−</button>
                        <span className="w-8 text-center text-xs font-semibold tabular-nums">{line.qty}</span>
                        <button type="button" className="h-6 w-6 rounded bg-sky-600 text-xs font-bold text-white" onClick={() => handleCartQtyChange(line.key, line.qty + 1)}>+</button>
                      </div>
                    </div>
                    <input type="text" placeholder="备注" value={line.remark} onChange={e => handleCartRemarkChange(line.key, e.target.value)} className="mt-1 w-full rounded border border-[var(--twin-hairline)] bg-white px-2 py-0.5 text-[11px] outline-none" />
                  </div>
                ))
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
              <button type="button" className="text-xs text-red-500 disabled:opacity-50" disabled={cartCount === 0} onClick={handleClearCart}>清空</button>
              <button type="button" disabled={submitOrderMut.isPending || cartCount === 0} onClick={handleSubmitOrder} className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                {submitOrderMut.isPending ? "提交中…" : "提交申领单"}
              </button>
            </div>
          </div>
        )}

        {/* FAB circle button */}
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

      {/* Edit/Create Modal */}
      {editModal && typeConfig && (
        <EditModal
          mode={editModal.mode}
          typeConfig={typeConfig}
          item={editModal.item}
          parentOptions={parentOptionItems}
          templates={templates}
          defaultParentId={editModal.mode === "create" ? currentParentId : undefined}
          defaultParentLabel={drillStack.length > 0 ? drillStack[drillStack.length - 1].label : undefined}
          drillItemIds={drillStack.map(s => s.id)}
          onSave={handleSave}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Spec Select Panel */}
      {specSelectItem && (
        <SpecSelectPanel
          item={specSelectItem}
          parentLabel={drillStack.length > 0 ? drillStack[drillStack.length - 1].label : undefined}
          onConfirm={handleSpecConfirm}
          onClose={() => setSpecSelectItem(null)}
        />
      )}

      {/* Spec Template Manager */}
      {templateManagerOpen && (
        <SpecTemplateManager onClose={() => setTemplateManagerOpen(false)} />
      )}

      {/* Order History Panel */}
      {orderHistoryOpen && (
        <OrderHistoryPanel groupId={groupId} onClose={() => setOrderHistoryOpen(false)} />
      )}
    </div>
  );
}
