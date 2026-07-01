/**
 * 规格选择局部弹窗 — 在「选择规格」按钮正下方展开（左对齐），Portal 避免被 overflow 裁切。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Z_INDEX } from "@/constants/zIndex";
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

function QtyStepper({
  qty,
  max,
  disabled,
  compact,
  variant,
  onAdd,
  onDec,
}: {
  qty: number;
  max: number;
  disabled?: boolean;
  compact?: boolean;
  variant: "student" | "scanner" | "mobile";
  onAdd: () => void;
  onDec: () => void;
}) {
  const btn = compact ? "w-6 h-6" : "w-7 h-7";
  const icon = compact ? "size-3" : "size-3.5";

  if (variant === "student") {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onDec}
          disabled={disabled || qty <= 0}
          className={cn(btn, "rounded border border-[var(--student-hairline)] flex items-center justify-center disabled:opacity-30")}
        >
          <Minus className={icon} />
        </button>
        <span className="w-5 text-center text-[12px] font-medium tabular-nums">{qty}</span>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled || qty >= max}
          className={cn(btn, "rounded border border-[var(--student-hairline)] flex items-center justify-center disabled:opacity-30")}
        >
          <Plus className={icon} />
        </button>
      </div>
    );
  }

  if (variant === "scanner") {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onDec}
          disabled={disabled || qty <= 0}
          className="h-6 w-6 rounded bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-primary)] flex items-center justify-center disabled:opacity-20"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-8 text-center text-xs tabular-nums text-[var(--app-color-text-primary)]">{qty}</span>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled || qty >= max}
          className="h-6 w-6 rounded bg-cyan-500/30 text-cyan-400 flex items-center justify-center disabled:opacity-20"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center shrink-0 overflow-hidden rounded-lg"
      style={{ border: "1px solid #dcdee0", background: "#fff", opacity: disabled ? 0.45 : 1 }}
    >
      <button type="button" onClick={onDec} disabled={disabled || qty <= 0} className={`${btn} flex items-center justify-center font-medium`} style={{ color: "#323233", opacity: qty <= 0 ? 0.35 : 1 }}>−</button>
      <span className="w-[38px] h-6 text-center text-xs font-semibold border-x leading-6" style={{ color: "#323233", background: "#f7f8fa", borderColor: "#ebecef" }}>{qty}</span>
      <button type="button" onClick={onAdd} disabled={disabled || qty >= max} className={`${btn} flex items-center justify-center font-medium text-white`} style={{ background: "#1989fa" }}>+</button>
    </div>
  );
}

function chipCls(active: boolean, variant: "student" | "scanner" | "mobile") {
  if (active) {
    return variant === "scanner"
      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300 border-2"
      : variant === "mobile"
        ? "border-[#1989fa] bg-[#f4f9ff] text-[#1989fa] border-2"
        : "border-[var(--student-primary)] bg-[var(--student-primary-soft)] text-[var(--student-primary)] border-2";
  }
  return variant === "scanner"
    ? "border-[var(--app-color-border-default)] text-[var(--app-color-text-primary)]"
    : variant === "mobile"
      ? "border-[#e6e8eb] text-[#323233]"
      : "border-[var(--student-hairline)] text-[var(--student-body)]";
}

function popoverShellCls(variant: "student" | "scanner" | "mobile") {
  if (variant === "scanner") {
    return "bg-[var(--app-color-surface-elevated)] border-[var(--app-color-border-default)] shadow-[var(--app-shadow-elevated)]";
  }
  if (variant === "mobile") {
    return "bg-white border-[#ebecef] shadow-lg";
  }
  return "bg-white border-[var(--student-hairline)] shadow-lg";
}

function popoverZIndex(variant: "student" | "scanner" | "mobile") {
  if (variant === "scanner") return Z_INDEX.bizOverlay + 20;
  return undefined;
}

interface PopoverAnchor {
  top: number;
  left: number;
  minWidth: number;
  maxWidth: number;
}

const VIEWPORT_PAD = 8;
const ANCHOR_GAP = 6;

/**
 * 根据视口剩余空间决定弹窗位置：
 * - 垂直：优先在按钮下方，不够则翻到上方
 * - 水平：右侧空间多则向右展开（左缘贴按钮左），否则向左展开（右缘贴按钮右）
 */
