/** 学生物资商城 — 快捷入口路由：/student/material */
import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShoppingCart, ChevronLeft, Plus, Minus, Send, Package, Lightbulb, Loader2, X } from "lucide-react";
import { useMaterialCategories, useMaterialItems, useMaterialCart, useSaveMaterialCart, useCreateMaterialRequest } from "@/api/hooks/useMaterial";
import { createMaterialDemand } from "@/api/domains/material.api";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { resolveMaterialApplicantGroupForStudentSession } from "@/features/student/materialApplicant";
import type { MaterialItem } from "@/api/domains/material.api";
import { StudentCard, Skeleton, EmptyState, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui";
import { MaterialSpecPickControl } from "@/components/material/MaterialSpecPickerSheet";
import { hasSpecSchema } from "@/utils/materialSpecHelpers";
import { cn } from "@/lib/utils";
import { webImageSrc } from "@/utils/mediaUrl";
import toast from "react-hot-toast";

export const STUDENT_MATERIAL_ROUTE = "/student/material";

// -- helpers --

function formatSpecLabel(specJson: string | undefined | null): string {
  if (!specJson) return "";
  try {
    return Object.values(JSON.parse(specJson)).join("·");
  } catch {
    return "";
  }
}

/** specKey "dim1=opt1|dim2=opt2" → {"dim1":"opt1","dim2":"opt2"} */
function parseSpecKey(specKey: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!specKey) return result;
  for (const part of specKey.split("|")) {
    const eq = part.indexOf("=");
    if (eq > 0) result[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return result;
}

/** "123::dim=opt" → { itemId: 123, specKey: "dim=opt" } */
function parseCartKey(key: string): { itemId: number; specKey: string } {
  const idx = key.indexOf("::");
  if (idx === -1) return { itemId: Number(key), specKey: "" };
  return { itemId: Number(key.slice(0, idx)), specKey: key.slice(idx + 2) };
}

export default function StudentMaterialPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCat = searchParams.get("category");
  const { data: categories } = useMaterialCategories();
  const [activeCategoryId, setActiveCategoryId] = useState<number | undefined>(
    initialCat ? Number(initialCat) : undefined,
  );
  const { data: items, isLoading: itemsLoading } = useMaterialItems(activeCategoryId);
  const { data: cart } = useMaterialCart();
  const saveCart = useSaveMaterialCart();
  const createRequest = useCreateMaterialRequest();
  const [showCart, setShowCart] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [demandText, setDemandText] = useState("");
  const [demandSubmitting, setDemandSubmitting] = useState(false);
  const [showDemandForm, setShowDemandForm] = useState(false);
  const [demandEntryVisible, setDemandEntryVisible] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetchPublicRuntimeConfig()
      .then((cfg) => {
        setDemandEntryVisible(cfg["material.demand_entry_visible"] !== "false");
      })
      .catch(() => {
        /* 加载失败保持默认 */
      });
  }, []);

  const cartCount = useMemo(() => {
    if (!cart) return 0;
    return Object.values(cart).reduce((a, b) => a + b, 0);
  }, [cart]);

  // Filter items by search keyword (对齐教职工领用页搜索模式)
  const filteredItems = useMemo(() => {
    if (!items) return [];
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((it) => {
      const name = String(it.name || "").toLowerCase();
      const subtitle = String(it.subtitle || "").toLowerCase();
      return name.includes(kw) || subtitle.includes(kw);
    });
  }, [items, searchKeyword]);

  // Group cart entries by itemId for sidebar display
  const cartItems = useMemo(() => {
    if (!cart || !items) return [];
    const grouped = new Map<
      number,
      { item: MaterialItem; entries: { key: string; qty: number; specKey: string; specLabel: string }[] }
    >();
    for (const [key, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const { itemId, specKey } = parseCartKey(key);
      const item = items.find((it) => it.id === itemId);
      if (!item) continue;
      if (!grouped.has(itemId)) grouped.set(itemId, { item, entries: [] });
      grouped.get(itemId)!.entries.push({
        key,
        qty,
        specKey,
        specLabel: specKey ? formatSpecLabel(JSON.stringify(parseSpecKey(specKey))) : "",
      });
    }
    return Array.from(grouped.values());
  }, [cart, items]);

  function updateCartQty(key: string, delta: number, maxStock?: number) {
    if (!cart) return;
    const next = { ...cart };
    const cur = next[key] || 0;
    const cap = maxStock != null ? Math.min(999, maxStock) : 999;
    const nv = Math.max(0, Math.min(cap, cur + delta));
    if (nv === 0) delete next[key];
    else next[key] = nv;
    saveCart.mutate(next);
  }

  async function handleSubmit() {
    if (!cart || cartCount === 0) return;
    const lines = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => {
        const { itemId, specKey } = parseCartKey(key);
        return {
          itemId,
          qty,
          specSnapshot: specKey ? JSON.stringify(parseSpecKey(specKey)) : undefined,
        };
      });
    const group = resolveMaterialApplicantGroupForStudentSession();
    await createRequest.mutateAsync({ lines, applicantGroup: group });
    saveCart.mutate({}); // 清空申领物品栏
    navigate("/student/material/requests");
  }

  return (
    <div className="flex h-full bg-[var(--student-canvas-soft)]">
      <aside className="w-[200px] shrink-0 border-r border-[var(--student-hairline)] bg-white p-3 space-y-1 overflow-y-auto">
        <button
          onClick={() => setActiveCategoryId(undefined)}
          className={cn(
            "w-full text-left px-3 py-2.5 rounded-[var(--student-radius-sm)] text-[13px] transition-colors border-l-[3px]",
            !activeCategoryId
              ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold border-l-[var(--student-primary)]"
              : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] border-l-transparent",
          )}
        >
          全部分类
        </button>
        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryId(cat.id)}
            className={cn(
              "w-full text-left px-3 py-2.5 rounded-[var(--student-radius-sm)] text-[13px] transition-colors border-l-[3px]",
              activeCategoryId === cat.id
                ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold border-l-[var(--student-primary)]"
                : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] border-l-transparent",
            )}
          >
            {cat.name}
          </button>
        ))}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {/* 标题栏：左侧返回+标题，右侧操作入口（对齐教职工领用页布局） */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--student-hairline)] bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-[13px] text-[var(--student-mute)] hover:text-[var(--student-ink)] shrink-0"
            >
              <ChevronLeft className="size-4" /> 返回
            </button>
            <h2 className="text-[15px] font-semibold text-[var(--student-ink)] truncate">申领物品</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate("/student/material/requests")}
              className="text-[12px] text-[var(--student-primary)] hover:underline whitespace-nowrap"
            >
              我的申领
            </button>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative flex items-center gap-1 px-3 py-1.5 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] text-white text-[13px] whitespace-nowrap"
            >
              <ShoppingCart className="size-4" /> 申领物品栏
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-[var(--student-danger,#dc2626)] text-white text-[10px] flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 搜索栏（对齐教职工领用页搜索框） */}
        <div className="px-5 py-2 bg-white border-b border-[var(--student-hairline)]">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索物品"
            className="h-8 w-full max-w-md rounded-full border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 text-xs outline-none focus:ring-2 focus:ring-[var(--student-primary)]/20 focus:border-[var(--student-primary)] transition-shadow"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {itemsLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[120px]" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState icon={Package} title={searchKeyword.trim() ? "未找到匹配物品" : "暂无上架物品"} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 overflow-visible">
              {filteredItems.map((item) => (
                <MaterialItemCard
                  key={item.id}
                  item={item}
                  cart={cart || {}}
                  maxStock={
                    item.stockMode === "UNLIMITED"
                      ? undefined
                      : item.stockQty || 0
                  }
                  onCartChange={(key, delta) =>
                    updateCartQty(
                      key,
                      delta,
                      item.stockMode === "UNLIMITED"
                        ? undefined
                        : item.stockQty || 0,
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* 需求建议（受开关控制） */}
        {demandEntryVisible && (
          <div className="p-4 border-t border-[var(--student-hairline)]">
            {!showDemandForm ? (
              <button
                onClick={() => setShowDemandForm(true)}
                className="flex items-center gap-2 text-[12px] text-[var(--student-mute)] hover:text-[var(--student-primary)] transition-colors"
              >
                <Lightbulb className="size-3.5" /> 找不到想要的？提个建议
              </button>
            ) : (
              <div className="space-y-2">
                <textarea
                  className="w-full rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-white px-3 py-2 text-[13px] text-[var(--student-ink)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--student-primary)]/20 focus:border-[var(--student-primary)] transition-shadow"
                  rows={2}
                  placeholder="描述你需要的物品..."
                  value={demandText}
                  onChange={(e) => setDemandText(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={async () => {
                      if (!demandText.trim()) return;
                      setDemandSubmitting(true);
                      try {
                        await createMaterialDemand(demandText.trim());
                        toast.success("建议已提交");
                        setDemandText("");
                        setShowDemandForm(false);
                      } catch {
                        toast.error("提交失败");
                      } finally {
                        setDemandSubmitting(false);
                      }
                    }}
                    disabled={demandSubmitting || !demandText.trim()}
                    className="rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    {demandSubmitting ? "提交中..." : "提交建议"}
                  </button>
                  <button
                    onClick={() => {
                      setShowDemandForm(false);
                      setDemandText("");
                    }}
                    className="rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] px-3 py-1.5 text-[12px] text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)] transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showCart && (
        <aside className="w-[320px] shrink-0 border-l border-[var(--student-hairline)] bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--student-hairline)]">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold text-[var(--student-ink)]">申领物品栏</h3>
              {cartCount > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--student-primary-soft)] text-[var(--student-primary)]">
                  {cartCount} 件
                </span>
              )}
            </div>
            <button
              onClick={() => setShowCart(false)}
              className="p-1 rounded-md hover:bg-[var(--student-canvas-soft)] text-[var(--student-mute)] hover:text-[var(--student-ink)] transition-colors"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Package className="size-10 text-[var(--student-mute)]/30 mb-3" />
                <p className="text-[14px] font-semibold text-[var(--student-ink)] mb-1">申领栏是空的</p>
                <p className="text-[12px] text-[var(--student-mute)] mb-4">从左侧物品列表中选择你需要的物品加入申领栏</p>
                <button
                  onClick={() => setShowCart(false)}
                  className="text-[12px] font-medium px-4 py-1.5 rounded-full border border-[var(--student-primary)] text-[var(--student-primary)] hover:bg-[var(--student-primary-soft)] transition-colors"
                >
                  去浏览物品
                </button>
              </div>
            ) : (
              cartItems.map((group) => (
                <div
                  key={group.item.id}
                  className="p-2.5 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium truncate flex-1">
                      {group.item.name}
                    </p>
                    <p className="text-[11px] text-[var(--student-mute)]">
                      库存:{" "}
                      {group.item.stockMode === "UNLIMITED"
                        ? "无限"
                        : group.item.showStockQty === 0
                          ? "有货"
                          : group.item.stockQty || 0}
                    </p>
                  </div>
                  {group.entries.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between gap-2 pl-2 py-1"
                    >
                      <span className="text-[12px] text-[var(--student-body)] font-medium truncate flex-1 min-w-0">
                        {entry.specLabel || "默认"}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => updateCartQty(entry.key, -1)}
                          className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center hover:bg-[var(--student-canvas-soft)] transition-colors"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="text-[13px] w-5 text-center font-semibold tabular-nums">
                          {entry.qty}
                        </span>
                        <button
                          onClick={() => updateCartQty(entry.key, 1)}
                          className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center hover:bg-[var(--student-canvas-soft)] transition-colors"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          {cartItems.length > 0 && (
            <div className="flex items-center justify-between p-3 border-t border-[var(--student-hairline)]">
              <span className="text-[13px] text-[var(--student-mute)]">
                合计{" "}
                <strong className="text-[var(--student-ink)] text-[15px]">{cartCount} 件</strong>
              </span>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={cartCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--student-primary)] text-white text-[13px] font-semibold disabled:opacity-40 transition-opacity"
              >
                <Send className="size-4" /> 提交申领
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Submit Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogHeader>
          <DialogTitle>确认提交申领</DialogTitle>
          <DialogDescription>请核对以下物品，提交后将进入审核流程</DialogDescription>
        </DialogHeader>

        <div className="max-h-[40vh] overflow-y-auto space-y-2 my-3">
          {cartItems.map((group) =>
            group.entries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--student-canvas-soft)]"
              >
                <div className="size-9 shrink-0 rounded-md bg-[var(--student-canvas-soft)] flex items-center justify-center text-sm font-bold text-[var(--student-primary)]/40">
                  {group.item.name?.charAt(0) || "物"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--student-ink)] truncate">
                    {group.item.name}
                  </p>
                  <p className="text-[11px] text-[var(--student-mute)]">
                    {entry.specLabel || "默认"}
                  </p>
                </div>
                <span className="text-[13px] font-semibold text-[var(--student-ink)] shrink-0">
                  ×{entry.qty}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between py-2 border-t border-[var(--student-hairline)]">
          <span className="text-[13px] text-[var(--student-mute)]">
            合计{" "}
            <strong className="text-[var(--student-ink)] text-[15px]">{cartCount} 件</strong>
          </span>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="px-4 py-2 rounded-lg border border-[var(--student-hairline)] text-[13px] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={async () => {
              setConfirmOpen(false);
              await handleSubmit();
            }}
            disabled={createRequest.isPending}
            className="px-5 py-2 rounded-lg bg-[var(--student-primary)] text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2 transition-opacity"
          >
            {createRequest.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                提交中…
              </>
            ) : (
              <>
                <Send className="size-4" />
                确认提交
              </>
            )}
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function MaterialItemCard({
  item,
  cart,
  maxStock,
  onCartChange,
}: {
  item: MaterialItem;
  cart: Record<string, number>;
  maxStock?: number;
  onCartChange: (key: string, delta: number) => void;
}) {
  const hasSpecs = hasSpecSchema(item.specSchema);
  const cartKey = String(item.id);
  const cartQty = cart[cartKey] || 0;
  const atCap = maxStock != null && cartQty >= maxStock;
  const soldOut = maxStock != null && maxStock <= 0;

  return (
    <StudentCard className="flex items-start gap-3 p-3 overflow-visible hover:shadow-md hover:border-[var(--student-primary)]/20 transition-all duration-150">
      <div className="size-14 shrink-0 rounded-lg bg-[var(--student-canvas-soft)] flex items-center justify-center overflow-hidden">
        {item.coverUrl ? (
          <img
            src={webImageSrc(item.coverUrl) || item.coverUrl}
            alt={item.name}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-xl font-bold text-[var(--student-primary)]/30">{item.name?.charAt(0) || "物"}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-[14px] font-semibold truncate">{item.name}</h4>
        {item.subtitle && (
          <p className="text-[12px] text-[var(--student-mute)] mt-0.5 truncate">
            {item.subtitle}
          </p>
        )}
        {/* Stock info + action area — separated by border */}
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[var(--student-hairline)]">
          {/* Stock capsule badge */}
          <span className={cn(
            "text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0",
            item.stockMode === "UNLIMITED"
              ? "bg-[var(--student-success-soft,#ecfdf5)] text-[var(--student-success,#059669)]"
              : (item.stockQty || 0) <= 0
                ? "bg-[var(--student-danger-soft,#fef2f2)] text-[var(--student-danger,#dc2626)]"
                : (item.stockQty || 0) <= 3
                  ? "bg-[var(--student-warning-soft,#fffbeb)] text-[var(--student-warning,#d97706)]"
                  : "bg-[var(--student-canvas-soft)] text-[var(--student-mute)]",
          )}>
            {item.stockMode === "UNLIMITED"
              ? "库存充足"
              : (item.stockQty || 0) <= 0
                ? "已售罄"
                : (item.stockQty || 0) <= 3
                  ? `仅剩 ${item.stockQty} 件`
                  : "库存充足"}
          </span>

          {/* Quantity stepper or spec picker */}
          {hasSpecs ? (
            <MaterialSpecPickControl
              item={item}
              cart={cart}
              variant="student"
              disabled={soldOut}
              onAddKey={(key) => onCartChange(key, 1)}
              onDecKey={(key) => onCartChange(key, -1)}
              onAddPlain={() => onCartChange(cartKey, 1)}
              onDecPlain={() => onCartChange(cartKey, -1)}
            />
          ) : (
            <div className="flex items-center gap-0.5 shrink-0 border border-[var(--student-hairline)] rounded-lg overflow-hidden">
              {cartQty > 0 && (
                <>
                  <button
                    onClick={() => onCartChange(cartKey, -1)}
                    className="size-7 flex items-center justify-center hover:bg-[var(--student-canvas-soft)] transition-colors"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="w-6 text-center text-[13px] font-semibold tabular-nums">{cartQty}</span>
                </>
              )}
              <button
                onClick={() => onCartChange(cartKey, 1)}
                disabled={atCap || soldOut}
                className={cn(
                  "size-7 flex items-center justify-center transition-colors",
                  cartQty > 0 ? "rounded-r-md" : "rounded-lg",
                  atCap || soldOut
                    ? "bg-[var(--student-hairline)] text-[var(--student-mute)] cursor-not-allowed"
                    : "bg-[var(--student-primary)] text-white hover:opacity-90"
                )}
              >
                <Plus className="size-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </StudentCard>
  );
}
