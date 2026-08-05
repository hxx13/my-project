/**
 * 规格选择器 — 全端统一居中 Dialog。
 * 规格维度默认折叠，点击展开；组合行仅在各维度均有选中项后展示。
 * Portal 到 body 避免被父级 stacking context（sticky header 等）遮挡。
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Minus, Plus, ChevronDown } from "lucide-react";
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
  itemIdFromCartKey,
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

function selectedSummary(selections: MultiSpecSelections, dimName: string): string | null {
  const opts = selections[dimName];
  if (!opts?.length) return null;
  return opts.join("、");
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
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());

  const [draftCart, setDraftCart] = useState<Record<string, number>>({});

  useEffect(() => {
    setSelections({});
    setExpandedDims(new Set());
  }, [item.id]);

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
  const selectionReady = isMultiSpecSelectionReady(dimensions, selections);
  const activeCombos = useMemo(() => {
    if (!selectionReady) return [];
    return filterCombosByMultiSelections(allCombos, selections);
  }, [allCombos, selectionReady, selections]);

  const maxQty = maxQtyForMaterialItem(item);
  const soldOut = maxQty <= 0;
  const specRequired = Number(item.specRequired) === 1;
  const showPlainRow = !specRequired && !hasAnyMultiSpecSelection(selections);
  const itemCartQty = sumCartQtyForItem(draftCart, item.id);

  const toggleDimExpanded = (dimName: string) => {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(dimName)) next.delete(dimName);
      else next.add(dimName);
      return next;
    });
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
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
          "rounded-[var(--student-radius-md,12px)] bg-[var(--student-canvas)] shadow-[var(--student-shadow-modal)]",
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

          {dimensions.length > 0 && (
            <div className="space-y-2">
              {dimensions.map((dim) => {
                const expanded = expandedDims.has(dim.name);
                const summary = selectedSummary(selections, dim.name);
                return (
                  <div
                    key={dim.name}
                    className="rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleDimExpanded(dim.name)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-left hover:bg-[var(--student-canvas-soft)] transition-colors"
                      aria-expanded={expanded}
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-[var(--student-mute)] transition-transform motion-safe:duration-200",
                          !expanded && "-rotate-90",
                        )}
                      />
                      <span className="flex-1 min-w-0 text-[13px] font-semibold text-[var(--student-ink)]">
                        {dim.name}
                      </span>
                      {summary && !expanded && (
                        <span className="shrink-0 max-w-[45%] truncate text-[12px] text-[var(--student-primary)]">
                          {summary}
                        </span>
                      )}
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3 pt-0 border-t border-[var(--student-hairline)]">
                        <div className="flex flex-wrap gap-2 pt-3">
                          {dim.options.map((opt) => {
                            const active = isSpecOptionSelected(selections, dim.name, opt);
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() =>
                                  setSelections((prev) => toggleMultiSpecOption(prev, dim.name, opt))
                                }
                                className={cn(
                                  "px-3.5 py-2 min-h-[40px] rounded-[var(--student-radius-sm)] text-[13px] font-medium border transition-colors",
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
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectionReady && activeCombos.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[12px] font-medium text-[var(--student-mute)]">已选规格组合</p>
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

          {!selectionReady && dimensions.length > 0 && !showPlainRow && (
            <p className="text-[12px] text-[var(--student-mute)] text-center py-1">
              展开上方规格分类并选择后，将显示可申领的组合
            </p>
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