function measurePopoverLayout(button: HTMLElement, popover?: HTMLElement | null): PopoverAnchor {
  const btn = button.getBoundingClientRect();
  const minWidth = Math.ceil(btn.width);
  const expandRight = window.innerWidth - VIEWPORT_PAD - btn.left;
  const expandLeft = btn.right - VIEWPORT_PAD;
  const maxWidth = Math.min(
    window.innerWidth - VIEWPORT_PAD * 2,
    Math.max(minWidth, Math.max(expandRight, expandLeft)),
  );

  const placeVertical = (popH: number) => {
    const spaceBelow = window.innerHeight - VIEWPORT_PAD - btn.bottom - ANCHOR_GAP;
    const spaceAbove = btn.top - ANCHOR_GAP - VIEWPORT_PAD;
    let top =
      spaceBelow >= popH || spaceBelow >= spaceAbove
        ? btn.bottom + ANCHOR_GAP
        : btn.top - ANCHOR_GAP - popH;
    return Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - VIEWPORT_PAD - popH));
  };

  const placeHorizontal = (popW: number) => {
    const fitsRight = expandRight >= popW;
    const fitsLeft = expandLeft >= popW;
    let left: number;

    if (fitsRight && (expandRight >= expandLeft || !fitsLeft)) {
      left = btn.left;
    } else if (fitsLeft) {
      left = btn.right - popW;
    } else if (expandRight >= expandLeft) {
      left = btn.left;
    } else {
      left = btn.right - popW;
    }

    return Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - VIEWPORT_PAD - popW));
  };

  if (!popover) {
    const estW = minWidth;
    return {
      top: placeVertical(120),
      left: placeHorizontal(estW),
      minWidth,
      maxWidth,
    };
  }

  const pop = popover.getBoundingClientRect();
  return {
    top: placeVertical(pop.height),
    left: placeHorizontal(pop.width),
    minWidth,
    maxWidth,
  };
}

