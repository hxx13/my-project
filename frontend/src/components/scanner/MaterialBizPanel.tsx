import { useMemo, useState, useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import toast from "react-hot-toast";
import {
  useMaterialCategories,
  useMaterialItems,
} from "@/api/hooks/useMaterial";
import { createMaterialRequestWithToken } from "@/api/domains/material.api";
import type { AuthData } from "@/api/domains/auth.api";
import type { MaterialItem } from "@/api/domains/material.api";
import type { BizItemSlotProps } from "@/components/scanner/BizOverlayShell.types";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import {
  formatMaterialApplicantGroupLabel,
  resolveMaterialApplicantGroup,
} from "@/features/student/materialApplicant";
import { webImageSrc } from "@/utils/mediaUrl";
import { cn } from "@/lib/utils";

// 明暗主题适配令牌
const CARD_BG = "bg-[var(--app-color-surface-elevated)]";
const CARD_BORDER = "border-[var(--app-color-border-default)]";
const TEXT = "text-[var(--app-color-text-primary)]";
const TEXT_SEC = "text-[var(--app-color-text-secondary)]";
const TEXT_MUTED = "text-[var(--app-color-text-tertiary)]";
const BTN_GHOST = "bg-[var(--app-color-surface-hover)]";
const ACCENT_BG = "bg-[var(--app-color-accent)]";

type MaterialCart = Record<string, number>;

// -- helpers --

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

/**
 * 快捷业务-申领物品面板（明暗主题适配）
 * 登记信息与学生中心 /student/material 一致：PIN 后以被扫人员身份提交，applicantGroup 同规则。
 */
export default function MaterialBizPanel({ userId, scanUser, onDone }: BizItemSlotProps) {
  const { data: categories = [] } = useMaterialCategories();
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const { data: rawItems = [] } = useMaterialItems(activeCat === "all" ? undefined : activeCat);
  /** 扫码场景使用本地购物车，避免误用操作员服务端 cart */
  const [cart, setCart] = useState<MaterialCart>({});
  const [submitting, setSubmitting] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);

  const applicantName = scanUser?.userName?.trim() || userId;
  const applicantGroupLabel = formatMaterialApplicantGroupLabel(scanUser);

  const items = useMemo(() => rawItems.filter((it) => it.shelfStatus !== "DRAFT"), [rawItems]);

  const cartCount = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart]);

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([key, q]) => {
        const { itemId, specKey } = parseCartKey(key);
        const it = items.find((x) => x.id === itemId);
        const specLabel = specKey ? formatSpecLabel(JSON.stringify(parseSpecKey(specKey))) : "";
        return { key, itemId, name: it?.name || "物资", cover: it?.coverUrl, qty: q, specLabel };
      });
  }, [cart, items]);

  const updateQty = (key: string, delta: number, maxStock?: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const cur = next[key] || 0;
      const cap = maxStock != null ? Math.min(999, maxStock) : 999;
      const nv = Math.max(0, Math.min(cap, cur + delta));
      if (nv === 0) delete next[key];
      else next[key] = nv;
      return next;
    });
  };

  const handleSubmit = useCallback(() => {
    if (cartCount === 0) {
      toast.error("请先选择物资");
      return;
    }
    setShowKeypad(true);
  }, [cartCount]);

  const handlePinSuccess = useCallback(
    async (authData: AuthData) => {
      setShowKeypad(false);
      const pinUserId = authData.userInfo?.id?.trim();
      if (!pinUserId || pinUserId !== userId.trim()) {
        toast.error("身份校验失败：PIN 与当前刷卡人员不一致，请重新操作");
        return;
      }
      const lines = Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([key, qty]) => {
          const { itemId, specKey } = parseCartKey(key);
          return {
            itemId,
            qty,
            specSnapshot: specKey ? JSON.stringify(parseSpecKey(specKey)) : undefined,
          };
        });
      const applicantGroup = resolveMaterialApplicantGroup(scanUser);
      setSubmitting(true);
      try {
        const results = await createMaterialRequestWithToken(authData.token, lines, applicantGroup);
        const count = Array.isArray(results) ? results.length : 1;
        toast.success(`已为 ${applicantName} 提交 ${count} 张申领单`);
        setCart({});
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "提交失败");
      } finally {
        setSubmitting(false);
      }
    },
    [cart, scanUser, applicantName, onDone, userId],
  );

  return (
    <>
      {showKeypad && (
        <NumericKeypad
          mode="verify"
          userId={userId}
          userName={applicantName}
          onSuccess={handlePinSuccess}
          onCancel={() => setShowKeypad(false)}
        />
      )}
      <div className={`flex h-full flex-col ${TEXT}`}>
        <div className={`shrink-0 border-b ${CARD_BORDER} px-3 py-2 text-xs`}>
          <div className={TEXT_MUTED}>申领人</div>
          <div className={`mt-0.5 font-medium ${TEXT}`}>{applicantName}</div>
          <div className={`mt-1 ${TEXT_SEC}`}>
            课题组/部门：<span className={TEXT}>{applicantGroupLabel}</span>
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          {/* 分类 — 左侧纵向 */}
          <div
            className={`flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r ${CARD_BORDER} px-1.5 py-2`}
            style={{ width: 72 }}
          >
            <button
              onClick={() => setActiveCat("all")}
              className={cn(
                "rounded-lg px-2 py-1.5 text-xs text-left transition-colors",
                activeCat === "all" ? "bg-cyan-500/20 text-cyan-400" : `${TEXT_MUTED} hover:${TEXT}`,
              )}
            >
              全部
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-xs text-left transition-colors",
                  activeCat === cat.id ? "bg-cyan-500/20 text-cyan-400" : `${TEXT_MUTED} hover:${TEXT}`,
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* 物品卡片 + 购物车 — 右侧 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-2 pt-2">
              <div className="grid grid-cols-2 gap-2 pb-2">
                {items.map((item) => {
                  const max =
                    item.stockMode === "QUANTIFIED"
                      ? Math.max(0, item.stockQty || 0)
                      : item.stockQty >= 1
                        ? 99
                        : 0;
                  return (
                    <MaterialItemCard
                      key={item.id}
                      item={item}
                      cart={cart}
                      maxStock={max}
                      onCartChange={(key, delta) => updateQty(key, delta, max)}
                    />
                  );
                })}
              </div>
            </div>

            {/* 底部购物车 + 提交 */}
            <div className={`shrink-0 border-t ${CARD_BORDER} p-2`}>
              {cartCount > 0 && (
                <div className="mb-2 max-h-[25vh] overflow-y-auto space-y-1">
                  {cartLines.map((line) => (
                    <div key={line.key} className={`flex items-center gap-2 text-xs ${TEXT_MUTED}`}>
                      {line.cover ? (
                        <img
                          src={webImageSrc(line.cover)}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div
                          className={`h-8 w-8 shrink-0 rounded ${BTN_GHOST} flex items-center justify-center text-[10px] ${TEXT_MUTED}`}
                        >
                          {line.name.charAt(0)}
                        </div>
                      )}
                      <span className="flex-1 truncate">
                        {line.name}
                        {line.specLabel && (
                          <span className="ml-1 text-[10px] text-cyan-400">
                            {line.specLabel}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 ${TEXT_MUTED}`}>&times;{line.qty}</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting || cartCount === 0}
                className={`h-10 w-full rounded-xl ${ACCENT_BG} text-sm font-bold text-white hover:opacity-90 disabled:opacity-30 transition-colors`}
              >
                {submitting ? "提交中…" : `提交领用 (${cartCount})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface SkuCombo {
  specKey: string;
  label: string;
}

/** 物品卡片 — 明暗主题适配，支持 SKU 规格选择 */
function MaterialItemCard({
  item,
  cart,
  maxStock,
  onCartChange,
}: {
  item: MaterialItem;
  cart: Record<string, number>;
  maxStock: number;
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
  const imgSrc = webImageSrc(item.coverUrl);
  const soldOut = maxStock <= 0;

  if (!hasSpecs) {
    // ---- simple item ----
    const cartKey = String(item.id);
    const cartQty = cart[cartKey] || 0;
    return (
      <div className={cn(`rounded-xl border ${CARD_BORDER} ${CARD_BG} p-2`, soldOut && "opacity-40")}>
        <div className="flex gap-2">
          {imgSrc ? (
            <img src={imgSrc} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          ) : (
            <div
              className={`h-12 w-12 shrink-0 rounded-lg ${BTN_GHOST} flex items-center justify-center text-lg ${TEXT_MUTED}`}
            >
              {item.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className={`text-xs font-medium truncate ${TEXT}`}>{item.name}</div>
            {item.subtitle && <div className={`text-[10px] truncate ${TEXT_MUTED}`}>{item.subtitle}</div>}
            <div className={`mt-1 text-[10px] ${TEXT_SEC}`}>
              {item.stockMode === "QUANTIFIED" ? `库存 ${item.stockQty}` : item.stockQty >= 1 ? "有货" : "缺货"}
            </div>
          </div>
        </div>
        {!soldOut && (
          <div className="mt-2 flex items-center justify-end gap-1">
            <button
              onClick={() => onCartChange(cartKey, -1)}
              disabled={cartQty <= 0}
              className={`h-6 w-6 rounded ${BTN_GHOST} text-xs ${TEXT} hover:opacity-80 disabled:opacity-20`}
            >
              <Minus className="h-3 w-3 mx-auto" />
            </button>
            <span className={`w-8 text-center text-xs tabular-nums ${TEXT}`}>{cartQty}</span>
            <button
              onClick={() => onCartChange(cartKey, 1)}
              disabled={cartQty >= maxStock}
              className="h-6 w-6 rounded bg-cyan-500/30 text-xs text-cyan-400 hover:bg-cyan-500/50 disabled:opacity-20"
            >
              <Plus className="h-3 w-3 mx-auto" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- spec item — SKU panel ----
  return (
    <SpecItemCard
      item={item}
      dimensions={dimensions}
      cart={cart}
      maxStock={maxStock}
      imgSrc={imgSrc}
      soldOut={soldOut}
      onCartChange={onCartChange}
    />
  );
}

/** Compact SKU panel for scanner UI */
function SpecItemCard({
  item,
  dimensions,
  cart,
  maxStock,
  imgSrc,
  soldOut,
  onCartChange,
}: {
  item: MaterialItem;
  dimensions: { name: string; options: string[] }[];
  cart: Record<string, number>;
  maxStock: number;
  imgSrc: string | null;
  soldOut: boolean;
  onCartChange: (key: string, delta: number) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [skuQtys, setSkuQtys] = useState<Record<string, number>>({});

  const combos: SkuCombo[] = useMemo(() => {
    const keys = generateSpecCombos(dimensions, selected);
    return keys.map((specKey) => ({
      specKey,
      label: formatSpecLabel(JSON.stringify(parseSpecKey(specKey))),
    }));
  }, [dimensions, selected]);

  const subtotal = useMemo(
    () => Object.values(skuQtys).reduce((a, b) => a + b, 0),
    [skuQtys],
  );

  const allDimsSelected = dimensions.every((d) => selected[d.name]);
  const specRequired = item.specRequired === 1;

  function handleAddToCart() {
    for (const [specKey, qty] of Object.entries(skuQtys)) {
      if (qty > 0) {
        const cartKey = `${item.id}::${specKey}`;
        onCartChange(cartKey, qty);
      }
    }
    setSkuQtys({});
    setSelected({});
  }

  if (soldOut) {
    return (
      <div className={cn(`rounded-xl border ${CARD_BORDER} ${CARD_BG} p-2 opacity-40`)}>
        <div className="flex gap-2">
          {imgSrc ? (
            <img src={imgSrc} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className={`h-12 w-12 shrink-0 rounded-lg ${BTN_GHOST} flex items-center justify-center text-lg ${TEXT_MUTED}`}>
              {item.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className={`text-xs font-medium truncate ${TEXT}`}>{item.name}</div>
            <div className={`mt-1 text-[10px] ${TEXT_SEC}`}>缺货</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${CARD_BORDER} ${CARD_BG} p-2 text-xs`}>
      {/* Header */}
      <div className="flex gap-2">
        {imgSrc ? (
          <img src={imgSrc} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className={`h-10 w-10 shrink-0 rounded-lg ${BTN_GHOST} flex items-center justify-center text-base ${TEXT_MUTED}`}>
            {item.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className={`font-medium truncate ${TEXT}`}>{item.name}</div>
          <div className={`text-[10px] ${TEXT_SEC}`}>
            {item.stockMode === "QUANTIFIED" ? `库存 ${item.stockQty}` : "有货"}
          </div>
        </div>
      </div>

      {/* Dimension selectors */}
      {dimensions.map((dim) => (
        <div key={dim.name} className="mt-1.5 flex items-center gap-1">
          <span className={`text-[10px] ${TEXT_MUTED} w-7 shrink-0`}>{dim.name}</span>
          <div className="flex gap-0.5 flex-wrap">
            {dim.options.map((opt) => {
              const active = selected[dim.name] === opt;
              return (
                <button
                  key={opt}
                  onClick={() => {
                    setSelected((prev) => {
                      const cur = prev[dim.name];
                      if (cur === opt) {
                        const next = { ...prev };
                        delete next[dim.name];
                        return next;
                      }
                      return { ...prev, [dim.name]: opt };
                    });
                    setSkuQtys({});
                  }}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] border transition-colors",
                    active
                      ? "border-cyan-400 bg-cyan-500/20 text-cyan-400"
                      : `border-[var(--app-color-border-default)] ${TEXT_MUTED} hover:border-cyan-400/50`,
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
        <div className="mt-1.5 pt-1.5 border-t border-[var(--app-color-border-subtle)] space-y-0.5">
          {combos.map((combo) => {
            const qty = skuQtys[combo.specKey] || 0;
            const atCap = maxStock > 0 && qty >= maxStock;
            return (
              <div key={combo.specKey} className="flex items-center justify-between">
                <span className={`text-[10px] ${TEXT}`}>{combo.label}</span>
                <div className="flex items-center gap-0.5">
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
                      className={`h-5 w-5 rounded ${BTN_GHOST} flex items-center justify-center`}
                    >
                      <Minus className="h-2.5 w-2.5" />
                    </button>
                  )}
                  {qty > 0 && (
                    <span className={`w-4 text-center text-[10px] tabular-nums ${TEXT}`}>{qty}</span>
                  )}
                  <button
                    onClick={() =>
                      setSkuQtys((prev) => {
                        const cap = maxStock > 0 ? Math.min(999, maxStock) : 999;
                        const nv = Math.min(cap, qty + 1);
                        return { ...prev, [combo.specKey]: nv };
                      })
                    }
                    disabled={atCap}
                    className="h-5 w-5 rounded bg-cyan-500/30 text-cyan-400 hover:bg-cyan-500/50 disabled:opacity-20"
                  >
                    <Plus className="h-2.5 w-2.5 mx-auto" />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1 border-t border-[var(--app-color-border-subtle)]">
            <span className={`text-[10px] ${TEXT_MUTED}`}>小计 {subtotal} 件</span>
            <button
              onClick={handleAddToCart}
              disabled={subtotal === 0 || (specRequired && !allDimsSelected)}
              className="px-2 py-0.5 rounded bg-cyan-500 text-white text-[10px] font-medium disabled:opacity-30"
            >
              加入购物车
            </button>
          </div>
        </div>
      )}

      {combos.length === 0 && (
        <p className={`mt-1.5 text-[10px] ${TEXT_MUTED}`}>
          {specRequired ? "请选择所有规格" : "请选择规格"}
        </p>
      )}
    </div>
  );
}
