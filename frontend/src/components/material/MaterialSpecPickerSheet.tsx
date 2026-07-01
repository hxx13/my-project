/**
 * 规格选择触发按钮 + Bottom Sheet 弹出层。
 * 所有场景（student / scanner / mobile）统一使用 SpecSheet 底部抽屉。
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MaterialSpecPickerItem } from "@/utils/materialSpecHelpers";
import { sumCartQtyForItem, maxQtyForMaterialItem } from "@/utils/materialSpecHelpers";
import { SpecSheet } from "./SpecSheet";

/** 卡片内嵌：选择规格按钮 + SpecSheet 底部抽屉 */
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
  const [open, setOpen] = useState(false);

  const maxQty = maxQtyForMaterialItem(item);
  const soldOut = maxQty <= 0 || disabled;
  const itemCartQty = sumCartQtyForItem(cart, item.id);

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
    <>
      <button
        type="button"
        disabled={soldOut}
        onClick={() => setOpen(true)}
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

      <SpecSheet
        open={open}
        onOpenChange={setOpen}
        item={item}
        cart={cart}
        onAddKey={onAddKey}
        onDecKey={onDecKey}
        onAddPlain={onAddPlain}
        onDecPlain={onDecPlain}
      />
    </>
  );
}
