/**
 * 规格选择器 — 全端统一居中 Dialog。
 * 规格维度默认折叠，点击展开；组合行仅在各维度均有选中项后展示。
 * Portal 到 body 避免被父级 stacking context（sticky header 等）遮挡。
 */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { webImageSrc } from "@/utils/mediaUrl";
import type { MaterialSpecPickerItem } from "@/utils/materialSpecHelpers";
import {
  buildSpecCartKey,
  generateSpecCombos,
  itemIdFromCartKey,
  maxQtyForMaterialItem,
  parseSpecDimensions,
  sumCartQtyForItem,
} from "@/utils/materialSpecHelpers";

/** 小程序同款配色：弹窗 Portal 到 body，必须自带令牌，否则吃不到页面作用域里的覆盖 */
export const MINI_THEME: CSSProperties = {
  "--student-primary": "#2563eb",
  "--student-primary-foreground": "#ffffff",
  "--student-primary-hover": "#1d4ed8",
  "--student-primary-muted": "rgba(37,99,235,0.14)",
  "--student-canvas": "#ffffff",
  "--student-canvas-soft": "#f6f7fb",
  "--student-canvas-soft-2": "#f1f3f7",
  "--student-surface": "#ffffff",
  "--student-hairline": "#eef0f4",
  "--student-ink": "#1e293b",
  "--student-body": "#334155",
  "--student-mute": "#64748b",
  "--student-danger": "#ef4444",
  "--student-radius-sm": "8px",
  "--student-radius-md": "14px",
  "--student-primary-soft": "#eff6ff",
} as CSSProperties;

interface SpecSheetProps {
  open: boolean;
  theme?: CSSProperties;
  onOpenChange: (open: boolean) => void;
  item: MaterialSpecPickerItem;
  cart: Record<string, number>;
  onAddKey: (cartKey: string) => void;
  onDecKey: (cartKey: string) => void;
  onAddPlain: () => void;
  onDecPlain: () => void;
}

