import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { cageJumpQuery } from "@/utils/cageClaimReviewDisplay";

/**
 * 订单行上的「笼位位置 + 定位」。
 *
 * 位置取的是**下单那一刻**的坐标快照（`ref_order_line.target_cage_location`），
 * 笼位后来被搬动也不影响历史单。定位复用笼架页现成的 `?jumpShelveId&jumpX&jumpY`
 * 跳转参数（与笼位申请/分笼转移同一套），落点画十字交叉高亮 —— 不新造组件。
 */
export default function CageLocationCell({
  label,
  location,
  onLocate,
  basePath = "/admin/cage-shelves",
  className = "",
}: {
  /** 人读串，如「浦东 / A101 / 架3 (4,5)」 */
  label?: string | null;
  location?: {
    shelveId?: string | null;
    positionX?: number | null;
    positionY?: number | null;
  } | null;
  /**
   * 自定义定位行为。**购物车用这个**：在订购页就地打开笼位抽屉并定位那一格，
   * 而不是跳去笼架页。审核/订单记录页不给它，走下面默认的跳转。
   */
  onLocate?: () => void;
  /** 默认跳转目标页（仅在没有 onLocate 时用） */
  basePath?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const query = cageJumpQuery({
    shelveId: location?.shelveId,
    positionX: location?.positionX,
    positionY: location?.positionY,
  });
  const canLocate = !!onLocate || !!query;
  if (!label && !canLocate) return null;

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <MapPin className="h-3 w-3 shrink-0 text-[var(--app-color-text-tertiary,var(--twin-mute))]" aria-hidden />
      <span className="min-w-0 truncate" title={label ?? undefined}>
        {label || "已选笼位"}
      </span>
      {canLocate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onLocate) onLocate();
            else navigate(toAdminRoutePath(basePath) + query);
          }}
          className="shrink-0 text-[11px] text-[var(--app-color-accent,var(--twin-link))] hover:underline"
        >
          定位
        </button>
      )}
    </span>
  );
}
