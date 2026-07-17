/**
 * 领用物资：布局与交互对齐小程序 package-feature/pages/supplies（左侧分类、右侧列表、底部购物车、持久化购物车）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import {
  createSupplyClaim,
  fetchSupplyCart,
  fetchSupplyClaimDetail,
  fetchSupplyMine,
  mergeSubmitSupplyClaims,
  revisePendingSupplyClaimLines,
  saveSupplyCart,
  type SupplyCategory,
  type SupplyClaimOrder,
  type SupplyItem,
} from "@/api/domains/supplies.api";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/hooks/queryKeys";
import { useSupplyCategories, useSupplyItems } from "@/api/hooks/useSupplies";
import { ADMIN_PENDING_BADGES_REFRESH_EVENT } from "@/features/admin/adminPendingBadgesEvents";
import { authStorage, AUTH_USERINFO_UPDATED_EVENT } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { fetchCapabilitySummaryMap, fetchPendingBadges } from "@/api/domains/me.api";
import { fetchPublicPagePermissions, WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED } from "@/api/domains/pagePermission.api";
import type { PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import { webImageSrc } from "@/utils/mediaUrl";
import { Portal } from "@/components/Portal";
import MySuppliesRecordsPanel from "@/components/supplies/MySuppliesRecordsPanel";

const SUPPLIES_MALL_CARD_MIN_COL_PX = 300;
/** 卡片最小高度（约为原版 2×） */
const SUPPLIES_MALL_CARD_MIN_H = "8rem";
/** 缩略图边长（原版 48px → 96px，与卡片加高同步） */
const SUPPLIES_MALL_THUMB_PX = 96;

type SpecDimension = { name: string; options: string[] };

/** 智能合并方案分组：常规物资一组 + 每个独立下单购物车物资各一组 */
type MergePlanGroup = {
  kind: "regular" | "independent";
  /** independent 组对应的物资 id */
  itemId?: number;
  label: string;
  /** 可并入的待处理订单（时间倒序，最新在前）；空数组 = 只能新建 */
  candidates: SupplyClaimOrder[];
};

const mergeGroupKey = (g: MergePlanGroup) => (g.kind === "regular" ? "regular" : `ind:${g.itemId}`);

const formatOrderTimeCompact = (s?: string) => String(s || "").replace("T", " ").slice(0, 16);

/** 订单行摘要：物资名×数量，最多 3 项，超出以“等N项”收束 */
const summarizeOrderLines = (order: SupplyClaimOrder): string => {
  const lines = order.lines ?? [];
  if (lines.length === 0) return "";
  const parts = lines.slice(0, 3).map((l) => `${l.snapshotName || "物资"}×${l.qty}`);
  return lines.length > 3 ? `${parts.join("、")} 等${lines.length}项` : parts.join("、");
};

const LEGACY_WEB_CART_PREFIX = "aro_web_supplies_cart_v1_";

function formatSpecLabel(specJson: string | undefined | null): string {
  if (!specJson) return '';
  try { return Object.values(JSON.parse(specJson)).join('·'); }
  catch { return ''; }
}

function specKeyFromSpecSnapshot(specSnapshot: string): string {
  if (!specSnapshot) return '';
  try {
    const obj = JSON.parse(specSnapshot) as Record<string, string>;
    return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('|');
  } catch { return ''; }
}

function readLegacyWebSuppliesCart(userId: string): Record<string, number> {
  const id = userId.trim();
  if (!id) return {};
  try {
    const raw = localStorage.getItem(`${LEGACY_WEB_CART_PREFIX}${id}`);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const cart: Record<string, number> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const qty = Number(v);
      if (Number.isFinite(qty) && qty > 0) {
        cart[k] = Math.min(Math.floor(qty), 999);
      }
    }
    return cart;
  } catch {
    return {};
  }
}

function clearLegacyWebSuppliesCart(userId: string) {
  try {
    localStorage.removeItem(`${LEGACY_WEB_CART_PREFIX}${userId.trim()}`);
  } catch {
    /* ignore */
  }
}

function normalizeNovelty(item: SupplyItem): SupplyItem {
  const tag = String(item.noveltyTag || "").trim();
  const isNewInbound = item.isNewInbound === true || tag.includes("进货!");
  const isNewItem = item.isNewItem === true || tag.includes("新品!");
  return {
    ...item,
    isNewInbound,
    isNewItem,
    noveltyTag:
      tag || (isNewItem && isNewInbound ? "新品!/进货!" : isNewInbound ? "进货!" : isNewItem ? "新品!" : ""),
  };
}

