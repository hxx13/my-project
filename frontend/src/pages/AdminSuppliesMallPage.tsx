/**
 * 领用物资：布局与交互对齐小程序 package-feature/pages/supplies（左侧分类、右侧列表、底部购物车、持久化购物车）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import {
  createSupplyClaim,
  fetchSupplyCart,
  fetchSupplyCategories,
  fetchSupplyClaimDetail,
  fetchSupplyItems,
  revisePendingSupplyClaimLines,
  saveSupplyCart,
  type SupplyCategory,
  type SupplyItem,
} from "@/api/domains/supplies.api";
import { ADMIN_PENDING_BADGES_REFRESH_EVENT } from "@/features/admin/adminPendingBadgesEvents";
import { authStorage, AUTH_USERINFO_UPDATED_EVENT } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { fetchCapabilitySummaryMap, fetchPendingBadges } from "@/api/domains/me.api";
import { fetchPublicPagePermissions, WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED } from "@/api/domains/pagePermission.api";
import type { PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import { webImageSrc } from "@/utils/mediaUrl";

/** 物资列表单列最小宽度（px）：与步进器同排保证可读；禁止再缩小以免字被挤没；仅改此数值即可调列宽。 */
const SUPPLIES_MALL_CARD_MIN_COL_PX = 300;

const LEGACY_WEB_CART_PREFIX = "aro_web_supplies_cart_v1_";

