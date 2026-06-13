import { useMemo, useState, useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import toast from "react-hot-toast";
import {
  useMaterialCategories,
  useMaterialItems,
  useMaterialCart,
  useSaveMaterialCart,
  useCreateMaterialRequest,
} from "@/api/hooks/useMaterial";
import type { MaterialItem } from "@/api/domains/material.api";
import type { BizItemSlotProps } from "@/components/scanner/BizOverlayShell.types";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
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

/**
 * 快捷业务-申领物品面板（明暗主题适配）
 */
export default function MaterialBizPanel({ userId, onDone }: BizItemSlotProps) {
  const { data: categories = [] } = useMaterialCategories();
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const { data: rawItems = [] } = useMaterialItems(activeCat === "all" ? undefined : activeCat);
  const { data: cart } = useMaterialCart();
  const saveCart = useSaveMaterialCart();
  const createRequest = useCreateMaterialRequest();
  const [showKeypad, setShowKeypad] = useState(false);

  const items = useMemo(() => rawItems.filter((it) => it.shelfStatus !== "DRAFT"), [rawItems]);

  const cartCount = useMemo(() => {
    if (!cart) return 0;
    return Object.values(cart).reduce((s, q) => s + q, 0);
  }, [cart]);

  const cartLines = useMemo(() => {
    if (!cart) return [];
    return Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => {
        const it = items.find((x) => x.id === Number(id));
        return { id: Number(id), name: it?.name || "物资", cover: it?.coverUrl, qty: q };
      });
  }, [cart, items]);

  const updateQty = (itemId: number, delta: number, maxStock?: number) => {
    if (!cart) return;
    const next = { ...cart };
    const cur = next[itemId] || 0;
    const cap = maxStock != null ? Math.min(999, maxStock) : 999;
    const nv = Math.max(0, Math.min(cap, cur + delta));
    if (nv === 0) delete next[itemId];
    else next[itemId] = nv;
    saveCart.mutate(next);
  };

  const handleSubmit = useCallback(() => {
    if (!cart || cartCount === 0) {
      toast.error("请先选择物资");
      return;
    }
    setShowKeypad(true);
  }, [cart, cartCount]);

  const handlePinSuccess = useCallback(async () => {
    setShowKeypad(false);
    const lines = Object.entries(cart!)
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId: Number(itemId), qty }));
    try {
      const results = await createRequest.mutateAsync({ lines });
      const count = Array.isArray(results) ? results.length : 1;
      toast.success(`已提交 ${count} 张申领单`);
      saveCart.mutate({});
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  }, [cart, createRequest, saveCart, onDone]);

  return (
    <>
      {showKeypad && (
        <NumericKeypad
          mode="verify"
          userId={userId}
          onSuccess={() => handlePinSuccess()}
          onCancel={() => setShowKeypad(false)}
        />
      )}
      <div className={`flex h-full ${TEXT}`}>
        {/* 分类 — 左侧纵向 */}
        <div className={`flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r ${CARD_BORDER} px-1.5 py-2`}
          style={{ width: 72 }}>
          <button onClick={() => setActiveCat("all")}
            className={cn("rounded-lg px-2 py-1.5 text-xs text-left transition-colors",
              activeCat === "all" ? `bg-cyan-500/20 text-cyan-400` : `${TEXT_MUTED} hover:${TEXT}`)}>
            全部
          </button>
          {categories.map((cat) => (
            <button key={cat.id} onClick={() => setActiveCat(cat.id)}
              className={cn("rounded-lg px-2 py-1.5 text-xs text-left transition-colors",
                activeCat === cat.id ? `bg-cyan-500/20 text-cyan-400` : `${TEXT_MUTED} hover:${TEXT}`)}>
              {cat.name}
            </button>
          ))}
        </div>

        {/* 物品卡片 + 购物车 — 右侧 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-2 pt-2">
            <div className="grid grid-cols-2 gap-2 pb-2">
              {items.map((item) => {
                const qty = cart?.[item.id] || 0;
                const max = item.stockMode === "QUANTIFIED"
                  ? Math.max(0, item.stockQty || 0)
                  : (item.stockQty >= 1 ? 99 : 0);
                return (
                  <MaterialItemCard key={item.id} item={item} cartQty={qty}
                    maxStock={max} onQtyChange={(d) => updateQty(item.id, d, max)} />
                );
              })}
            </div>
          </div>

          {/* 底部购物车 + 提交 */}
          <div className={`shrink-0 border-t ${CARD_BORDER} p-2`}>
            {cartCount > 0 && (
              <div className="mb-2 max-h-[25vh] overflow-y-auto space-y-1">
                {cartLines.map((line) => (
                  <div key={line.id} className={`flex items-center gap-2 text-xs ${TEXT_MUTED}`}>
                    {line.cover ? (
                      <img src={webImageSrc(line.cover)} alt=""
                        className="h-8 w-8 shrink-0 rounded object-cover" />
                    ) : (
                      <div className={`h-8 w-8 shrink-0 rounded ${BTN_GHOST} flex items-center justify-center text-[10px] ${TEXT_MUTED}`}>
                        {line.name.charAt(0)}
                      </div>
                    )}
                    <span className="flex-1 truncate">{line.name}</span>
                    <span className={`shrink-0 ${TEXT_MUTED}`}>×{line.qty}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={handleSubmit}
              disabled={createRequest.isPending || cartCount === 0}
              className={`h-10 w-full rounded-xl ${ACCENT_BG} text-sm font-bold text-white hover:opacity-90 disabled:opacity-30 transition-colors`}>
              {createRequest.isPending ? "提交中…" : `提交领用 (${cartCount})`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** 物品卡片 — 明暗主题适配 */
function MaterialItemCard({ item, cartQty, maxStock, onQtyChange }: {
  item: MaterialItem; cartQty: number; maxStock: number; onQtyChange: (d: number) => void;
}) {
  const imgSrc = webImageSrc(item.coverUrl);
  const soldOut = maxStock <= 0;
  return (
    <div className={cn(`rounded-xl border ${CARD_BORDER} ${CARD_BG} p-2`, soldOut && "opacity-40")}>
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
          {item.subtitle && <div className={`text-[10px] truncate ${TEXT_MUTED}`}>{item.subtitle}</div>}
          <div className={`mt-1 text-[10px] ${TEXT_SEC}`}>
            {item.stockMode === "QUANTIFIED" ? `库存 ${item.stockQty}` : item.stockQty >= 1 ? "有货" : "缺货"}
          </div>
        </div>
      </div>
      {!soldOut && (
        <div className="mt-2 flex items-center justify-end gap-1">
          <button onClick={() => onQtyChange(-1)} disabled={cartQty <= 0}
            className={`h-6 w-6 rounded ${BTN_GHOST} text-xs ${TEXT} hover:opacity-80 disabled:opacity-20`}>
            <Minus className="h-3 w-3 mx-auto" />
          </button>
          <span className={`w-8 text-center text-xs tabular-nums ${TEXT}`}>{cartQty}</span>
          <button onClick={() => onQtyChange(1)} disabled={cartQty >= maxStock}
            className="h-6 w-6 rounded bg-cyan-500/30 text-xs text-cyan-400 hover:bg-cyan-500/50 disabled:opacity-20">
            <Plus className="h-3 w-3 mx-auto" />
          </button>
        </div>
      )}
    </div>
  );
}
