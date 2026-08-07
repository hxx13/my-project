/**
 * 学生物品申领商城 — 布局对齐管理后台物资商城（AdminSuppliesMallPage）
 * 底部栏 + 上滑Sheet 模式，保留学生独有：预约领取、需求建议、审核流程
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ShoppingCart, Plus, Minus, Send, Package, Lightbulb,
  Loader2, X, Clock, Pencil, Search, ClipboardList, ChevronRight,
} from "lucide-react";
import { useMaterialCategories, useMaterialItems, useMaterialCart, useSaveMaterialCart, useCreateMaterialRequest } from "@/api/hooks/useMaterial";
import { createMaterialDemand } from "@/api/domains/material.api";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { resolveMaterialApplicantGroupForStudentSession } from "@/features/student/materialApplicant";
import type { MaterialItem } from "@/api/domains/material.api";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { StudentCard, Skeleton, EmptyState, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui";
import { maxQtyForMaterialItem, hasSpecSchema, sumCartQtyForItem } from "@/utils/materialSpecHelpers";
import { MaterialSpecPickControl } from "@/components/material/MaterialSpecPickerSheet";
import { cn } from "@/lib/utils";
import { webImageSrc } from "@/utils/mediaUrl";
import { Portal } from "@/components/Portal";
import MyMaterialRecordsPanel from "@/components/material/MyMaterialRecordsPanel";
import StudentMaterialRequestsView from "./student-material-requests";
import toast from "react-hot-toast";

export const STUDENT_MATERIAL_ROUTE = "/student/material";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatSpecLabel(specJson: string | undefined | null): string {
  if (!specJson) return "";
  try { return Object.values(JSON.parse(specJson)).join("·"); }
  catch { return ""; }
}

function parseSpecKey(specKey: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!specKey) return result;
  for (const part of specKey.split("|")) {
    const eq = part.indexOf("=");
    if (eq > 0) result[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return result;
}

function parseCartKey(key: string): { itemId: number; specKey: string } {
  const idx = key.indexOf("::");
  if (idx === -1) return { itemId: Number(key), specKey: "" };
  return { itemId: Number(key.slice(0, idx)), specKey: key.slice(idx + 2) };
}

/* ------------------------------------------------------------------ */
/*  MaterialItemCard (novelty badges + image preview + spec picker)    */
/* ------------------------------------------------------------------ */

