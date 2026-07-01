/** 学生物资商城 — 快捷入口路由：/student/material */
import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShoppingCart, ChevronLeft, Plus, Minus, Send, Package, Lightbulb } from "lucide-react";
import { useMaterialCategories, useMaterialItems, useMaterialCart, useSaveMaterialCart, useCreateMaterialRequest } from "@/api/hooks/useMaterial";
import { createMaterialDemand } from "@/api/domains/material.api";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { resolveMaterialApplicantGroupForStudentSession } from "@/features/student/materialApplicant";
import type { MaterialItem } from "@/api/domains/material.api";
import { StudentCard, Skeleton, EmptyState, Badge } from "../components/ui";
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

/** Generate cartesian-product specKeys from dimensions + selections */
function generateSpecCombos(
  dimensions: { name: string; options: string[] }[],
  selected: Record<string, string>,
): string[] {
  const selectedDims = dimensions.filter((d) => selected[d.name]);
  if (selectedDims.length === 0) return [];
  let combos: Record<string, string>[] = [{}];
  for (const dim of selectedDims) {
    const opt = selected[dim.name];
    combos = combos.map((c) => ({ ...c, [dim.name]: opt }));
  }
  const rest = dimensions.filter((d) => !selected[d.name]);
  for (const dim of rest) {
    const next: Record<string, string>[] = [];
    for (const c of combos) {
      for (const opt of dim.options) {
        next.push({ ...c, [dim.name]: opt });
      }
    }
    combos = next;
  }
  return combos.map((c) =>
    Object.entries(c)
      .map(([k, v]) => `${k}=${v}`)
      .join("|"),
  );
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
  const [demandText, setDemandText] = useState("");
  const [demandSubmitting, setDemandSubmitting] = useState(false);
  const [showDemandForm, setShowDemandForm] = useState(false);
  const [demandEntryVisible, setDemandEntryVisible] = useState(true);

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
      <aside className="w-[180px] shrink-0 border-r border-[var(--student-hairline)] bg-white p-3 space-y-1 overflow-y-auto">
        <button
          onClick={() => setActiveCategoryId(undefined)}
          className={cn(
            "w-full text-left px-3 py-2 rounded-[var(--student-radius-sm)] text-[13px] transition-colors",
            !activeCategoryId
              ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold"
              : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]",
          )}
        >
          全部分类
        </button>
        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryId(cat.id)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-[var(--student-radius-sm)] text-[13px] transition-colors",
              activeCategoryId === cat.id
                ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold"
                : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]",
            )}
          >
            {cat.name}
          </button>
        ))}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--student-hairline)] bg-white">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-[13px] text-[var(--student-mute)] hover:text-[var(--student-ink)]"
          >
            <ChevronLeft className="size-4" /> 返回
          </button>
          <h2 className="text-[15px] font-semibold text-[var(--student-ink)]">申领物品</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/student/material/requests")}
              className="text-[12px] text-[var(--student-primary)] hover:underline"
            >
              我的申领
            </button>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative flex items-center gap-1 px-3 py-1.5 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] text-white text-[13px]"
            >
              <ShoppingCart className="size-4" /> 申领物品栏
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {itemsLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[120px]" />
              ))}
            </div>
          ) : !items || items.length === 0 ? (
            <EmptyState icon={Package} title="暂无上架物品" />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {items.map((item) => (
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
                  className="w-full rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-2 text-[13px] text-[var(--student-ink)] resize-none"
                  rows={2}
                  placeholder="描述你需要的物品..."
                  value={demandText}
                  onChange={(e) => setDemandText(e.target.value)}
                />
                <div className="flex gap-2">
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
                    className="rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] px-3 py-1.5 text-[12px] text-[var(--student-mute)]"
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
            <h3 className="text-[14px] font-semibold">申领物品栏 ({cartCount} 件)</h3>
            <button
              onClick={() => setShowCart(false)}
              className="text-[var(--student-mute)] hover:text-[var(--student-ink)] text-[20px] leading-none"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cartItems.length === 0 ? (
              <p className="text-center text-[13px] text-[var(--student-mute)] py-8">
                申领物品栏为空
              </p>
            ) : (
              cartItems.map((group) => (
                <div
                  key={group.item.id}
                  className="p-2 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] space-y-1"
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
                      className="flex items-center justify-between pl-2"
                    >
                      <span className="text-[11px] text-[var(--student-mute)]">
                        {entry.specLabel || "默认"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateCartQty(entry.key, -1)}
                          className="size-5 rounded border border-[var(--student-hairline)] flex items-center justify-center"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="text-[12px] w-5 text-center font-medium">
                          {entry.qty}
                        </span>
                        <button
                          onClick={() => updateCartQty(entry.key, 1)}
                          className="size-5 rounded border border-[var(--student-hairline)] flex items-center justify-center"
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
            <div className="p-3 border-t border-[var(--student-hairline)]">
              <button
                onClick={handleSubmit}
                disabled={createRequest.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--student-radius-md)] bg-[var(--student-primary)] text-white text-[14px] font-semibold disabled:opacity-50"
              >
                <Send className="size-4" /> 提交申领
              </button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

/** SKU type for spec combo display */
interface SkuCombo {
  specKey: string;
  label: string;
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
  // Parse specSchema
  const dimensions: { name: string; options: string[] }[] = useMemo(() => {
    if (!item.specSchema) return [];
    try {
      const schema = JSON.parse(item.specSchema);
      return schema.dimensions || [];
    } catch {
      return [];
    }
  }, [item.specSchema]);

  const hasSpecs = dimensions.length > 0;

  if (!hasSpecs) {
    // ---- simple item (no specs) ----
    const cartKey = String(item.id);
    const cartQty = cart[cartKey] || 0;
    const atCap = maxStock != null && cartQty >= maxStock;
    return (
      <StudentCard className="flex items-start gap-3 p-3">
        <div className="size-16 shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] flex items-center justify-center text-[var(--student-mute)] text-[11px] overflow-hidden">
          {item.coverUrl ? (
            <img
              src={webImageSrc(item.coverUrl) || item.coverUrl}
              alt={item.name}
              className="size-full object-cover"
            />
          ) : (
            "暂无图片"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-[13px] font-semibold truncate">{item.name}</h4>
          </div>
          {item.subtitle && (
            <p className="text-[11px] text-[var(--student-mute)] mt-0.5 line-clamp-2">
              {item.subtitle}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 mt-1.5 flex-nowrap">
            <span className="text-[11px] text-[var(--student-mute)] flex-1 min-w-0">
              库存:{" "}
              {item.stockMode === "UNLIMITED"
                ? "无限"
                : item.showStockQty === 0
                  ? "有货"
                  : item.stockQty || 0}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {cartQty > 0 && (
                <button
                  onClick={() => onCartChange(cartKey, -1)}
                  className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center"
                >
                  <Minus className="size-3" />
                </button>
              )}
              {cartQty > 0 && (
                <span className="text-[13px] w-5 text-center font-medium">
                  {cartQty}
                </span>
              )}
              <button
                onClick={() => onCartChange(cartKey, 1)}
                disabled={atCap}
                className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="size-3" />
              </button>
            </div>
          </div>
        </div>
      </StudentCard>
    );
  }

  // ---- spec item — SKU panel ----
  return (
    <SpecItemCard
      item={item}
      dimensions={dimensions}
      cart={cart}
      maxStock={maxStock}
      onCartChange={onCartChange}
    />
  );
}

/** Card for items that have spec dimensions */
function SpecItemCard({
  item,
  dimensions,
  cart,
  maxStock,
  onCartChange,
}: {
  item: MaterialItem;
  dimensions: { name: string; options: string[] }[];
  cart: Record<string, number>;
  maxStock?: number;
  onCartChange: (key: string, delta: number) => void;
}) {
  // which option is selected per dimension
  const [selected, setSelected] = useState<Record<string, string>>({});
  // local qty per SKU (not yet in main cart)
  const [skuQtys, setSkuQtys] = useState<Record<string, number>>({});

  // list of all spec combos given current selections
  const combos: SkuCombo[] = useMemo(() => {
    const keys = generateSpecCombos(dimensions, selected);
    return keys.map((specKey) => ({
      specKey,
      label: formatSpecLabel(JSON.stringify(parseSpecKey(specKey))),
    }));
  }, [dimensions, selected]);

  // subtotal of local SKU qtys
  const subtotal = useMemo(
    () => Object.values(skuQtys).reduce((a, b) => a + b, 0),
    [skuQtys],
  );

  const allDimsSelected = dimensions.every((d) => selected[d.name]);
  const specRequired = item.specRequired === 1;

  /** Add local SKU qtys to main cart */
  function handleAddToCart() {
    for (const [specKey, qty] of Object.entries(skuQtys)) {
      if (qty > 0) {
        const cartKey = `${item.id}::${specKey}`;
        onCartChange(cartKey, qty);
      }
    }
    // reset local selections
    setSkuQtys({});
    setSelected({});
  }

  // When dimensions change, reset SKU qtys
  function handleDimSelect(dimName: string, opt: string) {
    setSelected((prev) => {
      const cur = prev[dimName];
      if (cur === opt) {
        // deselect
        const next = { ...prev };
        delete next[dimName];
        return next;
      }
      return { ...prev, [dimName]: opt };
    });
    // reset local qtys on dimension change
    setSkuQtys({});
  }

  return (
    <StudentCard className="p-3 space-y-2">
      {/* Item header */}
      <div className="flex items-start gap-3">
        <div className="size-14 shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] flex items-center justify-center text-[var(--student-mute)] text-[10px] overflow-hidden">
          {item.coverUrl ? (
            <img
              src={webImageSrc(item.coverUrl) || item.coverUrl}
              alt={item.name}
              className="size-full object-cover"
            />
          ) : (
            "暂无图片"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-semibold truncate">{item.name}</h4>
          {item.subtitle && (
            <p className="text-[11px] text-[var(--student-mute)] mt-0.5 line-clamp-1">
              {item.subtitle}
            </p>
          )}
          <p className="text-[11px] text-[var(--student-mute)] mt-0.5">
            库存:{" "}
            {item.stockMode === "UNLIMITED"
              ? "无限"
              : item.showStockQty === 0
                ? "有货"
                : item.stockQty || 0}
          </p>
        </div>
      </div>

      {/* Dimension selectors */}
      {dimensions.map((dim) => (
        <div key={dim.name} className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--student-mute)] w-8 shrink-0">
            {dim.name}
          </span>
          <div className="flex gap-1 flex-wrap">
            {dim.options.map((opt) => {
              const active = selected[dim.name] === opt;
              return (
                <button
                  key={opt}
                  onClick={() => handleDimSelect(dim.name, opt)}
                  className={cn(
                    "px-2 py-0.5 rounded-[var(--student-radius-pill)] text-[11px] border transition-colors",
                    active
                      ? "border-[var(--student-primary)] bg-[var(--student-primary-soft)] text-[var(--student-primary)]"
                      : "border-[var(--student-hairline)] text-[var(--student-body)] hover:border-[var(--student-primary)]",
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* SKU grid */}
      {combos.length > 0 && (
        <div className="border-t border-[var(--student-hairline)] pt-2 space-y-1">
          {combos.map((combo) => {
            const qty = skuQtys[combo.specKey] || 0;
            const atCap = maxStock != null && qty >= maxStock;
            return (
              <div
                key={combo.specKey}
                className="flex items-center justify-between"
              >
                <span className="text-[11px] text-[var(--student-body)]">
                  {combo.label}
                </span>
                <div className="flex items-center gap-1">
                  {qty > 0 && (
                    <button
                      onClick={() =>
                        setSkuQtys((prev) => {
                          const nv = Math.max(0, qty - 1);
                          const next = { ...prev };
                          if (nv === 0) delete next[combo.specKey];
                          else next[combo.specKey] = nv;
                          return next;
                        })
                      }
                      className="size-5 rounded border border-[var(--student-hairline)] flex items-center justify-center"
                    >
                      <Minus className="size-3" />
                    </button>
                  )}
                  {qty > 0 && (
                    <span className="text-[12px] w-4 text-center font-medium">
                      {qty}
                    </span>
                  )}
                  <button
                    onClick={() =>
                      setSkuQtys((prev) => {
                        const cap = maxStock != null ? Math.min(999, maxStock) : 999;
                        const nv = Math.min(cap, qty + 1);
                        return { ...prev, [combo.specKey]: nv };
                      })
                    }
                    disabled={atCap}
                    className="size-5 rounded border border-[var(--student-hairline)] flex items-center justify-center disabled:opacity-30"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1.5 border-t border-[var(--student-hairline)]/50">
            <span className="text-[11px] text-[var(--student-mute)]">
              小计 {subtotal} 件
            </span>
            <button
              onClick={handleAddToCart}
              disabled={
                subtotal === 0 ||
                (specRequired && !allDimsSelected)
              }
              className="px-3 py-1 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] text-white text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              加入购物车
            </button>
          </div>
        </div>
      )}

      {/* If no combos yet (no dimension selected), show hint */}
      {combos.length === 0 && (
        <p className="text-[11px] text-[var(--student-mute)]">
          {specRequired
            ? "请选择所有规格"
            : "请选择规格"}
        </p>
      )}
    </StudentCard>
  );
}
