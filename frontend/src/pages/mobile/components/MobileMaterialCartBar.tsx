/**
 * H5 申领底栏 — 单行 commerce toolbar：左侧申领栏入口 + 右侧提交 CTA。
 */
import { Loader2, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  cartCount: number;
  submitting: boolean;
  onOpenCart: () => void;
  onSubmit: () => void;
};

export function MobileMaterialCartBar({ cartCount, submitting, onOpenCart, onSubmit }: Props) {
  const hasItems = cartCount > 0;

  return (
    <div
      className="shrink-0 border-t border-[var(--student-hairline)] bg-[var(--student-surface)] shadow-[0_-1px_0_var(--student-hairline)]"
      style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex h-10 items-center gap-2 px-3">
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={hasItems ? `申领栏，共 ${cartCount} 件` : "申领栏，暂无物品"}
          className={cn(
            "relative -ml-1 flex shrink-0 items-center gap-1 rounded-[var(--student-radius-sm)] px-1.5 py-1",
            "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] active:bg-[var(--student-primary-muted)]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--student-primary)]",
            "motion-reduce:transition-none transition-colors",
          )}
        >
          <ShoppingCart className="size-4 shrink-0" aria-hidden />
          <span className="text-[11px] font-medium">申领栏</span>
          {hasItems && (
            <span
              className="ml-0.5 flex min-h-[14px] min-w-[14px] items-center justify-center rounded-[var(--student-radius-sm)] bg-[var(--student-danger)] px-0.5 text-[9px] font-bold leading-none text-white"
              aria-hidden
            >
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1" aria-hidden />

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !hasItems}
          className={cn(
            "flex h-8 shrink-0 items-center justify-center gap-1 rounded-[var(--student-radius-sm)] px-3 text-xs font-semibold",
            "bg-[var(--student-primary)] text-[var(--student-primary-foreground)]",
            "hover:bg-[var(--student-primary-hover)] active:bg-[var(--student-primary-pressed)]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--student-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--student-primary)]",
            "motion-reduce:transition-none transition-colors",
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
              提交中…
            </>
          ) : hasItems ? (
            <>提交申领 · {cartCount} 件</>
          ) : (
            "提交申领"
          )}
        </button>
      </div>
    </div>
  );
}