function MaterialItemCard({
  item, cart, maxStock, onCartChange, onPreviewCover,
}: {
  item: MaterialItem; cart: Record<string, number>;
  maxStock?: number; onCartChange: (key: string, delta: number) => void;
  onPreviewCover: (src: string) => void;
}) {
  const hasSpecs = hasSpecSchema(item.specSchema);
  const cartKey = String(item.id);
  const cartQty = sumCartQtyForItem(cart, item.id);

  const effectiveMax = maxStock ?? maxQtyForMaterialItem(item);
  const soldOut = effectiveMax <= 0;
  const atCap = cartQty >= effectiveMax;

  const cover = webImageSrc(item.coverUrl);
  const coverChar = String(item.name || "?").trim().charAt(0) || "?";

  const stockLabel = item.stockMode === "UNLIMITED" ? "无限"
    : effectiveMax <= 0 ? "售罄"
    : effectiveMax <= 3 ? `仅剩 ${effectiveMax} 件`
    : `库存 ${effectiveMax}`;
  const stockPillCls = item.stockMode === "UNLIMITED"
    ? "bg-[var(--student-success-soft)] text-[var(--student-success)]"
    : effectiveMax <= 0 ? "bg-[var(--student-danger-soft)] text-[var(--student-danger)]"
    : effectiveMax <= 3 ? "bg-[var(--student-warning-soft)] text-[var(--student-warning)]"
    : "bg-[var(--student-canvas-soft)] text-[var(--student-mute)]";

  return (
    <StudentCard className="relative flex flex-col overflow-hidden hover:shadow-md hover:border-[var(--student-primary)]/20 transition-all duration-150" style={{ minHeight: "14rem" }}>
      {/* Cover image — full width top area */}
      <button type="button" className="relative w-full h-32 bg-[var(--student-canvas-soft)] flex items-center justify-center overflow-hidden"
        onClick={() => cover && onPreviewCover(cover)} disabled={!cover}>
        {cover ? <img src={cover} alt={item.name} className="w-full h-full object-cover" />
          : <span className="text-3xl font-bold text-[var(--student-primary)]/20">{coverChar}</span>}
        {/* Novelty badges overlaid on image */}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {item.isNewItem && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">新品</span>}
          {item.lastInboundAt && !item.isNewItem && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">补货</span>}
        </div>
      </button>
      {/* Info area */}
      <div className="flex flex-col gap-1 px-3 pt-2.5 pb-3">
        <h4 className="text-[14px] font-semibold text-[var(--student-ink)] truncate">{item.name}</h4>
        <p className="text-[12px] text-[var(--student-mute)] truncate">{item.subtitle || " "}</p>
        <div className="flex items-center justify-between mt-1">
          <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", stockPillCls)}>{stockLabel}</span>
          {/* Stepper / spec picker */}
          {hasSpecs ? (
            <MaterialSpecPickControl
              item={item} cart={cart} variant="student" disabled={soldOut}
              onAddKey={(key) => onCartChange(key, 1)} onDecKey={(key) => onCartChange(key, -1)}
              onAddPlain={() => onCartChange(cartKey, 1)} onDecPlain={() => onCartChange(cartKey, -1)}
            />
          ) : (
            <div className="flex items-center gap-0.5 rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] p-0.5">
              {cartQty > 0 && (
                <>
                  <button type="button" onClick={() => onCartChange(cartKey, -1)}
                    className="h-6 w-6 shrink-0 rounded text-xs font-bold text-[var(--student-body)] hover:bg-[var(--student-canvas)]">−</button>
                  <input type="number" min={0} value={cartQty}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value || "0", 10);
                      const safe = Number.isFinite(n) ? Math.max(0, Math.min(effectiveMax, n)) : 0;
                      if (safe !== cartQty) onCartChange(cartKey, safe - cartQty);
                    }}
                    className="h-6 w-7 border-0 bg-transparent text-center text-[11px] outline-none" />
                </>
              )}
              <button type="button" onClick={() => { if (!soldOut) onCartChange(cartKey, 1); }}
                disabled={atCap || soldOut}
                className={cn("h-6 w-6 shrink-0 rounded text-xs font-bold text-white", atCap || soldOut ? "bg-[var(--student-hairline)] text-[var(--student-mute)] cursor-not-allowed" : "bg-[var(--student-primary)] hover:opacity-90")}>+</button>
            </div>
          )}
        </div>
      </div>
    </StudentCard>
  );
}

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */

