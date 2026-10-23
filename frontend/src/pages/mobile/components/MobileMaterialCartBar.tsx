/**
 * H5 申领底栏 —— 与小程序一致：左侧购物车入口（带数量），右侧申领单入口。
 * 提交动作在购物车抽屉里，底栏不放 CTA。
 */
import { ShoppingCart } from "lucide-react";

type Props = {
  cartCount: number;
  onOpenCart: () => void;
  onOpenRequests: () => void;
};

export function MobileMaterialCartBar({ cartCount, onOpenCart, onOpenRequests }: Props) {
  const hasItems = cartCount > 0;
  return (
    <div
      className="shrink-0 border-t border-[var(--student-hairline)] bg-[var(--student-surface)]"
      style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex h-11 items-center gap-2 px-3">
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={hasItems ? `购物车，共 ${cartCount} 件` : "购物车，暂无物品"}
          className="relative flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--student-canvas-soft-2)] px-4 py-2 text-[13px] font-semibold text-[var(--student-body)]"
        >
          <ShoppingCart className="size-4 shrink-0" aria-hidden />
          <span>购物车</span>
          {hasItems && (
            <span
              className="ml-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[var(--student-danger)] px-1 text-[10px] font-bold leading-none text-white"
              aria-hidden
            >
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenRequests}
          className="shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold"
          style={{ background: "rgba(37,99,235,0.12)", color: "#2563eb" }}
        >
          申领单
        </button>
      </div>
    </div>
  );
}