function SheetQtyStepper({
  qty,
  max,
  disabled,
  onAdd,
  onDec,
}: {
  qty: number;
  max: number;
  disabled?: boolean;
  onAdd: () => void;
  onDec: () => void;
}) {
  const soldOut = disabled || max <= 0;
  const atMax = qty >= max;
  const ctrlRadius = "rounded-[var(--student-radius-sm)]";

  if (qty <= 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        disabled={soldOut || atMax}
        aria-label="增加数量"
        className={cn(
          "size-7 flex shrink-0 items-center justify-center border border-[var(--student-hairline)] transition-colors",
          ctrlRadius,
          soldOut || atMax
            ? "cursor-not-allowed bg-[var(--student-hairline)] text-[var(--student-mute)]"
            : "bg-[var(--student-primary)] text-white hover:opacity-90",
        )}
      >
        <Plus className="size-3" />
      </button>
    );
  }

  return (
    <div className="inline-flex shrink-0 items-center gap-0.5" role="group" aria-label="数量">
      <button
        type="button"
        onClick={onDec}
        disabled={soldOut}
        aria-label="减少数量"
        className={cn(
          "size-7 flex items-center justify-center border border-[var(--student-hairline)] bg-[var(--student-surface)] transition-colors",
          ctrlRadius,
          "hover:bg-[var(--student-canvas-soft)] disabled:opacity-30",
        )}
      >
        <Minus className="size-3" />
      </button>
      <span
        className={cn(
          "flex size-7 items-center justify-center border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-center text-[11px] font-semibold tabular-nums leading-none text-[var(--student-ink)]",
          ctrlRadius,
        )}
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={onAdd}
        disabled={soldOut || atMax}
        aria-label="增加数量"
        className={cn(
          "size-7 flex items-center justify-center border border-[var(--student-hairline)] transition-colors",
          ctrlRadius,
          soldOut || atMax
            ? "cursor-not-allowed bg-[var(--student-hairline)] text-[var(--student-mute)]"
            : "bg-[var(--student-primary)] text-white hover:opacity-90",
        )}
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

export function SpecSheet({
  open,
  theme,
  onOpenChange,
  item,
  cart,
  onAddKey,
  onDecKey,
  onAddPlain,
  onDecPlain,
}: SpecSheetProps) {
  const [draftCart, setDraftCart] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) {
      setDraftCart({ ...cart });
    } else {
      setDraftCart({});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const dimensions = useMemo(() => parseSpecDimensions(item.specSchema), [item.specSchema]);
  const allCombos = useMemo(() => generateSpecCombos(dimensions), [dimensions]);
  /** 全部规格组合直接列出：有没有选由数量决定，不设前置选择门槛 */
  const activeCombos = allCombos;

  const maxQty = maxQtyForMaterialItem(item);
  const soldOut = maxQty <= 0;
  const specRequired = Number(item.specRequired) === 1;
  const showPlainRow = !specRequired && dimensions.length === 0;
  const itemCartQty = sumCartQtyForItem(draftCart, item.id);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
      style={theme}
      role="dialog"
      aria-modal="true"
      aria-labelledby="spec-sheet-title"
    >
      <div
        className="absolute inset-0 bg-black/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        onClick={() => onOpenChange(false)}
      />

      <div
        className={cn(
          "relative w-full max-w-md max-h-[min(85vh,640px)] flex flex-col overflow-hidden",
          "rounded-[var(--student-radius-md,14px)] bg-[var(--student-surface)] shadow-2xl",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200",
        )}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--student-hairline)]">
          <h3 id="spec-sheet-title" className="text-[16px] font-bold text-[var(--student-ink)]">
            选择规格
          </h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 -mr-1 rounded-[var(--student-radius-sm)] hover:bg-[var(--student-canvas-soft)] text-[var(--student-mute)] transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)]">
            <div className="size-14 shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas)] flex items-center justify-center overflow-hidden">
              {item.coverUrl ? (
                <img
                  src={webImageSrc(item.coverUrl) || item.coverUrl}
                  alt={item.name}
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-[var(--student-mute)]">
                  {item.name?.charAt(0) || "物"}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h4 className="text-[14px] font-semibold text-[var(--student-ink)]">{item.name}</h4>
              {item.subtitle && (
                <p className="text-[12px] text-[var(--student-mute)] mt-0.5 line-clamp-2">{item.subtitle}</p>
              )}
            </div>
          </div>

          {activeCombos.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[12px] font-medium text-[var(--student-mute)]">规格</p>
              {activeCombos.map((combo) => (
                <div
                  key={combo.key}
                  className="flex items-center justify-between gap-3 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] px-3 py-2.5"
                >
                  <span className="text-[13px] font-medium text-[var(--student-body)] truncate">
                    {combo.label}
                  </span>
                  <SheetQtyStepper
                    qty={draftCart[buildSpecCartKey(item.id, combo.key)] || 0}
                    max={maxQty}
                    disabled={soldOut}
                    onAdd={() => {
                      const ck = buildSpecCartKey(item.id, combo.key);
                      setDraftCart((prev) => ({ ...prev, [ck]: Math.min((prev[ck] || 0) + 1, maxQty) }));
                    }}
                    onDec={() => {
                      const ck = buildSpecCartKey(item.id, combo.key);
                      setDraftCart((prev) => ({ ...prev, [ck]: Math.max(0, (prev[ck] || 0) - 1) }));
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {showPlainRow && (
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-dashed border-[var(--student-hairline)]">
              <span className="text-[13px] text-[var(--student-mute)]">默认（不选规格）</span>
              <SheetQtyStepper
                qty={draftCart[String(item.id)] || 0}
                max={maxQty}
                disabled={soldOut}
                onAdd={() => {
                  const pk = String(item.id);
                  setDraftCart((prev) => ({ ...prev, [pk]: Math.min((prev[pk] || 0) + 1, maxQty) }));
                }}
                onDec={() => {
                  const pk = String(item.id);
                  setDraftCart((prev) => ({ ...prev, [pk]: Math.max(0, (prev[pk] || 0) - 1) }));
                }}
              />
            </div>
          )}

          {soldOut && (
            <p className="text-center text-[12px] text-[var(--student-danger)] py-2">该物品已售罄</p>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--student-hairline)] bg-[var(--student-canvas-soft)]">
          <span className="text-[13px] text-[var(--student-mute)]">
            已选{" "}
            <strong className="text-[var(--student-ink)] text-[15px]">{itemCartQty}</strong>{" "}
            件
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2.5 min-h-[44px] rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-[13px] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                const allKeys = new Set<string>();
                for (const k of Object.keys(draftCart)) {
                  if (itemIdFromCartKey(k) === item.id) allKeys.add(k);
                }
                for (const k of Object.keys(cart)) {
                  if (itemIdFromCartKey(k) === item.id) allKeys.add(k);
                }
                for (const key of allKeys) {
                  const draftQty = draftCart[key] || 0;
                  const origQty = cart[key] || 0;
                  const diff = draftQty - origQty;
                  if (diff > 0) {
                    for (let i = 0; i < diff; i++) {
                      if (key === String(item.id)) onAddPlain();
                      else onAddKey(key);
                    }
                  } else if (diff < 0) {
                    for (let i = 0; i < -diff; i++) {
                      if (key === String(item.id)) onDecPlain();
                      else onDecKey(key);
                    }
                  }
                }
                onOpenChange(false);
              }}
              className="px-5 py-2.5 min-h-[44px] rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