export default function StudentMaterialPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCat = searchParams.get("category");

  /* ── Remote state ── */
  const { data: categories } = useMaterialCategories();
  const [activeCategoryId, setActiveCategoryId] = useState<number | undefined>(initialCat ? Number(initialCat) : undefined);
  const { data: items, isLoading: itemsLoading } = useMaterialItems(activeCategoryId);
  const { data: allItems } = useMaterialItems(undefined);
  const { data: cart } = useMaterialCart();
  const saveCart = useSaveMaterialCart();
  const createRequest = useCreateMaterialRequest();

  /* ── Local UI state ── */
  const [searchKeyword, setSearchKeyword] = useState("");
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [demandText, setDemandText] = useState("");
  const [demandSubmitting, setDemandSubmitting] = useState(false);
  const [showDemandForm, setShowDemandForm] = useState(false);
  const [demandEntryVisible, setDemandEntryVisible] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearCartOpen, setClearCartOpen] = useState(false);
  const [scheduledPickupTime, setScheduledPickupTime] = useState<string | null>(null);
  const [showPickupPicker, setShowPickupPicker] = useState(false);
  const [remarkMap, setRemarkMap] = useState<Record<string, string>>({});
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [recordsPanelOpen, setRecordsPanelOpen] = useState(false);
  const [view, setView] = useState<"shop" | "requests">(() => searchParams.get("view") === "requests" ? "requests" : "shop");

  useEffect(() => {
    fetchPublicRuntimeConfig().then(cfg => setDemandEntryVisible(cfg["material.demand_entry_visible"] !== "false")).catch(() => {});
  }, []);

  /* ── Derived ── */
  const cartCount = useMemo(() => cart ? Object.values(cart).reduce((a, b) => a + b, 0) : 0, [cart]);

  const noveltyCounts = useMemo(() => {
    if (!items) return { newItem: 0, newInbound: 0, total: 0 };
    let newItem = 0, newInbound = 0;
    for (const it of items) {
      if (it.isNewItem) newItem++;
      if (it.lastInboundAt && !it.isNewItem) newInbound++;
    }
    return { newItem, newInbound, total: newItem + newInbound };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter(it => String(it.name || "").toLowerCase().includes(kw) || String(it.subtitle || "").toLowerCase().includes(kw));
  }, [items, searchKeyword]);

  /** Cart lines for sheet */
  const cartLines = useMemo(() => {
    if (!cart || !items) return [];
    const out: { key: string; itemId: number; specLabel: string; name: string; cover?: string; initial: string; qty: number }[] = [];
    for (const [k, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const { itemId, specKey } = parseCartKey(k);
      const it = items.find(x => x.id === itemId);
      const nm = it?.name || "物品";
      out.push({
        key: k, itemId, qty,
        specLabel: specKey ? formatSpecLabel(JSON.stringify(parseSpecKey(specKey))) : "",
        name: specKey ? `${nm}（${formatSpecLabel(JSON.stringify(parseSpecKey(specKey)))}）` : nm,
        cover: webImageSrc(it?.coverUrl),
        initial: String(nm).trim().charAt(0) || "?",
      });
    }
    return out;
  }, [cart, items]);

  /** Independent-order split warning */
  const { willSplit, multiIndependent } = useMemo(() => {
    const lookup = allItems?.length ? allItems : items || [];
    const indep = new Set<number>(), reg = new Set<number>();
    for (const [key, qty] of Object.entries(cart || {})) {
      if (qty <= 0) continue;
      const { itemId } = parseCartKey(key);
      const it = lookup.find(x => x.id === itemId);
      if (!it) continue;
      (it.independentOrder === 1 ? indep : reg).add(itemId);
    }
    return { willSplit: indep.size > 0 && reg.size > 0, multiIndependent: indep.size > 1 };
  }, [cart, items, allItems]);

  /* ── Pickup presets ── */
  const pickupPresets = useMemo(() => {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    const at = new Date(now); at.setDate(at.getDate() + 2);
    return [{ label: "后天", iso: `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}` }];
  }, []);
  const pickupTimeLabel = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `预约 ${parseInt(m[2])}月${parseInt(m[3])}日 领取` : "";
  };

  /* ── Cart actions ── */
  const updateCartQty = useCallback((key: string, delta: number, maxStock?: number) => {
    if (!cart) return;
    const next = { ...cart };
    const cap = maxStock != null ? Math.min(999, maxStock) : 999;
    const nv = Math.max(0, Math.min(cap, (next[key] || 0) + delta));
    if (nv <= 0) { delete next[key]; setRemarkMap(p => { const r = { ...p }; delete r[key]; return r; }); }
    else next[key] = nv;
    saveCart.mutate(next);
  }, [cart, saveCart]);

  const handleClearCart = useCallback(() => {
    setClearCartOpen(false);
    saveCart.mutate({});
    setRemarkMap({});
    setCartSheetOpen(false);
    toast.success("已清空申领栏");
  }, [saveCart]);

  const buildCartLines = () =>
    Object.entries(cart || {}).filter(([, qty]) => qty > 0).map(([key, qty]) => {
      const { itemId, specKey } = parseCartKey(key);
      return { itemId, qty, specSnapshot: specKey ? JSON.stringify(parseSpecKey(specKey)) : undefined, remark: remarkMap[key]?.trim() || undefined };
    });

  const handleSubmit = useCallback(async (pickupTime?: string | null) => {
    if (!cart || cartCount === 0) return;
    const group = resolveMaterialApplicantGroupForStudentSession();
    try {
      const data = await createRequest.mutateAsync({ lines: buildCartLines(), applicantGroup: group, scheduledPickupTime: pickupTime ?? null });
      saveCart.mutate({}); setRemarkMap({}); setScheduledPickupTime(null); setShowPickupPicker(false);
      toast.success(`已提交 ${Array.isArray(data) ? data.length : 1} 张申领单`);
      setView("requests");
    } catch (e) { toast.error(e instanceof Error ? e.message : "提交失败"); }
  }, [cart, cartCount, remarkMap, createRequest, saveCart, navigate]);

  /* ── Render ── */
  return (
    <AdminPageShell fillHeight>
      <div className="flex min-h-0 flex-1 flex-col">

        {/* ════════════ Top operation bar (对齐 admin) ════════════ */}
        <div className="flex shrink-0 items-center gap-2 bg-[var(--student-surface)] px-3 py-2 border-b border-[var(--student-hairline)] overflow-visible">
          <div className="min-w-0 flex-1">
            <input type="text" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)}
              placeholder="搜索物品名称、描述"
              className="h-8 w-full max-w-md rounded-full border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 text-xs outline-none focus:ring-2 focus:ring-[var(--student-primary)]/20 focus:border-[var(--student-primary)] transition-shadow" />
          </div>
          <button onClick={() => setView("requests")}
            className="relative rounded-full border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-1.5 text-xs font-medium text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)] whitespace-nowrap">
            我的申领
          </button>
          <button onClick={() => setRecordsPanelOpen(true)}
            className="relative rounded-full border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-1.5 text-xs font-medium text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)] whitespace-nowrap">
            <ClipboardList className="size-3.5 mr-1 inline" />我的记录
          </button>
          {noveltyCounts.total > 0 && (
            <div className="flex shrink-0 items-center gap-1.5">
              {noveltyCounts.newItem > 0 && <span className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-medium text-orange-700 whitespace-nowrap">新品 +{noveltyCounts.newItem}</span>}
              {noveltyCounts.newInbound > 0 && <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700 whitespace-nowrap">补货 +{noveltyCounts.newInbound}</span>}
            </div>
          )}
        </div>

        {/* ════════════ Body: shop or requests sub-view ════════════ */}
        {view === "requests" ? (
          <StudentMaterialRequestsView onBack={() => setView("shop")} />
        ) : (
        <div className="flex min-h-0 flex-1 relative">
          {/* Category sidebar */}
          <aside className="w-[128px] shrink-0 overflow-y-auto border-r border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] py-2">
            <button onClick={() => setActiveCategoryId(undefined)}
              className={cn("block w-full px-3 py-2 text-left text-xs leading-snug border-l-[3px]",
                !activeCategoryId ? "border-l-[var(--student-primary)] bg-[var(--student-canvas)] font-semibold text-[var(--student-primary)]"
                                  : "text-[var(--student-body)] hover:bg-[var(--student-canvas)]/80 border-l-transparent")}>
              全部
            </button>
            {categories?.map(c => (
              <button key={c.id} onClick={() => setActiveCategoryId(c.id)}
                className={cn("block w-full px-3 py-2 text-left text-xs leading-snug border-l-[3px]",
                  activeCategoryId === c.id ? "border-l-[var(--student-primary)] bg-[var(--student-canvas)] font-semibold text-[var(--student-primary)]"
                                            : "text-[var(--student-body)] hover:bg-[var(--student-canvas)]/80 border-l-transparent")}>
                {c.name}
              </button>
            ))}
          </aside>

          {/* Items grid */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2">
            {itemsLoading ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[120px]" />)}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <EmptyState icon={Package} title={searchKeyword.trim() ? "未找到匹配物品" : "暂无上架物品"} />
              </div>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
                {filteredItems.map(item => (
                  <MaterialItemCard key={item.id} item={item} cart={cart || {}}
                    maxStock={item.stockMode === "UNLIMITED" ? undefined : item.stockQty || 0}
                    onCartChange={(k, d) => updateCartQty(k, d, item.stockMode === "UNLIMITED" ? undefined : item.stockQty || 0)}
                    onPreviewCover={src => setPreviewSrc(src)} />
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {view === "shop" && (
        <div className="contents">
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--student-hairline)] bg-[var(--student-surface)] px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <button type="button" onClick={() => { if (cartCount === 0) { toast.error("申领栏是空的"); return; } setCartSheetOpen(true); }}
            className="relative rounded-full border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-4 py-2 text-xs font-medium text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)]">
            申领栏
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--student-error)] px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
          <button type="button" disabled={cartCount === 0}
            onClick={() => setConfirmOpen(true)}
            className="rounded-full bg-[var(--student-primary)] px-5 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 hover:opacity-90 whitespace-nowrap">
            提交申领
          </button>
        </footer>

        {/* ════════════ Demand suggestion footer ════════════ */}
        {demandEntryVisible && (
          <div className="shrink-0 px-3 py-2 border-t border-[var(--student-hairline)] bg-[var(--student-surface)]">
            {!showDemandForm ? (
              <button onClick={() => setShowDemandForm(true)}
                className="flex items-center gap-1.5 text-[11px] text-[var(--student-mute)] hover:text-[var(--student-primary)] transition-colors">
                <Lightbulb className="size-3" /> 找不到想要的？提个建议
              </button>
            ) : (
              <div className="space-y-1.5">
                <textarea className="w-full rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-1.5 text-[12px] text-[var(--student-ink)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--student-primary)]/20" rows={2}
                  placeholder="描述你需要的物品..." value={demandText} onChange={e => setDemandText(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button onClick={async () => { if (!demandText.trim()) return; setDemandSubmitting(true); try { await createMaterialDemand(demandText.trim()); toast.success("建议已提交"); setDemandText(""); setShowDemandForm(false); } catch { toast.error("提交失败"); } finally { setDemandSubmitting(false); } }}
                    disabled={demandSubmitting || !demandText.trim()}
                    className="rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-3 py-1 text-[11px] font-medium text-white disabled:opacity-50">{demandSubmitting ? "提交中..." : "提交建议"}</button>
                  <button onClick={() => { setShowDemandForm(false); setDemandText(""); }}
                    className="rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] px-3 py-1 text-[11px] text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)]">取消</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ Cart slide-up sheet (对齐 admin) ════════════ */}
        {cartSheetOpen && (
          <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/35" onClick={() => setCartSheetOpen(false)}>
            <div className="mx-2 mb-2 flex min-h-0 max-h-[85%] flex-col overflow-hidden rounded-xl bg-[var(--student-surface)] shadow-[0_-8px_28px_rgba(0,0,0,0.15)] sm:mx-3 sm:mb-3" onClick={e => e.stopPropagation()}>
              {/* Sheet header */}
              <div className="shrink-0 flex items-center justify-between border-b border-[var(--student-hairline)] px-4 py-3">
                <span className="text-sm font-semibold text-[var(--student-ink)]">申领栏{cartCount > 0 ? ` · ${cartCount} 件` : ""}</span>
                <button onClick={() => setCartSheetOpen(false)} className="p-1 rounded hover:bg-[var(--student-canvas-soft)] text-[var(--student-mute)]"><X className="size-4" /></button>
              </div>

              {/* Sheet body */}
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {cartLines.length === 0 ? (
                  <div className="py-16 text-center text-[13px] text-[var(--student-mute)]">申领栏是空的</div>
                ) : (
                  cartLines.map(line => {
                    const item = items?.find(x => x.id === line.itemId);
                    const itemMax = item?.stockMode === "UNLIMITED" ? undefined : (item?.stockQty || 0);
                    return (
                      <div key={line.key} className="flex gap-2 rounded-lg border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] p-2">
                        {line.cover ? (
                          <img src={line.cover} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-[var(--student-canvas)] text-xs font-bold text-[var(--student-mute)]">{line.initial}</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium text-[var(--student-ink)]">{line.name}</div>
                          <div className="mt-1 flex items-center gap-0.5">
                            <button type="button" onClick={() => updateCartQty(line.key, -1, itemMax)}
                              className="h-7 w-7 rounded border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-sm">−</button>
                            <input type="number" min={0} value={line.qty}
                              onChange={e => {
                                const n = Number.parseInt(e.target.value || "0", 10);
                                const cap = itemMax ?? 999;
                                const safe = Number.isFinite(n) ? Math.max(0, Math.min(cap, n)) : 0;
                                const cur = line.qty;
                                if (safe !== cur) updateCartQty(line.key, safe - cur, itemMax);
                              }}
                              className="h-7 w-12 rounded border border-[var(--student-hairline)] text-center text-xs" />
                            <button type="button" onClick={() => updateCartQty(line.key, 1, itemMax)}
                              disabled={itemMax != null && line.qty >= itemMax}
                              className="h-7 w-7 rounded bg-[var(--student-primary)] text-sm font-bold text-white disabled:opacity-40 hover:opacity-90">+</button>
                          </div>
                          <input type="text" placeholder="备注（可选，将计入审计）" value={remarkMap[line.key] || ""}
                            onChange={e => setRemarkMap(p => ({ ...p, [line.key]: e.target.value }))}
                            className="mt-1.5 w-full rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas)] px-2 py-1 text-[11px] text-[var(--student-ink)] placeholder:text-[var(--student-mute)]" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Sheet footer: pickup mode + actions */}
              {cartCount > 0 && (
                <div className="shrink-0 border-t border-[var(--student-hairline)]">
                  {/* Pickup mode */}
                  <div className="px-4 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--student-mute)] shrink-0">领取方式</span>
                      <div className="flex rounded-md border border-[var(--student-hairline)] overflow-hidden">
                        <button onClick={() => { setScheduledPickupTime(null); setShowPickupPicker(false); }}
                          className={cn("px-3 py-1 text-[11px] font-medium transition-colors", !scheduledPickupTime ? "bg-[var(--student-primary)] text-white" : "text-[var(--student-mute)] hover:text-[var(--student-ink)] hover:bg-[var(--student-canvas-soft)]")}>立即领取</button>
                        <button onClick={() => { if (!scheduledPickupTime && pickupPresets[0]) { setScheduledPickupTime(pickupPresets[0].iso); } else { setShowPickupPicker(!showPickupPicker); } }}
                          className={cn("px-3 py-1 text-[11px] font-medium transition-colors", scheduledPickupTime ? "bg-[var(--student-primary)] text-white" : "text-[var(--student-mute)] hover:text-[var(--student-ink)] hover:bg-[var(--student-canvas-soft)]")}>预约日期</button>
                      </div>
                      {scheduledPickupTime && <button onClick={() => setShowPickupPicker(true)} className="text-[11px] text-[var(--student-primary)] ml-auto hover:underline flex items-center gap-1">{pickupTimeLabel(scheduledPickupTime)} <Pencil className="size-3" /></button>}
                    </div>
                    {showPickupPicker && (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          {pickupPresets.map(p => (
                            <button key={p.iso} type="button" onClick={() => { setScheduledPickupTime(p.iso); setShowPickupPicker(false); }}
                              className={cn("rounded-full border px-2.5 py-1 text-[11px]", scheduledPickupTime === p.iso ? "border-[var(--student-primary)] bg-[var(--student-primary-soft)] text-[var(--student-primary)]" : "border-[var(--student-hairline)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]")}>{p.label}</button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[var(--student-mute)] shrink-0">自定义</span>
                          <input type="date" min={pickupPresets[0]?.iso}
                            onChange={e => { if (e.target.value) { setScheduledPickupTime(e.target.value); setShowPickupPicker(false); } }}
                            className="flex-1 rounded border border-[var(--student-hairline)] px-2 py-1 text-[11px] text-[var(--student-ink)] bg-[var(--student-canvas)]" />
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <button type="button" onClick={() => setClearCartOpen(true)}
                      className="rounded-full border border-[var(--student-hairline)] bg-[var(--student-canvas)] px-3 py-1 text-[12px] text-[var(--student-error)] hover:bg-[var(--student-error-soft)] transition-colors">清空</button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--student-mute)]">共 <strong className="text-[var(--student-ink)]">{cartCount}</strong> 件</span>
                      <button onClick={() => setCartSheetOpen(false)} className="rounded-full border border-[var(--student-hairline)] bg-[var(--student-canvas)] px-3 py-1 text-xs text-[var(--student-body)]">收起</button>
                      <button onClick={() => { setCartSheetOpen(false); setConfirmOpen(true); }}
                        className="rounded-full bg-[var(--student-primary)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90">去提交</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        </div>
        )}
      </div>

      {/* ════════════ Image preview modal ════════════ */}
      {previewSrc && (
        <Portal>
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPreviewSrc(null)}>
            <button type="button" onClick={() => setPreviewSrc(null)} className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40"><X className="size-5" /></button>
            <img src={previewSrc} alt="预览" className="max-h-[85vh] max-w-[85vw] rounded-[var(--app-radius-container)] object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
          </div>
        </Portal>
      )}

      {/* ════════════ Submit confirmation ════════════ */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogHeader>
          <DialogTitle>确认提交申领</DialogTitle>
          <DialogDescription>{scheduledPickupTime ? "预约申领将在预约时间前提前通知审核人" : "请核对以下物品，提交后将进入审核流程"}</DialogDescription>
          {(willSplit || multiIndependent) && <p className="text-[12px] text-[var(--student-warning)]">{willSplit ? "含独立下单物资，将拆分为多份申领单" : "多个独立下单物资将分别生成申领单"}</p>}
        </DialogHeader>
        <div className="min-h-0 max-h-[40vh] overflow-y-auto space-y-2">
          {cartLines.map((line, i) => (
            <div key={line.key} className="flex items-center gap-3 rounded-lg bg-[var(--student-canvas-soft)] p-2.5">
              {line.cover ? <img src={line.cover} alt="" className="size-9 shrink-0 rounded-md border border-[var(--student-hairline)] object-cover" />
                : <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--student-surface)] text-sm font-bold text-[var(--student-primary)]">{i + 1}</div>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--student-ink)]">{line.name}</p>
                {remarkMap[line.key]?.trim() && <p className="text-[10px] text-[var(--student-mute)] mt-0.5">备注：{remarkMap[line.key]}</p>}
              </div>
              <span className="shrink-0 text-[13px] font-semibold text-[var(--student-ink)]">×{line.qty}</span>
            </div>
          ))}
        </div>
        {/* Pickup mode selector — interactive, same as cart sheet */}
        <div className="rounded-lg border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--student-mute)] shrink-0">领取方式</span>
            <div className="flex rounded-md border border-[var(--student-hairline)] overflow-hidden">
              <button onClick={() => { setScheduledPickupTime(null); setShowPickupPicker(false); }}
                className={cn("px-3 py-1 text-[11px] font-medium transition-colors", !scheduledPickupTime ? "bg-[var(--student-primary)] text-white" : "text-[var(--student-mute)] hover:text-[var(--student-ink)] hover:bg-[var(--student-canvas-soft)]")}>立即领取</button>
              <button onClick={() => { if (!scheduledPickupTime && pickupPresets[0]) { setScheduledPickupTime(pickupPresets[0].iso); } else { setShowPickupPicker(!showPickupPicker); } }}
                className={cn("px-3 py-1 text-[11px] font-medium transition-colors", scheduledPickupTime ? "bg-[var(--student-primary)] text-white" : "text-[var(--student-mute)] hover:text-[var(--student-ink)] hover:bg-[var(--student-canvas-soft)]")}>预约日期</button>
            </div>
            {scheduledPickupTime && <button onClick={() => setShowPickupPicker(!showPickupPicker)} className="text-[11px] text-[var(--student-primary)] ml-auto hover:underline flex items-center gap-1">{pickupTimeLabel(scheduledPickupTime)} <Pencil className="size-3" /></button>}
          </div>
          {showPickupPicker && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {pickupPresets.map(p => (
                  <button key={p.iso} type="button" onClick={() => { setScheduledPickupTime(p.iso); setShowPickupPicker(false); }}
                    className={cn("rounded-full border px-2.5 py-1 text-[11px]", scheduledPickupTime === p.iso ? "border-[var(--student-primary)] bg-[var(--student-primary-soft)] text-[var(--student-primary)]" : "border-[var(--student-hairline)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]")}>{p.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--student-mute)] shrink-0">自定义</span>
                <input type="date" min={pickupPresets[0]?.iso}
                  onChange={e => { if (e.target.value) { setScheduledPickupTime(e.target.value); setShowPickupPicker(false); } }}
                  className="flex-1 rounded border border-[var(--student-hairline)] px-2 py-1 text-[11px] text-[var(--student-ink)] bg-[var(--student-canvas)]" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="justify-between">
          <span className="text-[13px] text-[var(--student-mute)]">合计 <strong className="text-[15px] text-[var(--student-ink)]">{cartCount} 件</strong></span>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg border border-[var(--student-hairline)] px-4 py-2 text-[13px] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]">取消</button>
            <button type="button" onClick={async () => { setConfirmOpen(false); await handleSubmit(scheduledPickupTime); }}
              disabled={createRequest.isPending}
              className="flex items-center gap-2 rounded-lg bg-[var(--student-primary)] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
              {createRequest.isPending ? <><Loader2 className="size-4 animate-spin" />提交中…</> : scheduledPickupTime ? <><Clock className="size-3.5" />确认预约提交</> : <><Send className="size-4" />确认提交</>}
            </button>
          </div>
        </DialogFooter>
      </Dialog>

      {/* ════════════ Clear cart confirmation ════════════ */}
      {clearCartOpen && (
        <Portal>
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={() => setClearCartOpen(false)}>
            <div className="w-full max-w-md rounded-xl bg-[var(--student-surface)] p-4 shadow-lg border border-[var(--student-hairline)]" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-[var(--student-ink)] mb-2">清空申领栏</h3>
              <p className="text-xs text-[var(--student-mute)] mb-4">将移除申领栏中全部物品，此操作不可撤销。</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setClearCartOpen(false)} className="rounded-lg border border-[var(--student-hairline)] px-3 py-1.5 text-sm text-[var(--student-body)]">取消</button>
                <button onClick={handleClearCart} className="rounded-lg bg-[var(--student-error)] px-3 py-1.5 text-sm font-medium text-white">确认清空</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ════════════ My records overlay panel ════════════ */}
      {recordsPanelOpen && <MyMaterialRecordsPanel onClose={() => setRecordsPanelOpen(false)} />}
    </AdminPageShell>
  );
}