export default function AdminSuppliesMallPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnToForChild = `${location.pathname}${location.search}`;
  const role = authStorage.getRole() || "MEMBER";
  const superOk = hasMinRole(role, "SUPER_ADMIN");

  const [permNodes, setPermNodes] = useState<PublicPagePermissionNode[]>([]);
  const [capMap, setCapMap] = useState<Record<string, { canProcess: boolean }>>({});
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [reviseClaimId, setReviseClaimId] = useState<string | null>(null);
  const [mineBadgeText, setMineBadgeText] = useState("");
  const [processBadgeText, setProcessBadgeText] = useState("");
  const reviseBootstrappedRef = useRef<string | null>(null);
  /** 进入修订模式前的原购物车快照（云端副本）：退出修订时用它即时恢复本地，再以云端校正 */
  const preReviseCartRef = useRef<Record<string, number>>({});
  /**
   * 修订态同步 ref（与 reviseClaimId 同步置位/清位）：修订期间购物车承载的是工单行，
   * flushRemoteCart / hydrateCartFromServer 据此跳过共享云端购物车的读写，
   * 保证修订态仅存在于本页（对齐小程序的页面本地修订设计）。
   */
  const reviseActiveRef = useRef(false);
  const cartRef = useRef<Record<string, number>>({});
  const remoteSaveTimerRef = useRef<number | null>(null);
  const [authUserId, setAuthUserId] = useState(() => authStorage.getUserInfo()?.id?.trim() || "");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [remarkMap, setRemarkMap] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearCartConfirmOpen, setClearCartConfirmOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergePlanGroups, setMergePlanGroups] = useState<MergePlanGroup[]>([]);
  /** 合并方案选择：分组 key（"regular" / "ind:<itemId>"）→ 目标订单 id；空串 = 新建订单 */
  const [mergeSelections, setMergeSelections] = useState<Record<string, string>>({});
  const [recordsPanelOpen, setRecordsPanelOpen] = useState(false);
  const [specSelections, setSpecSelections] = useState<Record<number, Record<string, string>>>({});
  const queryClient = useQueryClient();

  const claimCap = capMap.SUPPLIES_CLAIM;
  const adminCap = capMap.SUPPLIES_ADMIN;
  const showProcessEntry = superOk && !!claimCap?.canProcess;
  const showAdminEntry =
    superOk &&
    !!adminCap?.canProcess &&
    canShowWebEntry(permNodes, "/admin/supplies/manage", "sidebar", role, "SUPER_ADMIN");

  const { data: categories = [] } = useSupplyCategories();
  const { data: rawItems = [], isLoading: itemsLoading } = useSupplyItems(activeCat);
  /** 全量物资（跨分类）：购物车可能含非当前分类的物资，拆单提示需要完整查找表 */
  const { data: allRawItems = [] } = useSupplyItems("all");

  const items = useMemo(() => rawItems.map(normalizeNovelty), [rawItems]);

  const flushRemoteCart = useCallback(async (payload: Record<string, number>) => {
    // 修订模式：购物车承载的是工单行，绝不写入共享云端购物车
    //（防止刷新/关标签把工单行留在云端，被小程序等其他端拉走）
    if (reviseActiveRef.current) return;
    try {
      await saveSupplyCart(payload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "购物车同步失败");
    }
  }, []);

  const syncCartImmediate = useCallback(
    (next: Record<string, number>) => {
      cartRef.current = next;
      setCart(next);
      if (remoteSaveTimerRef.current != null) {
        window.clearTimeout(remoteSaveTimerRef.current);
        remoteSaveTimerRef.current = null;
      }
      void flushRemoteCart(next);
    },
    [flushRemoteCart],
  );

  const syncCart = useCallback(
    (next: Record<string, number>) => {
      cartRef.current = next;
      setCart(next);
      if (remoteSaveTimerRef.current != null) {
        window.clearTimeout(remoteSaveTimerRef.current);
      }
      remoteSaveTimerRef.current = window.setTimeout(() => {
        remoteSaveTimerRef.current = null;
        void flushRemoteCart(cartRef.current);
      }, 420);
    },
    [flushRemoteCart],
  );

  const hydrateCartFromServer = useCallback(async () => {
    // 修订模式：修订购物车仅存在于本页，禁止被云端数据覆盖（与小程序 hydrate 早退对齐）
    if (reviseActiveRef.current) return;
    const uid = authUserId.trim();
    if (!uid) {
      cartRef.current = {};
      setCart({});
      return;
    }
    try {
      const remote = await fetchSupplyCart();
      // 请求返回时可能已进入修订模式：迟到的水合不得覆盖修订购物车
      if (reviseActiveRef.current) return;
      let merged: Record<string, number> = { ...remote };
      const legacy = readLegacyWebSuppliesCart(uid);
      if (Object.keys(merged).length === 0 && Object.keys(legacy).length > 0) {
        merged = legacy;
        await saveSupplyCart(merged);
        clearLegacyWebSuppliesCart(uid);
        // 迁移写入期间可能已进入修订模式：不得覆盖修订购物车
        if (reviseActiveRef.current) return;
      }
      cartRef.current = merged;
      setCart(merged);
    } catch (e) {
      if (reviseActiveRef.current) return;
      const legacy = readLegacyWebSuppliesCart(uid);
      cartRef.current = legacy;
      setCart(legacy);
      toast.error(e instanceof Error ? e.message : "无法从云端加载购物车，已暂用本机旧数据");
    }
  }, [authUserId]);

  useEffect(() => {
    const sync = () => setAuthUserId(authStorage.getUserInfo()?.id?.trim() || "");
    sync();
    window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, sync);
    return () => window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    void hydrateCartFromServer();
  }, [hydrateCartFromServer]);

  useEffect(() => {
    return () => {
      if (remoteSaveTimerRef.current != null) {
        window.clearTimeout(remoteSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadPerm = async () => {
      try {
        const nodes = await fetchPublicPagePermissions("WEB");
        if (mounted) setPermNodes(nodes || []);
      } catch {
        if (mounted) setPermNodes([]);
      }
    };
    void loadPerm();
    const onWebPermUpdated = () => void loadPerm();
    window.addEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, onWebPermUpdated);
    return () => {
      mounted = false;
      window.removeEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, onWebPermUpdated);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetchCapabilitySummaryMap().then((m) => {
      if (!mounted) return;
      const next: Record<string, { canProcess: boolean }> = {};
      for (const [k, v] of Object.entries(m)) {
        next[k] = { canProcess: !!v.canProcess };
      }
      setCapMap(next);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshMineBadge = useCallback(() => {
    void fetchPendingBadges().then((b) => {
      const n = Number(b?.supplies ?? 0);
      setMineBadgeText(n > 0 && b?.suppliesText ? String(b.suppliesText) : "");
      const pn = Number(b?.processSupplies ?? 0);
      setProcessBadgeText(
        showProcessEntry && pn > 0 && b?.processSuppliesText ? String(b.processSuppliesText) : "",
      );
    });
  }, [showProcessEntry]);

  useEffect(() => {
    refreshMineBadge();
    const onEv = () => refreshMineBadge();
    window.addEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, onEv);
    return () => window.removeEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, onEv);
  }, [refreshMineBadge]);

  /** 从 cart key 中提取 itemId（支持 "123" 和 "123::spec=val" 两种格式） */
  const itemIdFromCartKey = (key: string): number => {
    const idx = key.indexOf("::");
    return Number(idx >= 0 ? key.slice(0, idx) : key);
  };

  /** 从 cart key 中提取 specSnapshot JSON */
  const specSnapshotFromCartKey = (key: string): string | undefined => {
    const idx = key.indexOf("::");
    if (idx < 0) return undefined;
    const specPart = key.slice(idx + 2);
    if (!specPart) return undefined;
    const obj: Record<string, string> = {};
    for (const pair of specPart.split('|')) {
      const eq = pair.indexOf('=');
      if (eq > 0) obj[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    return Object.keys(obj).length > 0 ? JSON.stringify(obj) : undefined;
  };

  const buildSpecCartKey = (itemId: number, selections: Record<string, string>, dimOrder: string[]): string => {
    // 维度名排序：与小程序 specCartKey 的 keys.sort() 对齐，避免跨端同规格生成不同购物车键
    const parts = [...dimOrder].filter(d => selections[d]).sort().map(d => `${d}=${selections[d]}`);
    return parts.length > 0 ? `${itemId}::${parts.join('|')}` : String(itemId);
  };

  const maxForItem = (item: SupplyItem | undefined) => {
    if (!item) return 0;
    // 可用库存 = 总库存 − 待处理单锁定量；availableQty 缺失时回落 stockQty
    const effectiveQty = Number(item.availableQty ?? item.stockQty);
    if (item.stockMode === "QUANTIFIED") return Math.max(0, Number.isFinite(effectiveQty) ? effectiveQty : 0);
    return effectiveQty >= 1 ? 99 : 0;
  };

  const reconcileCartWithStock = useCallback(
    (list: SupplyItem[]) => {
      const next = { ...cartRef.current };
      let changed = false;
      for (const key of Object.keys(next)) {
        const iid = itemIdFromCartKey(key);
        const it = list.find(x => x.id === iid);
        if (!it) continue;
        const max = maxForItem(it);
        if (max <= 0) {
          delete next[key];
          changed = true;
        } else if (next[key] > max) {
          next[key] = max;
          changed = true;
        }
      }
      if (changed) syncCart(next);
    },
    [syncCart],
  );

  useEffect(() => {
    reconcileCartWithStock(items);
  }, [items, reconcileCartWithStock]);

  const bootstrapReviseFromUrl = useCallback(
    async (rid: string) => {
      try {
        const d = await fetchSupplyClaimDetail(rid);
        if (String(d.status || "").toUpperCase() !== "PENDING") {
          toast.error("仅待出库工单可修订");
          const next = new URLSearchParams(searchParams);
          next.delete("reviseClaimId");
          setSearchParams(next, { replace: true });
          return;
        }
        const nextCart: Record<string, number> = {};
        for (const line of d.lines || []) {
          const iid = Number(line.itemId);
          const q = Number(line.qty);
          if (Number.isFinite(iid) && iid > 0 && Number.isFinite(q) && q > 0) {
            const key = line.specSnapshot ? `${iid}::${specKeyFromSpecSnapshot(line.specSnapshot)}` : String(iid);
            nextCart[key] = Math.min(Math.floor(q), 999);
          }
        }
        // 冲刷尚未落盘的防抖写入（此时仍非修订态），确保云端快照包含最后一次编辑
        if (remoteSaveTimerRef.current != null) {
          window.clearTimeout(remoteSaveTimerRef.current);
          remoteSaveTimerRef.current = null;
          await flushRemoteCart(cartRef.current);
        }
        // 快照用户自己的购物车：取云端副本（云端从未被修订态污染，且不受初始水合竞态影响），失败回落本地状态
        let snapshot: Record<string, number>;
        try {
          snapshot = await fetchSupplyCart();
        } catch {
          snapshot = { ...cartRef.current };
        }
        preReviseCartRef.current = { ...snapshot };
        // 先置修订态：随后的工单行载入与修订期间的一切编辑都只更新本地，不冲刷云端
        reviseActiveRef.current = true;
        syncCartImmediate(nextCart);
        setReviseClaimId(rid);
        setCartSheetOpen(true);
        toast.success("已从工单载入购物车");
        const next = new URLSearchParams(searchParams);
        next.delete("reviseClaimId");
        setSearchParams(next, { replace: true });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "载入工单失败");
      }
    },
    [searchParams, setSearchParams, syncCartImmediate, flushRemoteCart],
  );

  useEffect(() => {
    if (!(searchParams.get("reviseClaimId") || "").trim()) {
      reviseBootstrappedRef.current = null;
    }
  }, [searchParams]);

  useEffect(() => {
    const rid = (searchParams.get("reviseClaimId") || "").trim();
    if (!rid || reviseBootstrappedRef.current === rid) return;
    reviseBootstrappedRef.current = rid;
    void bootstrapReviseFromUrl(rid);
  }, [searchParams, bootstrapReviseFromUrl]);

  /**
   * 恢复用户自己的购物车：先用快照即时恢复本地（不写云端——云端在修订期间从未被触碰，
   * 本就保存着用户自己的购物车），再拉取云端副本校正（权威来源，兼容修订期间其他端的改动）。
   */
  const restoreOwnCartAfterRevise = useCallback(() => {
    // 取消修订期间残留的防抖写入，避免退出后陈旧快照被冲刷到云端
    if (remoteSaveTimerRef.current != null) {
      window.clearTimeout(remoteSaveTimerRef.current);
      remoteSaveTimerRef.current = null;
    }
    const snapshot = { ...preReviseCartRef.current };
    preReviseCartRef.current = {};
    cartRef.current = snapshot;
    setCart(snapshot);
    void hydrateCartFromServer();
  }, [hydrateCartFromServer]);

  /** 退出修订模式：清除修订态与 URL 参数（如仍存在），可选恢复进入修订前的原购物车 */
  const exitReviseMode = useCallback(
    (opts?: { restoreCart?: boolean }) => {
      setReviseClaimId(null);
      reviseActiveRef.current = false;
      if (searchParams.has("reviseClaimId")) {
        const next = new URLSearchParams(searchParams);
        next.delete("reviseClaimId");
        setSearchParams(next, { replace: true });
      }
      if (opts?.restoreCart) {
        restoreOwnCartAfterRevise();
      } else {
        preReviseCartRef.current = {};
      }
    },
    [searchParams, setSearchParams, restoreOwnCartAfterRevise],
  );

  /**
   * 修订模式离开页面守卫：createHashRouter 为数据路由，useBlocker 可拦截应用内路由跳转。
   * 仅 pathname 变化才拦截（search 变化如 reviseClaimId 参数清理不算离开）。
   */
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !!reviseClaimId && currentLocation.pathname !== nextLocation.pathname,
  );

  // 修订模式下关闭/刷新标签页：浏览器原生 beforeunload 确认（原生弹窗无法提供保存按钮）
  useEffect(() => {
    if (!reviseClaimId) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [reviseClaimId]);

  // 守卫弹窗打开时 Esc = 留在本页继续修改（等同关闭弹窗）
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) blocker.reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocker, submitting]);

  // 合并弹窗打开时 Esc = 取消（留在本页，购物车不变）；合并请求进行中禁用
  useEffect(() => {
    if (!mergeDialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) setMergeDialogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mergeDialogOpen, submitting]);

  const cartCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);

  const noveltyCounts = useMemo(() => {
    let newItem = 0;
    let newInbound = 0;
    for (const item of items) {
      if (item.isNewInbound) newInbound += 1;
      if (item.isNewItem) newItem += 1;
    }
    return { newItem, newInbound, total: newItem + newInbound };
  }, [items]);

  const filteredItems = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const subtitle = String(item.subtitle || "").toLowerCase();
      const idText = String(item.id || "").toLowerCase();
      return name.includes(kw) || subtitle.includes(kw) || idText.includes(kw);
    });
  }, [items, searchKeyword]);

  const cartLines = useMemo(() => {
    const out: { key: string; itemId: number; specLabel: string; name: string; cover?: string; initial: string; qty: number }[] = [];
    for (const [k, qty] of Object.entries(cart)) {
      const q = Number(qty);
      if (!Number.isFinite(q) || q <= 0) continue;
      const iid = itemIdFromCartKey(k);
      if (!Number.isFinite(iid) || iid <= 0) continue;
      const it = items.find((x) => x.id === iid);
      const name = it?.name || "物资";
      const ch = String(name).trim().charAt(0) || "?";
      const specLabel = k.includes("::") ? formatSpecLabel(specSnapshotFromCartKey(k)) : "";
      out.push({
        key: k,
        itemId: iid,
        specLabel,
        name: specLabel ? `${name}（${specLabel}）` : name,
        cover: webImageSrc(it?.coverUrl),
        initial: ch,
        qty: q,
      });
    }
    return out;
  }, [cart, items]);

  /** 独立下单拆分提示：按 itemId 去重（同物资的规格键属于同一物资） */
  const { willSplit, multiIndependent } = useMemo(() => {
    const lookup = allRawItems.length > 0 ? allRawItems : items;
    const independentIds = new Set<number>();
    const regularIds = new Set<number>();
    for (const [key, qty] of Object.entries(cart)) {
      if (!(Number(qty) > 0)) continue;
      const iid = itemIdFromCartKey(key);
      if (!Number.isFinite(iid) || iid <= 0) continue;
      const it = lookup.find((x) => x.id === iid);
      if (!it) continue;
      if (it.independentOrder === 1) independentIds.add(iid);
      else regularIds.add(iid);
    }
    return {
      willSplit: independentIds.size > 0 && regularIds.size > 0,
      multiIndependent: independentIds.size > 1,
    };
  }, [cart, items, allRawItems]);

  const addToCart = (item: SupplyItem, cartKey?: string) => {
    const key = cartKey || String(item.id);
    const max = maxForItem(item);
    if (max <= 0) {
      toast.error("暂无库存");
      return;
    }
    const cur = cart[key] || 0;
    const nextQty = Math.min(cur + 1, max);
    syncCart({ ...cart, [key]: nextQty });
  };

  const decFromCart = (cartKey: string) => {
    const cur = (cart[cartKey] || 0) - 1;
    const next = { ...cart };
    if (cur <= 0) delete next[cartKey];
    else next[cartKey] = cur;
    syncCart(next);
  };

  const inputCartQty = (item: SupplyItem, raw: string, cartKey?: string) => {
    const key = cartKey || String(item.id);
    const max = maxForItem(item);
    const n = Number.parseInt(raw || "0", 10);
    const safe = Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
    const next = { ...cart };
    if (safe <= 0) delete next[key];
    else next[key] = safe;
    syncCart(next);
    if (Number.isFinite(n) && n > max) toast.error(`最多可下单 ${max}`);
  };

  /** 由购物车构建提交行（提交/修订/合并共用） */
  const buildCartPayloadLines = () =>
    Object.entries(cart)
      .map(([cartKey, qty]) => {
        const iid = itemIdFromCartKey(cartKey);
        const specSnapshot = specSnapshotFromCartKey(cartKey);
        return { itemId: iid, qty, remark: remarkMap[cartKey]?.trim() || undefined, specSnapshot };
      })
      .filter((l) => l.qty > 0 && l.itemId > 0);

  const sortPendingOrdersDesc = (orders: SupplyClaimOrder[]) =>
    orders.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  /**
   * 构建智能合并方案：目标订单按规则匹配，不允许自由选择——
   * - 常规购物车物资 → 只可并入“纯常规”待处理单（不含任何独立下单行）；
   * - 独立下单物资 X → 只可并入 X 自己的独立待处理单；
   * - 含独立行的混合单、多物资独立单（历史遗留）一律排除；
   * - 每组默认选中最新匹配单，重复 (itemId, spec) 行由后端归并累加。
   */
  const buildMergePlan = async (prevSelections?: Record<string, string>) => {
    const pack = await fetchSupplyMine({ page: 1, size: 50, status: "PENDING", withLines: true });
    const orders = sortPendingOrdersDesc(pack?.data ?? []);
    const regularOrders: SupplyClaimOrder[] = [];
    const independentOrdersByItem = new Map<number, SupplyClaimOrder[]>();
    for (const order of orders) {
      const lines = order.lines ?? [];
      if (lines.length === 0) continue; // 无行数据无法分类，排除
      // 行的 independentOrder 为 null = 物资已删除，该单不可作为合并目标（后端校验必然拒绝）
      if (lines.some((l) => l.independentOrder == null)) continue;
      if (lines.every((l) => Number(l.independentOrder) !== 1)) {
        regularOrders.push(order);
        continue;
      }
      if (lines.every((l) => Number(l.independentOrder) === 1)) {
        const orderItemIds = new Set(lines.map((l) => Number(l.itemId)));
        if (orderItemIds.size === 1) {
          const iid = Number(lines[0].itemId);
          const bucket = independentOrdersByItem.get(iid) ?? [];
          bucket.push(order);
          independentOrdersByItem.set(iid, bucket);
        }
        // 多个独立物资混在一单：历史遗留，排除
        continue;
      }
      // 常规 + 独立混合单：历史遗留，排除
    }
    // 购物车按 itemId 去重分组（同物资多规格键归同一物资）
    const lookup = allRawItems.length > 0 ? allRawItems : items;
    const regularCartIds = new Set<number>();
    const independentCartIds: number[] = [];
    for (const [key, qty] of Object.entries(cartRef.current)) {
      if (!(Number(qty) > 0)) continue;
      const iid = itemIdFromCartKey(key);
      if (!Number.isFinite(iid) || iid <= 0) continue;
      const it = lookup.find((x) => x.id === iid);
      if (it?.independentOrder === 1) {
        if (!independentCartIds.includes(iid)) independentCartIds.push(iid);
      } else {
        regularCartIds.add(iid);
      }
    }
    const groups: MergePlanGroup[] = [];
    // 常规组：仅当购物车含常规物资且存在可并入的常规单时出现
    if (regularCartIds.size > 0 && regularOrders.length > 0) {
      groups.push({ kind: "regular", label: "常规物资", candidates: regularOrders });
    }
    // 每个独立下单物资各一组：无匹配单时仍展示（静态“新建独立订单”行）
    for (const iid of independentCartIds) {
      const candidates = independentOrdersByItem.get(iid) ?? [];
      const name = lookup.find((x) => x.id === iid)?.name || `物资 ${iid}`;
      groups.push({ kind: "independent", itemId: iid, label: name, candidates });
    }
    const selections: Record<string, string> = {};
    for (const g of groups) {
      const gk = mergeGroupKey(g);
      const prev = prevSelections?.[gk];
      // 默认最新匹配单；刷新时原选择（含手动改选的“新建”空串）仍有效则保留
      selections[gk] =
        prev !== undefined && (prev === "" || g.candidates.some((o) => o.id === prev))
          ? prev
          : (g.candidates[0]?.id ?? "");
    }
    return { groups, selections, hasAnyMatch: groups.some((g) => g.candidates.length > 0) };
  };

  /**
   * 提交入口：非修订模式先构建合并方案；任一分组有可并入目标才弹合并弹窗，
   * 否则（含方案构建失败 fail open）直接进入正常提交确认。
   */
  const openSubmitFlow = async () => {
    if (submitting || cartCount === 0) return;
    if (reviseClaimId) {
      setConfirmOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      const plan = await buildMergePlan();
      if (plan.hasAnyMatch) {
        setMergePlanGroups(plan.groups);
        setMergeSelections(plan.selections);
        setMergeDialogOpen(true);
        return;
      }
    } catch {
      /* fail open：合并方案构建失败时照常提交 */
    } finally {
      setSubmitting(false);
    }
    setConfirmOpen(true);
  };

  /** 合并失败后刷新弹窗内的匹配列表（目标单可能已被处理）；已无任何匹配则关闭弹窗 */
  const refreshMergePlanAfterError = async () => {
    try {
      const plan = await buildMergePlan(mergeSelections);
      setMergePlanGroups(plan.groups);
      setMergeSelections(plan.selections);
      if (!plan.hasAnyMatch) setMergeDialogOpen(false);
    } catch {
      /* 刷新失败：保留现有弹窗内容，允许重试 */
    }
  };

  /**
   * 按方案合并提交：常规行并入所选常规单、独立行各自并入所选独立单，
   * 未选目标（“新建”）的分组由后端新建订单；目标单状态由后端行锁校验。
   */
  const doMergeConfirm = async () => {
    if (submitting) return;
    const lines = buildCartPayloadLines();
    if (lines.length === 0) {
      toast.error("请先选择物资");
      return;
    }
    const regularTargetOrderId = (mergeSelections.regular ?? "").trim() || undefined;
    const independentTargets: Record<string, string> = {};
    for (const g of mergePlanGroups) {
      if (g.kind !== "independent" || g.itemId == null) continue;
      const sel = (mergeSelections[mergeGroupKey(g)] ?? "").trim();
      if (sel) independentTargets[String(g.itemId)] = sel;
    }
    setSubmitting(true);
    try {
      const result = await mergeSubmitSupplyClaims({
        lines,
        regularTargetOrderId,
        independentTargets: Object.keys(independentTargets).length > 0 ? independentTargets : undefined,
      });
      const mergedCount = result?.mergedOrderIds?.length ?? 0;
      const createdCount = result?.createdOrderIds?.length ?? 0;
      toast.success(
        mergedCount > 0 && createdCount > 0
          ? `已并入 ${mergedCount} 张、新建 ${createdCount} 张`
          : mergedCount > 0
            ? `已并入 ${mergedCount} 张订单`
            : `已新建 ${createdCount} 张订单`,
      );
      // 合并仅发生在非修订模式：syncCartImmediate 会连带清空云端购物车，语义正确
      syncCartImmediate({});
      setCartSheetOpen(false);
      setRemarkMap({});
      setSpecSelections({});
      setMergeDialogOpen(false);
      setMergePlanGroups([]);
      setMergeSelections({});
      void queryClient.invalidateQueries({ queryKey: queryKeys.supplies.all });
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
    } catch (e) {
      // 失败（如目标单已被处理，后端行锁校验拒绝）：toast + 刷新匹配列表，弹窗保留
      toast.error(e instanceof Error ? e.message : "合并失败");
      void refreshMergePlanAfterError();
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * 修订提交核心（“完成修改”与离开守卫“保存修改”共用）：成功返回 true。
   * 成功后总是恢复用户自己的购物车（小程序同款语义：修订购物车只承载工单行，
   * 提交后不得吞掉用户提交前自己的购物车）。
   */
  const doReviseSubmit = async (rid: string): Promise<boolean> => {
    const lines = buildCartPayloadLines();
    if (lines.length === 0) {
      toast.error("请先选择物资");
      return false;
    }
    setSubmitting(true);
    try {
      const updated = await revisePendingSupplyClaimLines(rid, lines);
      // 后端修订可能因独立下单物资拆分出新工单（splitCount 含本单，新工单数需减 1）
      const splitCount = Number((updated as { splitCount?: number } | null)?.splitCount ?? 0);
      const spawnedCount = Math.max(0, splitCount - 1);
      toast.success(spawnedCount > 0 ? `已更新工单，并拆分出 ${spawnedCount} 张新工单` : "已更新工单");
      setReviseClaimId(null);
      reviseActiveRef.current = false;
      restoreOwnCartAfterRevise();
      setCartSheetOpen(false);
      setRemarkMap({});
      setSpecSelections({});
      // 修订改变锁定量，刷新物资列表以展示最新可用库存
      void queryClient.invalidateQueries({ queryKey: queryKeys.supplies.all });
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const doSubmit = async () => {
    const lines = buildCartPayloadLines();
    if (lines.length === 0) {
      toast.error("请先选择物资");
      return;
    }
    setConfirmOpen(false);
    if (reviseClaimId) {
      const ok = await doReviseSubmit(reviseClaimId);
      if (ok) setRecordsPanelOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      await createSupplyClaim(lines);
      toast.success("领用单已提交");
      syncCartImmediate({});
      setCartSheetOpen(false);
      setRemarkMap({});
      setSpecSelections({});
      void queryClient.invalidateQueries({ queryKey: queryKeys.supplies.all });
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const openCartSheet = () => {
    if (cartCount === 0) {
      toast.error("购物车是空的");
      return;
    }
    setCartSheetOpen(true);
  };

  /** 一键清空购物车：修订模式下先退出修订（解除云端写入闸门），再清空——本地与云端一并清空（小程序同款语义） */
  const doClearCart = () => {
    setClearCartConfirmOpen(false);
    const revising = !!reviseClaimId;
    if (revising) {
      // 用户要“全部清空”：不恢复快照；exitReviseMode 先清 reviseActiveRef，
      // 使随后的 syncCartImmediate({}) 能正常写入云端
      exitReviseMode();
    }
    syncCartImmediate({});
    setRemarkMap({});
    setSpecSelections({});
    setCartSheetOpen(false);
    toast.success(revising ? "已清空并退出修改" : "已清空");
  };

  return (
    <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-2">

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">
      {/* 搜索栏 + 操作入口（同一行） */}
      <div className="flex shrink-0 items-center gap-2 bg-[var(--twin-canvas)] px-3 py-2 overflow-visible">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索当前物资"
            className="h-8 w-full max-w-md rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 text-xs outline-none ring-sky-500 focus:ring-2"
          />
        </div>
        {showProcessEntry ? (
          <Link
            to={toAdminRoutePath("/admin/supplies/process")}
            state={{ returnTo: returnToForChild }}
            className="relative rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:opacity-90 whitespace-nowrap"
          >
            物资处理
            {processBadgeText ? (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 leading-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white text-center border border-white">
                {processBadgeText}
              </span>
            ) : null}
          </Link>
        ) : null}
        {showAdminEntry ? (
          <Link
            to={toAdminRoutePath("/admin/supplies/manage")}
            state={{ returnTo: returnToForChild }}
            className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:opacity-90 whitespace-nowrap"
          >
            管理
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => setRecordsPanelOpen(true)}
          className="relative rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-1.5 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft-2)] whitespace-nowrap"
        >
          我的记录
          {mineBadgeText ? (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 leading-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white text-center border border-white">
              {mineBadgeText}
            </span>
          ) : null}
        </button>
        {noveltyCounts.total > 0 ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {noveltyCounts.newItem > 0 ? (
              <span className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-medium text-orange-700 whitespace-nowrap">
                新品 +{noveltyCounts.newItem}
              </span>
            ) : null}
            {noveltyCounts.newInbound > 0 ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700 whitespace-nowrap">
                补货 +{noveltyCounts.newInbound}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-row">
        <aside className="w-[128px] shrink-0 overflow-y-auto border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] py-2">
          <button
            type="button"
            onClick={() => setActiveCat("all")}
            className={`block w-full px-3 py-2 text-left text-xs leading-snug ${
              activeCat === "all" ? "border-l-2 border-sky-500 bg-[var(--twin-canvas)] font-semibold text-sky-700" : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]/80"
            }`}
          >
            全部
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCat(c.id)}
              className={`block w-full px-3 py-2 text-left text-xs leading-snug ${
                activeCat === c.id ? "border-l-2 border-sky-500 bg-[var(--twin-canvas)] font-semibold text-sky-700" : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]/80"
              }`}
            >
              {c.name}
            </button>
          ))}
        </aside>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2">
          {itemsLoading ? <div className="p-4 text-xs text-[var(--twin-mute)]">加载中…</div> : null}
          {!itemsLoading && filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--twin-mute)]">暂无物资</div>
          ) : null}
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${SUPPLIES_MALL_CARD_MIN_COL_PX}px), 1fr))`,
            }}
          >
            {filteredItems.map((item) => {
              const cover = webImageSrc(item.coverUrl);
              const qty = cart[String(item.id)] || 0;
              const hasSpec = (() => {
                if (!item.specSchema) return false;
                try { const p = JSON.parse(item.specSchema); return p.dimensions?.length > 0; }
                catch { return false; }
              })();
              const specDimensions: SpecDimension[] = (() => {
                if (!item.specSchema) return [];
                try { const p = JSON.parse(item.specSchema); return p.dimensions || []; }
                catch { return []; }
              })();
              const dimOrder = specDimensions.map(d => d.name).filter(Boolean);
              const currentSelections = specSelections[item.id] || {};
              const allDimsSelected = dimOrder.length > 0 && dimOrder.every(d => currentSelections[d]);
              const specCartKey = allDimsSelected && hasSpec ? buildSpecCartKey(item.id, currentSelections, dimOrder) : String(item.id);
              const specQty = hasSpec ? (cart[specCartKey] || 0) : qty;

              return (
                <div
                  key={item.id}
                  className="relative flex min-w-0 flex-col rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2 shadow-sm"
                  style={{ minHeight: SUPPLIES_MALL_CARD_MIN_H }}
                >
                  <div className="flex min-w-0 flex-row items-center gap-3">
                  <div
                    className="relative shrink-0 overflow-hidden rounded-md bg-[var(--twin-canvas-soft)]"
                    style={{ width: SUPPLIES_MALL_THUMB_PX, height: SUPPLIES_MALL_THUMB_PX }}
                  >
                    {cover ? (
                      <button
                        type="button"
                        className="absolute inset-0 block"
                        onClick={() => setPreviewSrc(cover)}
                      >
                        <img src={cover} alt="" className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-base font-semibold text-[var(--twin-mute)]">
                        {String(item.name || "?").trim().charAt(0) || "?"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-start gap-1">
                      <span
                        className="min-w-0 shrink truncate text-left text-sm font-semibold leading-snug text-[var(--twin-ink)]"
                        title={String(item.name || "").trim() || undefined}
                      >
                        {item.name}
                      </span>
                      {item.isNewItem ? (
                        <span className="shrink-0 whitespace-nowrap text-[11px] font-bold text-orange-600">新品!</span>
                      ) : null}
                      {item.isNewInbound ? (
                        <span className="shrink-0 whitespace-nowrap text-[11px] font-bold text-emerald-600">进货!</span>
                      ) : null}
                    </div>
                    {item.subtitle ? (
                      <div
                        className="mt-0.5 truncate text-left text-xs text-[var(--twin-mute)]"
                        title={String(item.subtitle || "").trim() || undefined}
                      >
                        {item.subtitle}
                      </div>
                    ) : null}
                    <div className="mt-0.5 truncate text-left text-xs text-[var(--twin-body)]">
                      {item.stockMode === "QUANTIFIED"
                        ? `库存 ${item.availableQty ?? item.stockQty}`
                        : (item.availableQty ?? item.stockQty) >= 1
                          ? "有货"
                          : "缺货"}
                    </div>
                  </div>
                  </div>
                  {!hasSpec ? (
                  <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5 shrink-0">
                    {qty > 0 && (
                      <>
                        <button
                          type="button"
                          className="h-6 w-6 shrink-0 rounded text-xs font-bold text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"
                          onClick={() => decFromCart(String(item.id))}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={qty}
                          onChange={(e) => inputCartQty(item, e.target.value)}
                          className="h-6 w-7 border-0 bg-transparent text-center text-[11px] outline-none"
                        />
                      </>
                    )}
                    <button
                      type="button"
                      className="h-6 w-6 shrink-0 rounded bg-sky-600 text-xs font-bold text-white hover:bg-sky-700"
                      onClick={() => addToCart(item)}
                    >
                      +
                    </button>
                  </div>
                  ) : null}
                  {hasSpec ? (
                    <div className="mt-2 space-y-1.5 border-t border-[var(--twin-hairline)] pt-2">
                      {specDimensions.map((dim) => (
                        <div key={dim.name} className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] font-medium text-[var(--twin-mute)] shrink-0 w-8">{dim.name}</span>
                          {dim.options.filter(o => o.trim()).map((opt) => {
                            const selected = currentSelections[dim.name] === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors ${
                                  selected
                                    ? "bg-sky-600 text-white border-sky-600"
                                    : "border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                                }`}
                                onClick={() => {
                                  setSpecSelections(prev => ({
                                    ...prev,
                                    [item.id]: { ...(prev[item.id] || {}), [dim.name]: opt },
                                  }));
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      {allDimsSelected ? (
                        <div className="absolute bottom-2 right-2 flex items-center gap-2">
                          <span className="text-[10px] text-[var(--twin-mute)]">
                            {dimOrder.map(d => currentSelections[d]).join('·')}
                          </span>
                          <div className="flex items-center gap-0.5 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5">
                            {specQty > 0 && (
                              <>
                                <button
                                  type="button"
                                  className="h-6 w-6 shrink-0 rounded text-xs font-bold text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"
                                  onClick={() => decFromCart(specCartKey)}
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  value={specQty}
                                  onChange={(e) => inputCartQty(item, e.target.value, specCartKey)}
                                  className="h-6 w-7 border-0 bg-transparent text-center text-[11px] outline-none"
                                />
                              </>
                            )}
                            <button
                              type="button"
                              className="h-6 w-6 shrink-0 rounded bg-sky-600 text-xs font-bold text-white hover:bg-sky-700"
                              onClick={() => addToCart(item, specCartKey)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ) : item.specRequired === 1 ? (
                        <div className="text-[10px] text-amber-600">请选择完整规格</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={openCartSheet}
          className="relative rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-4 py-2 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft-2)]"
        >
          购物车
          {cartCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          disabled={submitting || cartCount === 0}
          onClick={() => void openSubmitFlow()}
          className="rounded-full bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 whitespace-nowrap"
        >
          {submitting ? "提交中…" : reviseClaimId ? "完成修改" : "提交领用单"}
        </button>
      </footer>

      {cartSheetOpen ? (
        <div
          className="absolute inset-0 z-40 flex flex-col justify-end bg-black/35"
          onClick={() => setCartSheetOpen(false)}
        >
          <div
            className="mx-2 mb-2 flex min-h-0 max-h-[90%] flex-col overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] shadow-[0_-8px_28px_rgba(0,0,0,0.15)] sm:mx-3 sm:mb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-[var(--twin-hairline)] px-4 py-3 text-sm font-semibold text-[var(--twin-ink)]">购物车</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {cartLines.map((line) => {
                const item = items.find((x) => x.id === line.itemId);
                return (
                  <div key={line.key} className="mb-2 flex gap-2 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
                    {line.cover ? (
                      <img src={line.cover} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-[var(--twin-canvas-soft-2)] text-xs font-bold text-[var(--twin-mute)]">
                        {line.initial}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--twin-ink)]">{line.name}</div>
                      <div className="mt-1 flex items-center gap-0.5">
                        <button
                          type="button"
                          className="h-7 w-7 rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-sm"
                          onClick={() => decFromCart(line.key)}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={line.qty}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const n = Number.parseInt(raw || "0", 10);
                            const max = item ? maxForItem(item) : 999;
                            const safe = Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
                            const next = { ...cart };
                            if (safe <= 0) delete next[line.key];
                            else next[line.key] = safe;
                            syncCart(next);
                            if (Number.isFinite(n) && n > max) toast.error(`最多 ${max}`);
                          }}
                          className="h-7 w-12 rounded border border-[var(--twin-hairline)] text-center text-xs"
                        />
                        <button
                          type="button"
                          className="h-7 w-7 rounded bg-sky-600 text-sm font-bold text-white disabled:opacity-40"
                          disabled={!item}
                          onClick={() => item && addToCart(item, line.key.includes("::") ? line.key : undefined)}
                        >
                          +
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="备注（可选，将计入审计）"
                        value={remarkMap[line.key] || ""}
                        onChange={(e) => setRemarkMap((prev) => ({ ...prev, [line.key]: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-0.5 text-xs text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
              <button
                type="button"
                className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-red-500 disabled:opacity-50"
                disabled={cartCount === 0}
                onClick={() => setClearCartConfirmOpen(true)}
              >
                清空
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--twin-body)]">共 {cartCount} 件</span>
                <button type="button" className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--twin-body)]" onClick={() => setCartSheetOpen(false)}>
                  收起
                </button>
                <button
                  type="button"
                  className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  disabled={submitting || cartCount === 0}
                  onClick={() => void openSubmitFlow()}
                >
                  去提交
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 图片预览弹窗 */}
      {previewSrc ? (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewSrc(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40"
            onClick={() => setPreviewSrc(null)}
          >
            ✕
          </button>
          <img
            src={previewSrc}
            alt="预览"
            className="max-h-[90vh] max-w-[90vw] rounded-[var(--app-radius-container)] object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      {/* 提交确认弹窗 */}
      {confirmOpen ? (
        <Portal>
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-lg rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between shrink-0">
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">{reviseClaimId ? "确认修改领用单" : "确认提交领用单"}</h3>
              <button
                type="button"
                className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)]"
                onClick={() => setConfirmOpen(false)}
              >
                关闭
              </button>
            </div>
            <p className="mb-2 text-xs text-[var(--twin-mute)] shrink-0">请核对以下物品与备注信息，提交后将进入出库处理流程。</p>
            {willSplit || multiIndependent ? (
              <p className="mb-2 text-xs text-amber-600 shrink-0">
                {willSplit ? "含独立下单物资，提交后将自动拆分为多张工单" : "多个独立下单物资将分别生成工单"}
              </p>
            ) : null}
            <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
              {cartLines.map((line) => {
                const item = items.find((x) => x.id === line.itemId);
                return (
                  <div key={line.key} className="flex items-center gap-3 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-sm">
                    {line.cover ? (
                      <img src={line.cover} alt="" className="h-10 w-10 shrink-0 rounded object-cover border border-[var(--twin-hairline)]" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--twin-canvas)] border border-[var(--twin-hairline)] text-xs text-[var(--twin-mute)]">
                        {line.initial}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[var(--twin-ink)] truncate">{line.name}</span>
                        <span className="text-xs text-[var(--twin-mute)] shrink-0">×{line.qty}</span>
                      </div>
                      <input
                        type="text"
                        placeholder="备注（可选，将计入审计）"
                        value={remarkMap[line.key] || ""}
                        onChange={(e) => setRemarkMap((prev) => ({ ...prev, [line.key]: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-0.5 text-xs text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 shrink-0">
              <span className="text-xs text-[var(--twin-mute)]">共 {cartCount} 件</span>
              <div className="flex items-center gap-2">
                <button type="button" className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] whitespace-nowrap" onClick={() => setConfirmOpen(false)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 whitespace-nowrap"
                  disabled={submitting}
                  onClick={() => void doSubmit()}
                >
                  {submitting ? "提交中…" : "确认提交"}
                </button>
              </div>
            </div>
          </div>
        </div>
        </Portal>
      ) : null}

      {/* 智能合并到待处理订单弹窗：按规则分组匹配目标 */}
      {mergeDialogOpen ? (
        <Portal>
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            // 合并请求进行中禁止关闭，避免结果落地时弹窗已消失
            if (!submitting) setMergeDialogOpen(false);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between shrink-0">
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">您还有待处理的订单，是否合并？</h3>
              <button
                type="button"
                className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] disabled:opacity-50"
                disabled={submitting}
                onClick={() => {
                  if (!submitting) setMergeDialogOpen(false);
                }}
              >
                关闭
              </button>
            </div>
            <p className="mb-2 text-xs text-[var(--twin-mute)] shrink-0">
              已按订单类型自动匹配：常规物资只并入常规订单，独立下单物资只并入同物资的独立订单，重复物资数量自动累加。
            </p>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {mergePlanGroups.map((group) => {
                const gk = mergeGroupKey(group);
                const selectedId = mergeSelections[gk] ?? "";
                const newLabel = group.kind === "regular" ? "新建订单" : "新建独立订单";
                return (
                  <div key={gk}>
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--twin-body)]">
                      <span className="truncate">{group.label}</span>
                      {group.kind === "independent" ? (
                        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] text-amber-800">
                          独立下单
                        </span>
                      ) : null}
                    </div>
                    {group.candidates.length === 0 ? (
                      <div className="rounded-twin-md border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-xs text-[var(--twin-mute)]">
                        没有可并入的独立订单，将新建独立订单
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {group.candidates.map((order) => {
                          const selected = selectedId === order.id;
                          return (
                            <button
                              key={order.id}
                              type="button"
                              onClick={() => setMergeSelections((prev) => ({ ...prev, [gk]: order.id }))}
                              className={`flex w-full items-center gap-3 rounded-twin-md border px-3 py-2 text-left text-sm ${
                                selected
                                  ? "border-sky-500 bg-[var(--twin-canvas)]"
                                  : "border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] hover:bg-[var(--twin-canvas)]/80"
                              }`}
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                  selected ? "border-sky-600" : "border-[var(--twin-hairline)]"
                                }`}
                              >
                                {selected ? <span className="h-2 w-2 rounded-full bg-sky-600" /> : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-baseline justify-between gap-2">
                                  <span className={`min-w-0 truncate ${selected ? "font-semibold text-sky-700" : "text-[var(--twin-ink)]"}`}>
                                    {order.applicantName || "我"}
                                  </span>
                                  <span className="shrink-0 text-xs text-[var(--twin-mute)]">
                                    {formatOrderTimeCompact(order.createdAt)}
                                  </span>
                                </span>
                                <span className="block truncate text-xs text-[var(--twin-mute)]">
                                  {summarizeOrderLines(order)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setMergeSelections((prev) => ({ ...prev, [gk]: "" }))}
                          className={`flex w-full items-center gap-3 rounded-twin-md border px-3 py-2 text-left text-sm ${
                            selectedId === ""
                              ? "border-sky-500 bg-[var(--twin-canvas)]"
                              : "border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] hover:bg-[var(--twin-canvas)]/80"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              selectedId === "" ? "border-sky-600" : "border-[var(--twin-hairline)]"
                            }`}
                          >
                            {selectedId === "" ? <span className="h-2 w-2 rounded-full bg-sky-600" /> : null}
                          </span>
                          <span className={selectedId === "" ? "font-semibold text-sky-700" : "text-[var(--twin-ink)]"}>
                            {newLabel}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] disabled:opacity-50 whitespace-nowrap"
                disabled={submitting}
                onClick={() => {
                  setMergeDialogOpen(false);
                  setConfirmOpen(true);
                }}
              >
                直接新建
              </button>
              <button
                type="button"
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 whitespace-nowrap"
                disabled={submitting}
                onClick={() => void doMergeConfirm()}
              >
                {submitting ? "合并中…" : "按方案合并"}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      ) : null}

      {/* 清空购物车确认弹窗 */}
      {clearCartConfirmOpen ? (
        <Portal>
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setClearCartConfirmOpen(false)}
        >
          <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">清空购物车</h3>
              <button
                type="button"
                className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)]"
                onClick={() => setClearCartConfirmOpen(false)}
              >
                关闭
              </button>
            </div>
            <p className="mb-4 text-xs text-[var(--twin-mute)]">
              {reviseClaimId
                ? "将移除购物车中全部物资并退出本次修改，此操作不可撤销。"
                : "将移除购物车中全部物资，此操作不可撤销。"}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] whitespace-nowrap"
                onClick={() => setClearCartConfirmOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white whitespace-nowrap"
                onClick={doClearCart}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
        </Portal>
      ) : null}

      {/* 修订模式离开页面守卫弹窗 */}
      {blocker.state === "blocked" ? (
        <Portal>
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            // 提交进行中禁止关闭，避免结果落地时弹窗已消失
            if (!submitting) blocker.reset();
          }}
        >
          <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">当前正在修改领用单</h3>
              <button
                type="button"
                className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] disabled:opacity-50"
                disabled={submitting}
                onClick={() => blocker.reset()}
              >
                关闭
              </button>
            </div>
            <p className="mb-4 text-xs text-[var(--twin-mute)]">
              离开前可保存本次修改（等同“完成修改”提交），或取消修改并恢复原购物车。关闭弹窗则留在本页继续修改。
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-red-500 disabled:opacity-50 whitespace-nowrap"
                disabled={submitting}
                onClick={() => {
                  exitReviseMode({ restoreCart: true });
                  setRemarkMap({});
                  setSpecSelections({});
                  setCartSheetOpen(false);
                  blocker.proceed();
                }}
              >
                取消修改
              </button>
              <button
                type="button"
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 whitespace-nowrap"
                disabled={submitting}
                onClick={() => {
                  void (async () => {
                    if (!reviseClaimId) {
                      blocker.proceed();
                      return;
                    }
                    // 与“完成修改”共用提交逻辑；成功后恢复原购物车并放行导航，失败留在本页保持修订态
                    const ok = await doReviseSubmit(reviseClaimId);
                    if (ok) blocker.proceed();
                    else blocker.reset();
                  })();
                }}
              >
                {submitting ? "保存中…" : "保存修改"}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      ) : null}

      {/* 我的记录面板 */}
      {recordsPanelOpen ? (
        <MySuppliesRecordsPanel onClose={() => setRecordsPanelOpen(false)} />
      ) : null}
    </div>
    </div>
  );
}