/** 仅用于迁移旧版本「仅本机 localStorage」购物车到云端。 */
function readLegacyWebSuppliesCart(userId: string): Record<number, number> {
  const id = userId.trim();
  if (!id) return {};
  try {
    const raw = localStorage.getItem(`${LEGACY_WEB_CART_PREFIX}${id}`);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const cart: Record<number, number> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const itemId = Number(k);
      const qty = Number(v);
      if (Number.isFinite(itemId) && itemId > 0 && Number.isFinite(qty) && qty > 0) {
        cart[itemId] = Math.min(Math.floor(qty), 999);
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
  const role = authStorage.getRole() || "STUDENT";
  const superOk = hasMinRole(role, "SUPER_ADMIN");

  const [permNodes, setPermNodes] = useState<PublicPagePermissionNode[]>([]);
  const [capMap, setCapMap] = useState<Record<string, { canProcess: boolean }>>({});
  const [categories, setCategories] = useState<SupplyCategory[]>([]);
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [reviseClaimId, setReviseClaimId] = useState<string | null>(null);
  const [mineBadgeText, setMineBadgeText] = useState("");
  const [processBadgeText, setProcessBadgeText] = useState("");
  const reviseBootstrappedRef = useRef<string | null>(null);
  const cartRef = useRef<Record<number, number>>({});
  const remoteSaveTimerRef = useRef<number | null>(null);
  const [authUserId, setAuthUserId] = useState(() => authStorage.getUserInfo()?.id?.trim() || "");

  const claimCap = capMap.SUPPLIES_CLAIM;
  const adminCap = capMap.SUPPLIES_ADMIN;
  /** 与小程序 supplies/index：showProcessEntry / showAdminEntry 对齐（能力策略 + WEB 侧栏入口权限）。 */
  const showProcessEntry = superOk && !!claimCap?.canProcess;
  const showAdminEntry =
    superOk &&
    !!adminCap?.canProcess &&
    canShowWebEntry(permNodes, "/admin/supplies/manage", "sidebar", role, "SUPER_ADMIN");

  const flushRemoteCart = useCallback(async (payload: Record<number, number>) => {
    try {
      await saveSupplyCart(payload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "购物车同步失败");
    }
  }, []);

  const syncCartImmediate = useCallback(
    (next: Record<number, number>) => {
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

  /** 保存后仅合并当前购物车并防抖同步云端，禁止整表 load；云端与小程序同源。post-save-no-full-refresh.mdc */
  const syncCart = useCallback(
    (next: Record<number, number>) => {
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
      const remote = await fetchSupplyCart();
      let merged: Record<number, number> = { ...remote };
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

  const loadCategories = useCallback(async () => {
    try {
      const data = await fetchSupplyCategories();
      setCategories(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载分类失败");
    }
  }, []);

  const loadItems = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await fetchSupplyItems(activeCat === "all" ? undefined : activeCat);
        setItems((data || []).map(normalizeNovelty));
      } catch (e) {
        if (!silent) toast.error(e instanceof Error ? e.message : "加载物资失败");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [activeCat],
  );

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

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    const refresh = () => void loadItems(true);
    const timer = window.setInterval(refresh, 30000);
    const onFocus = () => refresh();
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadItems]);

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

  const maxForItem = (item: SupplyItem | undefined) => {
    if (!item) return 0;
    if (item.stockMode === "QUANTIFIED") return Math.max(0, Number(item.stockQty) || 0);
    return Number(item.stockQty) >= 1 ? 99 : 0;
  };

  const reconcileCartWithStock = useCallback(
    (list: SupplyItem[]) => {
      const next = { ...cart };
      let changed = false;
      for (const it of list) {
        const id = it.id;
        if (next[id] == null) continue;
        const max = maxForItem(it);
        if (max <= 0) {
          delete next[id];
          changed = true;
        } else if (next[id] > max) {
          next[id] = max;
          changed = true;
        }
      }
      if (changed) syncCart(next);
    },
    [cart, syncCart],
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
        const nextCart: Record<number, number> = {};
        for (const line of d.lines || []) {
          const iid = Number(line.itemId);
          const q = Number(line.qty);
          if (Number.isFinite(iid) && iid > 0 && Number.isFinite(q) && q > 0) {
            nextCart[iid] = Math.min(Math.floor(q), 999);
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
    const out: { id: number; name: string; cover?: string; initial: string; qty: number }[] = [];
    for (const [k, qty] of Object.entries(cart)) {
      const id = Number(k);
      const q = Number(qty);
      if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(q) || q <= 0) continue;
      const it = items.find((x) => x.id === id);
      const name = it?.name || "物资";
      const ch = String(name).trim().charAt(0) || "?";
      out.push({
        id,
        name,
        cover: webImageSrc(it?.coverUrl),
        initial: ch,
        qty: q,
      });
    }
    return out;
  }, [cart, items]);

  const addToCart = (item: SupplyItem) => {
    const max = maxForItem(item);
    if (max <= 0) {
      toast.error("暂无库存");
      return;
    }
    const cur = cart[item.id] || 0;
    const nextQty = Math.min(cur + 1, max);
    syncCart({ ...cart, [item.id]: nextQty });
  };

  const decFromCart = (itemId: number) => {
    const cur = (cart[itemId] || 0) - 1;
    const next = { ...cart };
    if (cur <= 0) delete next[itemId];
    else next[itemId] = cur;
    syncCart(next);
  };

  const inputCartQty = (item: SupplyItem, raw: string) => {
    const max = maxForItem(item);
    const n = Number.parseInt(raw || "0", 10);
    const safe = Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
    const next = { ...cart };
    if (safe <= 0) delete next[item.id];
    else next[item.id] = safe;
    syncCart(next);
    if (Number.isFinite(n) && n > max) toast.error(`最多可下单 ${max}`);
  };

  const submitOrder = async () => {
    const lines = Object.entries(cart)
      .map(([itemId, qty]) => ({ itemId: Number(itemId), qty }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) {
      toast.error("请先选择物资");
      return;
    }
    setSubmitting(true);
    try {
      if (reviseClaimId) {
        await revisePendingSupplyClaimLines(reviseClaimId, lines);
        toast.success("已更新工单");
        setReviseClaimId(null);
        syncCartImmediate({});
        setCartSheetOpen(false);
        await loadItems(true);
        window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
        navigate("/admin/supplies/mine");
        return;
      }
      await createSupplyClaim(lines);
      toast.success("领用单已提交");
      syncCartImmediate({});
      setCartSheetOpen(false);
      await loadItems(true);
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
      <div className="shrink-0">
        <h2 className="text-lg font-semibold text-slate-800">领用物资</h2>
        <p className="text-xs text-slate-500">
          选择分类与数量，提交后待管理员确认出库（下单不占库存）。购物车已保存到服务端，与小程序领用物资页同一账号互通，换设备可继续选购。
        </p>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#f4f5f7] shadow-sm">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索当前物资"
            className="h-8 w-full max-w-md rounded-full border border-slate-200 bg-slate-50 px-3 text-xs outline-none ring-sky-500 focus:ring-2"
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {showProcessEntry ? (
            <Link
              to="/admin/supplies/process"
              state={{ returnTo: returnToForChild }}
              className="relative rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:opacity-90"
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
              to="/admin/supplies/manage"
              state={{ returnTo: returnToForChild }}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:opacity-90"
            >
              管理
            </Link>
          ) : null}
          <Link
            to="/admin/supplies/mine"
            state={{ returnTo: returnToForChild }}
            className="relative rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            我的记录
            {mineBadgeText ? (
              <span className="absolute -right-1 -top-1 min-h-[16px] min-w-[16px] rounded-full bg-sky-500 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-white">
                {mineBadgeText}
              </span>
            ) : null}
          </Link>
        </div>
      </header>

      {noveltyCounts.total > 0 ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          近期更新：上新 {noveltyCounts.newItem} 件，进货 {noveltyCounts.newInbound} 件
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-row">
        <aside className="w-[128px] shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 py-2">
          <button
            type="button"
            onClick={() => setActiveCat("all")}
            className={`block w-full px-3 py-2 text-left text-xs leading-snug ${
              activeCat === "all" ? "border-l-2 border-sky-500 bg-white font-semibold text-sky-700" : "text-slate-600 hover:bg-white/80"
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
                activeCat === c.id ? "border-l-2 border-sky-500 bg-white font-semibold text-sky-700" : "text-slate-600 hover:bg-white/80"
              }`}
            >
              {c.name}
            </button>
          ))}
        </aside>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2">
          {loading ? <div className="p-4 text-xs text-slate-500">加载中…</div> : null}
          {!loading && filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">暂无物资</div>
          ) : null}
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${SUPPLIES_MALL_CARD_MIN_COL_PX}px), 1fr))`,
            }}
          >
            {filteredItems.map((item) => {
              const cover = webImageSrc(item.coverUrl);
              const qty = cart[item.id] || 0;
              return (
                <div
                  key={item.id}
                  className="flex min-w-0 flex-row gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                    {cover ? (
                      <button
                        type="button"
                        className="absolute inset-0 block"
                        onClick={() => window.open(cover, "_blank", "noopener,noreferrer")}
                      >
                        <img src={cover} alt="" className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-400">
                        {String(item.name || "?").trim().charAt(0) || "?"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center justify-start gap-1">
                        <span
                          className="min-w-0 shrink truncate text-left text-xs font-semibold leading-snug text-slate-900"
                          title={String(item.name || "").trim() || undefined}
                        >
                          {item.name}
                        </span>
                        {item.isNewItem ? (
                          <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-orange-600">新品!</span>
                        ) : null}
                        {item.isNewInbound ? (
                          <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-emerald-600">进货!</span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                        <button
                          type="button"
                          className={`h-6 w-6 shrink-0 rounded text-xs font-bold ${qty <= 0 ? "text-slate-300" : "text-slate-700 hover:bg-white"}`}
                          disabled={qty <= 0}
                          onClick={() => decFromCart(item.id)}
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
                    </div>
                    {item.subtitle ? (
                      <div
                        className="mt-0.5 truncate text-left text-[11px] text-slate-500"
                        title={String(item.subtitle || "").trim() || undefined}
                      >
                        {item.subtitle}
                      </div>
                    ) : null}
                    <div className="mt-0.5 truncate text-left text-[11px] text-slate-600">
                      {item.stockMode === "QUANTIFIED" ? `库存 ${item.stockQty}` : item.stockQty >= 1 ? "有货" : "缺货"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={openCartSheet}
          className="relative rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
          onClick={() => void submitOrder()}
          className="rounded-full bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
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
            className="mx-2 mb-2 flex min-h-0 max-h-[90%] flex-col overflow-hidden rounded-xl bg-white shadow-[0_-8px_28px_rgba(0,0,0,0.15)] sm:mx-3 sm:mb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">购物车</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {cartLines.map((line) => {
                const item = items.find((x) => x.id === line.id);
                return (
                  <div key={line.id} className="mb-2 flex gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2">
                    {line.cover ? (
                      <img src={line.cover} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-slate-200 text-xs font-bold text-slate-500">
                        {line.initial}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{line.name}</div>
                      <div className="mt-1 flex items-center gap-0.5">
                        <button
                          type="button"
                          className="h-7 w-7 rounded border border-slate-200 bg-white text-sm"
                          onClick={() => decFromCart(line.id)}
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
                            if (safe <= 0) delete next[line.id];
                            else next[line.id] = safe;
                            syncCart(next);
                            if (Number.isFinite(n) && n > max) toast.error(`最多 ${max}`);
                          }}
                          className="h-7 w-12 rounded border border-slate-200 text-center text-xs"
                        />
                        <button
                          type="button"
                          className="h-7 w-7 rounded bg-sky-600 text-sm font-bold text-white disabled:opacity-40"
                          disabled={!item}
                          onClick={() => item && addToCart(item)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-4 py-3">
              <span className="text-xs text-slate-600">共 {cartCount} 件</span>
              <button type="button" className="text-xs font-medium text-sky-600 hover:underline" onClick={() => setCartSheetOpen(false)}>
                收起
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </div>
  );
}
