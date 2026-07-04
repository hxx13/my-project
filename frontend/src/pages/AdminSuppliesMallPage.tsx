/**
 * 领用物资：布局与交互对齐小程序 package-feature/pages/supplies（左侧分类、右侧列表、底部购物车、持久化购物车）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import {
  createSupplyClaim,
  fetchSupplyCart,
  fetchSupplyClaimDetail,
  revisePendingSupplyClaimLines,
  saveSupplyCart,
  type SupplyCategory,
  type SupplyItem,
} from "@/api/domains/supplies.api";
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
  const cartRef = useRef<Record<string, number>>({});
  const remoteSaveTimerRef = useRef<number | null>(null);
  const [authUserId, setAuthUserId] = useState(() => authStorage.getUserInfo()?.id?.trim() || "");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [remarkMap, setRemarkMap] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recordsPanelOpen, setRecordsPanelOpen] = useState(false);
  const [specSelections, setSpecSelections] = useState<Record<number, Record<string, string>>>({});

  const claimCap = capMap.SUPPLIES_CLAIM;
  const adminCap = capMap.SUPPLIES_ADMIN;
  const showProcessEntry = superOk && !!claimCap?.canProcess;
  const showAdminEntry =
    superOk &&
    !!adminCap?.canProcess &&
    canShowWebEntry(permNodes, "/admin/supplies/manage", "sidebar", role, "SUPER_ADMIN");

  const { data: categories = [] } = useSupplyCategories();
  const { data: rawItems = [], isLoading: itemsLoading } = useSupplyItems(activeCat);

  const items = useMemo(() => rawItems.map(normalizeNovelty), [rawItems]);

  const flushRemoteCart = useCallback(async (payload: Record<string, number>) => {
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
    const uid = authUserId.trim();
    if (!uid) {
      cartRef.current = {};
      setCart({});
      return;
    }
    try {
      const remote = await fetchSupplyCart() as unknown as Record<string, number>;
      let merged: Record<string, number> = { ...remote };
      const legacy = readLegacyWebSuppliesCart(uid);
      if (Object.keys(merged).length === 0 && Object.keys(legacy).length > 0) {
        merged = legacy;
        await saveSupplyCart(merged);
        clearLegacyWebSuppliesCart(uid);
      }
      cartRef.current = merged;
      setCart(merged);
    } catch (e) {
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
    const parts = dimOrder.filter(d => selections[d]).map(d => `${d}=${selections[d]}`);
    return parts.length > 0 ? `${itemId}::${parts.join('|')}` : String(itemId);
  };

  const maxForItem = (item: SupplyItem | undefined) => {
    if (!item) return 0;
    if (item.stockMode === "QUANTIFIED") return Math.max(0, Number(item.stockQty) || 0);
    return Number(item.stockQty) >= 1 ? 99 : 0;
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
    [searchParams, setSearchParams, syncCartImmediate],
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

  const doSubmit = async () => {
    const lines = Object.entries(cart)
      .map(([cartKey, qty]) => {
        const iid = itemIdFromCartKey(cartKey);
        const specSnapshot = specSnapshotFromCartKey(cartKey);
        return { itemId: iid, qty, remark: remarkMap[cartKey]?.trim() || undefined, specSnapshot };
      })
      .filter((l) => l.qty > 0 && l.itemId > 0);
    if (lines.length === 0) {
      toast.error("请先选择物资");
      return;
    }
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      if (reviseClaimId) {
        await revisePendingSupplyClaimLines(reviseClaimId, lines);
        toast.success("已更新工单");
        setReviseClaimId(null);
        syncCartImmediate({});
        setCartSheetOpen(false);
        setRemarkMap({});
        setSpecSelections({});
        window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
        setRecordsPanelOpen(true);
        return;
      }
      await createSupplyClaim(lines);
      toast.success("领用单已提交");
      syncCartImmediate({});
      setCartSheetOpen(false);
      setRemarkMap({});
      setSpecSelections({});
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

  return (
    <div className="flex h-[calc(100dvh-8rem)] max-h-[calc(100dvh-8rem)] min-h-0 flex-col gap-2">
      {/* 标题栏：左侧标题+副标题，右侧操作入口（与小程序布局一致） */}
      <div className="shrink-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--twin-ink)]">领用物资</h2>
          <p className="text-xs text-[var(--twin-mute)] mt-0.5">
            选择分类与数量，提交后待管理员确认出库（下单不占库存）。购物车已保存到服务端，与小程序领用物资页同一账号互通，换设备可继续选购。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {showProcessEntry ? (
            <Link
              to={toAdminRoutePath("/admin/supplies/process")}
              state={{ returnTo: returnToForChild }}
              className="relative rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:opacity-90 whitespace-nowrap"
            >
              物资处理
              {processBadgeText ? (
                <span className="absolute -right-1 -top-1 min-h-[16px] min-w-[16px] max-w-[28px] truncate rounded-full bg-amber-600 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-white">
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
              <span className="absolute -right-1 -top-1 min-h-[16px] min-w-[16px] rounded-full bg-sky-500 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-white">
                {mineBadgeText}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">
      {/* 搜索栏 + 近期更新标签（内联合并，消除独立横幅行） */}
      <div className="flex shrink-0 items-center gap-2 bg-[var(--twin-canvas)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索当前物资"
            className="h-8 w-full max-w-md rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 text-xs outline-none ring-sky-500 focus:ring-2"
          />
        </div>
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
                  className="flex min-w-0 flex-col rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2 shadow-sm"
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center justify-start gap-1">
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
                      {!hasSpec ? (
                      <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5">
                        <button
                          type="button"
                          className={`h-6 w-6 shrink-0 rounded text-xs font-bold ${qty <= 0 ? "text-[var(--twin-mute)]" : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"}`}
                          disabled={qty <= 0}
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
                        <button
                          type="button"
                          className="h-6 w-6 shrink-0 rounded bg-sky-600 text-xs font-bold text-white hover:bg-sky-700"
                          onClick={() => addToCart(item)}
                        >
                          +
                        </button>
                      </div>
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
                      {item.stockMode === "QUANTIFIED" ? `库存 ${item.stockQty}` : item.stockQty >= 1 ? "有货" : "缺货"}
                    </div>
                  </div>
                  </div>
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
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[10px] text-[var(--twin-mute)]">
                            {dimOrder.map(d => currentSelections[d]).join('·')}
                          </span>
                          <div className="flex items-center gap-0.5 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5">
                            <button
                              type="button"
                              className={`h-6 w-6 shrink-0 rounded text-xs font-bold ${specQty <= 0 ? "text-[var(--twin-mute)]" : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"}`}
                              disabled={specQty <= 0}
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
          onClick={() => setConfirmOpen(true)}
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
            <div className="flex shrink-0 items-center justify-between border-t border-[var(--twin-hairline)] px-4 py-3">
              <span className="text-xs text-[var(--twin-body)]">共 {cartCount} 件</span>
              <div className="flex items-center gap-2">
                <button type="button" className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs text-[var(--twin-body)]" onClick={() => setCartSheetOpen(false)}>
                  收起
                </button>
                <button
                  type="button"
                  className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  disabled={cartCount === 0}
                  onClick={() => setConfirmOpen(true)}
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

      {/* 我的记录面板 */}
      {recordsPanelOpen ? (
        <MySuppliesRecordsPanel onClose={() => setRecordsPanelOpen(false)} />
      ) : null}
    </div>
    </div>
  );
}
