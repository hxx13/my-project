/**
 * H5 申领数量步进器 — 圆角方形控件 ~28–32px；外层 padding 扩展触控区。
 * qty=0 时仅显示 +；qty>0 时显示 − / 居中数量 / +（各自独立圆角方形按钮）。
 */
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const SPINNER_HIDDEN =
  "[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const CTRL_RADIUS = "rounded-[var(--student-radius-sm)]";

export function MobileMaterialQtyStepper({
  qty,
  max,
  disabled,
  compact,
  onAdd,
  onDec,
  onQtyBlur,
}: {
  qty: number;
  max: number;
  disabled?: boolean;
  compact?: boolean;
  onAdd: () => void;
  onDec: () => void;
  onQtyBlur?: (raw: string) => void;
}) {
  const soldOut = max <= 0 || disabled;
  const atMax = qty >= max;
  const showQty = qty > 0;
  const cellSize = compact ? "size-7" : "size-8";
  const iconSize = compact ? "size-3" : "size-3.5";
  const qtyTextSize = compact ? "text-[11px]" : "text-xs";
  const qtyCellClass = cn(
    cellSize,
    CTRL_RADIUS,
    "flex shrink-0 items-center justify-center border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-center font-semibold tabular-nums leading-none text-[var(--student-ink)]",
    qtyTextSize,
  );

  if (!showQty) {
    return (
      <div className="-m-1 inline-flex shrink-0 p-1" role="group" aria-label="数量">
        <button
          type="button"
          onClick={onAdd}
          disabled={soldOut || atMax}
          aria-label="增加数量"
          className={cn(
            cellSize,
            CTRL_RADIUS,
            "flex items-center justify-center border border-[var(--student-hairline)] transition-colors",
            soldOut || atMax
              ? "cursor-not-allowed bg-[var(--student-hairline)] text-[var(--student-mute)] opacity-45"
              : "bg-[var(--student-primary)] text-[var(--student-primary-foreground)] hover:bg-[var(--student-primary-hover)] active:bg-[var(--student-primary-pressed)]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--student-primary)]",
            "motion-reduce:transition-none",
          )}
        >
          <Plus className={iconSize} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "-m-1 inline-flex shrink-0 items-center gap-0.5 p-1",
        soldOut && "opacity-45",
      )}
      role="group"
      aria-label="数量"
    >
      <button
        type="button"
        onClick={onDec}
        disabled={soldOut}
        aria-label="减少数量"
        className={cn(
          cellSize,
          CTRL_RADIUS,
          "flex items-center justify-center border border-[var(--student-hairline)] bg-[var(--student-surface)] text-[var(--student-ink)] transition-colors",
          "hover:bg-[var(--student-canvas-soft)] active:bg-[var(--student-primary-muted)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--student-primary)]",
          "disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-[var(--student-surface)]",
          "motion-reduce:transition-none",
        )}
      >
        <Minus className={iconSize} aria-hidden />
      </button>

      {onQtyBlur ? (
        <input
          type="number"
          inputMode="numeric"
          aria-label="数量"
          className={cn(
            SPINNER_HIDDEN,
            qtyCellClass,
            "m-0 p-0",
            "focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--student-primary-muted)]",
          )}
          value={qty}
          disabled={soldOut}
          onChange={(e) => onQtyBlur(e.target.value)}
          onBlur={(e) => onQtyBlur(e.target.value)}
        />
      ) : (
        <span className={qtyCellClass} aria-live="polite">
          {qty}
        </span>
      )}

      <button
        type="button"
        onClick={onAdd}
        disabled={soldOut || atMax}
        aria-label="增加数量"
        className={cn(
          cellSize,
          CTRL_RADIUS,
          "flex items-center justify-center border border-[var(--student-hairline)] transition-colors",
          soldOut || atMax
            ? "cursor-not-allowed bg-[var(--student-hairline)] text-[var(--student-mute)]"
            : "bg-[var(--student-primary)] text-[var(--student-primary-foreground)] hover:bg-[var(--student-primary-hover)] active:bg-[var(--student-primary-pressed)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--student-primary)]",
          "motion-reduce:transition-none",
        )}
      >
        <Plus className={iconSize} aria-hidden />
      </button>
    </div>
  );
}