/** 卡片内嵌：选择规格按钮 + 局部弹出层 */
export function MaterialSpecPickControl({
  item,
  cart,
  variant = "student",
  disabled,
  onAddKey,
  onDecKey,
  onAddPlain,
  onDecPlain,
}: {
  item: MaterialSpecPickerItem;
  cart: Record<string, number>;
  variant?: "student" | "scanner" | "mobile";
  disabled?: boolean;
  onAddKey: (cartKey: string) => void;
  onDecKey: (cartKey: string) => void;
  onAddPlain: () => void;
  onDecPlain: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selections, setSelections] = useState<MultiSpecSelections>({});
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);

  const dimensions = useMemo(() => parseSpecDimensions(item.specSchema), [item.specSchema]);
  const allCombos = useMemo(() => generateSpecCombos(dimensions), [dimensions]);
  const selectionReady = isMultiSpecSelectionReady(dimensions, selections);
  const activeCombos = useMemo(() => {
    if (!selectionReady) return [];
    return filterCombosByMultiSelections(allCombos, selections);
  }, [allCombos, selectionReady, selections]);

  const maxQty = maxQtyForMaterialItem(item);
  const soldOut = maxQty <= 0 || disabled;
  const itemCartQty = sumCartQtyForItem(cart, item.id);
  const specRequired = Number(item.specRequired) === 1;
  const showPlainRow = !specRequired && !hasAnyMultiSpecSelection(selections);

  const updateAnchor = () => {
    if (!buttonRef.current) return;
    setAnchor(measurePopoverLayout(buttonRef.current, popoverRef.current));
  };

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    updateAnchor();
    const ro =
      typeof ResizeObserver !== "undefined" && popoverRef.current
        ? new ResizeObserver(() => updateAnchor())
        : null;
    ro?.observe(popoverRef.current!);
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [open, selectionReady, activeCombos.length, showPlainRow, dimensions.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const triggerCls =
    variant === "scanner"
      ? cn(
          "relative shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
          open
            ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
            : "border-cyan-500/40 bg-cyan-500/15 text-cyan-400",
          soldOut && "opacity-40 cursor-not-allowed",
        )
      : variant === "mobile"
        ? cn(
            "relative shrink-0 px-3 h-7 rounded-full text-xs font-semibold border transition-colors",
            open
              ? "border-[#ac1736] bg-[rgba(172,23,54,0.14)] text-[#ac1736]"
              : "border-[rgba(172,23,54,0.25)] bg-[rgba(172,23,54,0.08)] text-[#ac1736]",
            soldOut && "opacity-45",
          )
        : cn(
            "relative shrink-0 px-3 h-7 rounded-full text-[12px] font-semibold border transition-colors",
            open
              ? "border-[var(--student-primary)] bg-[var(--student-primary-soft)] text-[var(--student-primary)]"
              : "border-[var(--student-primary)]/25 bg-[var(--student-primary-soft)] text-[var(--student-primary)]",
            soldOut && "opacity-40 cursor-not-allowed",
          );

  return (
    <div className="relative inline-flex shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={soldOut}
        onClick={() => setOpen((v) => !v)}
        className={triggerCls}
      >
        选择规格
        {itemCartQty > 0 && (
          <span
            className={cn(
              "absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 text-[10px] text-white text-center leading-4 rounded-full bg-[var(--student-danger)]",
              variant === "scanner" && "min-w-[14px] h-3.5 text-[9px] leading-[14px] -top-1 -right-1",
            )}
          >
            {itemCartQty}
          </span>
        )}
      </button>

      {open && anchor && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              className={cn(
                "fixed w-max rounded-[var(--student-radius-md,10px)] border p-3 space-y-2.5 max-h-[min(60vh,360px)] overflow-y-auto overflow-x-hidden",
                variant !== "scanner" && "z-[var(--z-dropdown)]",
                popoverShellCls(variant),
              )}
              style={{
                top: anchor.top,
                left: anchor.left,
                minWidth: anchor.minWidth,
                maxWidth: anchor.maxWidth,
                width: "max-content",
                zIndex: popoverZIndex(variant),
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
          {/* Popover header with close button */}
          <div className="flex items-center justify-between mb-1">
            <span className={cn("text-[13px] font-semibold", variant === "scanner" ? "text-[var(--app-color-text-primary)]" : "text-[var(--student-ink)]")}>选择规格</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn("rounded-full p-0.5 hover:bg-[var(--student-canvas-soft)] transition-colors", "text-[var(--student-mute)]")}
            >
              <X className="size-3.5" />
            </button>
          </div>
          {dimensions.map((dim) => (
            <div key={dim.name}>
              <p
                className={cn(
                  "text-[11px] mb-1",
                  variant === "scanner" ? "text-[var(--app-color-text-tertiary)]" : "text-[var(--student-mute)]",
                  variant === "mobile" && "text-[#969799]",
                )}
              >
                {dim.name}
              </p>
              <div className="flex flex-wrap gap-1">
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
                        "px-2 py-0.5 rounded-full text-[11px] border transition-colors",
                        chipCls(active, variant),
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {selectionReady && activeCombos.length > 0 && (
            <div
              className={cn(
                "space-y-2 pt-2 border-t",
                variant === "scanner" ? "border-[var(--app-color-border-default)]" : "border-[var(--student-hairline)]",
                variant === "mobile" && "border-[#ebecef]",
              )}
            >
              {activeCombos.map((combo) => (
                <div key={combo.key} className={cn("flex items-center justify-between gap-2 rounded-lg px-2 py-1.5", variant === "scanner" ? "bg-[var(--app-color-surface-hover)]" : variant === "mobile" ? "bg-[#f7f8fa]" : "bg-[var(--student-canvas-soft)]")}>
                  <span
                    className={cn(
                      "text-[12px] flex-1 min-w-0 truncate",
                      variant === "scanner" ? "text-[var(--app-color-text-primary)]" : "text-[var(--student-body)]",
                      variant === "mobile" && "text-[#323233]",
                    )}
                  >
                    {combo.label}
                  </span>
                  <QtyStepper
                    qty={cart[buildSpecCartKey(item.id, combo.key)] || 0}
                    max={maxQty}
                    disabled={soldOut}
                    compact
                    variant={variant}
                    onAdd={() => onAddKey(buildSpecCartKey(item.id, combo.key))}
                    onDec={() => onDecKey(buildSpecCartKey(item.id, combo.key))}
                  />
                </div>
              ))}
            </div>
          )}

          {showPlainRow && (
            <div
              className={cn(
                "flex items-center justify-between gap-2 pt-2 border-t border-dashed",
                variant === "scanner" ? "border-[var(--app-color-border-default)]" : "border-[var(--student-hairline)]",
                variant === "mobile" && "border-[#e8eaed]",
              )}
            >
              <span
                className={cn(
                  "text-[11px] flex-1 min-w-0",
                  variant === "scanner" ? "text-[var(--app-color-text-secondary)]" : "text-[var(--student-mute)]",
                  variant === "mobile" && "text-[#646566]",
                )}
              >
                默认（不选规格）
              </span>
              <QtyStepper
                qty={cart[String(item.id)] || 0}
                max={maxQty}
                disabled={soldOut}
                compact
                variant={variant}
                onAdd={onAddPlain}
                onDec={onDecPlain}
              />
            </div>
          )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
