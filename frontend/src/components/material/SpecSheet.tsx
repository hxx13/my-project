/**
 * 规格选择器 — 替代锚点弹窗，全端统一，响应式双形态。
 * ≥640px：居中 Dialog（桌面/平板/管理后台）
 * <640px：Bottom Sheet（手机 H5）
 */
import { useEffect, useMemo, useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { webImageSrc } from "@/utils/mediaUrl";
import type { MaterialSpecPickerItem, MultiSpecSelections } from "@/utils/materialSpecHelpers";
import {
  buildSpecCartKey,
  filterCombosByMultiSelections,
  generateSpecCombos,
  hasAnyMultiSpecSelection,
  isMultiSpecSelectionReady,
  isSpecOptionSelected,
  maxQtyForMaterialItem,
  parseSpecDimensions,
  sumCartQtyForItem,
  toggleMultiSpecOption,
} from "@/utils/materialSpecHelpers";

interface SpecSheetProps {
  open: boolean;
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
  return (
    <div className="flex items-center gap-0.5 shrink-0 border border-[var(--student-hairline)] rounded-lg overflow-hidden">
      {qty > 0 && (
        <>
          <button
            type="button"
            onClick={onDec}
            disabled={disabled || qty <= 0}
            className="size-7 flex items-center justify-center hover:bg-[var(--student-canvas-soft)] transition-colors disabled:opacity-30"
          >
            <Minus className="size-3" />
          </button>
          <span className="w-6 text-center text-[13px] font-semibold tabular-nums">{qty}</span>
        </>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || qty >= max}
        className={cn(
          "size-7 flex items-center justify-center transition-colors",
          qty > 0 ? "rounded-r-md" : "rounded-lg",
          disabled || qty >= max
            ? "bg-[var(--student-hairline)] text-[var(--student-mute)] cursor-not-allowed"
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
  onOpenChange,
  item,
  cart,
  onAddKey,
  onDecKey,
  onAddPlain,
  onDecPlain,
}: SpecSheetProps) {
  const [selections, setSelections] = useState<MultiSpecSelections>({});

  // Reset selections when sheet opens or item changes
  useEffect(() => {
    if (open) setSelections({});
  }, [open, item.id]);

  const dimensions = useMemo(() => parseSpecDimensions(item.specSchema), [item.specSchema]);
  const allCombos = useMemo(() => generateSpecCombos(dimensions), [dimensions]);
  const selectionReady = isMultiSpecSelectionReady(dimensions, selections);
  const activeCombos = useMemo(() => {
    if (!selectionReady) return [];
    return filterCombosByMultiSelections(allCombos, selections);
  }, [allCombos, selectionReady, selections]);

  const maxQty = maxQtyForMaterialItem(item);
  const soldOut = maxQty <= 0;
  const specRequired = Number(item.specRequired) === 1;
  const showPlainRow = !specRequired && !hasAnyMultiSpecSelection(selections);
  const itemCartQty = sumCartQtyForItem(cart, item.id);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end sm:items-center sm:justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
      />

      {/* Sheet body — bottom sheet on mobile, centered dialog on desktop */}
      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl max-h-[85vh] sm:max-h-[90vh] sm:max-w-md sm:w-full sm:shadow-2xl flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-8 h-1 rounded-full bg-[var(--student-hairline)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2">
          <h3 className="text-[16px] font-bold text-[var(--student-ink)]">选择规格</h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-full hover:bg-[var(--student-canvas-soft)] text-[var(--student-mute)] transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          {/* Item context */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--student-canvas-soft)]">
            <div className="size-14 shrink-0 rounded-lg bg-[var(--student-canvas-soft)] flex items-center justify-center overflow-hidden">
              {item.coverUrl ? (
                <img
                  src={webImageSrc(item.coverUrl) || item.coverUrl}
                  alt={item.name}
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-[var(--student-primary)]/30">
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

          {/* Spec dimensions */}
          {dimensions.map((dim) => (
            <div key={dim.name}>
              <p className="text-[12px] font-medium text-[var(--student-mute)] mb-2">{dim.name}</p>
              <div className="flex flex-wrap gap-2">
                {dim.options.map((opt) => {
                  const active = isSpecOptionSelected(selections, dim.name, opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSelections((prev) => toggleMultiSpecOption(prev, dim.name, opt))}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors",
                        active
                          ? "border-[var(--student-primary)] bg-[var(--student-primary-soft)] text-[var(--student-primary)] border-2"
                          : "border-[var(--student-hairline)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]",
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Selected combos */}
          {selectionReady && activeCombos.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--student-hairline)]">
              <p className="text-[11px] font-medium text-[var(--student-mute)] uppercase tracking-wide">
                已选规格组合
              </p>
              {activeCombos.map((combo) => (
                <div
                  key={combo.key}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[var(--student-canvas-soft)] px-3 py-2"
                >
                  <span className="text-[13px] font-medium text-[var(--student-body)] truncate">
                    {combo.label}
                  </span>
                  <SheetQtyStepper
                    qty={cart[buildSpecCartKey(item.id, combo.key)] || 0}
                    max={maxQty}
                    disabled={soldOut}
                    onAdd={() => onAddKey(buildSpecCartKey(item.id, combo.key))}
                    onDec={() => onDecKey(buildSpecCartKey(item.id, combo.key))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Plain row (no spec selected, optional spec) */}
          {showPlainRow && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-[var(--student-hairline)]">
              <span className="text-[13px] text-[var(--student-mute)]">默认（不选规格）</span>
              <SheetQtyStepper
                qty={cart[String(item.id)] || 0}
                max={maxQty}
                disabled={soldOut}
                onAdd={onAddPlain}
                onDec={onDecPlain}
              />
            </div>
          )}

          {/* Sold out notice */}
          {soldOut && (
            <p className="text-center text-[12px] text-[var(--student-danger)] py-2">该物品已售罄</p>
          )}
        </div>

        {/* Bottom bar — mobile: single button */}
        <div className="shrink-0 px-5 py-3 border-t border-[var(--student-hairline)] flex items-center justify-between sm:hidden">
          <span className="text-[13px] text-[var(--student-mute)]">
            已选{" "}
            <strong className="text-[var(--student-ink)] text-[15px]">{itemCartQty}</strong>{" "}
            件
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-6 py-2.5 rounded-lg bg-[var(--student-primary)] text-white text-[14px] font-semibold hover:opacity-90 transition-opacity"
          >
            完成
          </button>
        </div>

        {/* Bottom bar — desktop: cancel + confirm */}
        <div className="hidden sm:flex shrink-0 items-center justify-between px-5 py-3 border-t border-[var(--student-hairline)] bg-[var(--student-canvas-soft)]">
          <span className="text-[13px] text-[var(--student-mute)]">
            已选{" "}
            <strong className="text-[var(--student-ink)] text-[15px]">{itemCartQty}</strong>{" "}
            件
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-lg border border-[var(--student-hairline)] bg-white text-[13px] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-5 py-2 rounded-lg bg-[var(--student-primary)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
