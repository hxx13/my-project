import { AdminSelect } from "./AdminSelect";
import { cn } from "@/lib/utils";

type Props = {
  total: number;
  page: number;
  size: number;
  onPageChange: (page: number) => void;
  /** 不传则不显示「每页 N 条」选择器 */
  onSizeChange?: (size: number) => void;
  pageSizes?: number[];
  className?: string;
};

/** 页码窗口：页数少就全列；多则首尾固定，中间只留当前左右各一，其余省略 */
function pageWindow(current: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(totalPages - 1, current + 1);
  if (from > 2) out.push("gap");
  for (let p = from; p <= to; p += 1) out.push(p);
  if (to < totalPages - 1) out.push("gap");
  out.push(totalPages);
  return out;
}

const pageBtn =
  "h-7 min-w-[28px] rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-xs text-[var(--app-color-text-secondary)] transition-colors hover:bg-[var(--app-color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--app-color-surface-container)]";

/** 受控分页条：总条数 / 每页条数 / 页码。只负责展示与回调，状态由调用方持有 */
export function AdminPagination({
  total,
  page,
  size,
  onPageChange,
  onSizeChange,
  pageSizes = [20, 50, 100],
  className,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), totalPages);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--app-color-text-tertiary)]",
        className
      )}
    >
      <span>共 {total} 条</span>

      {onSizeChange ? (
        <span className="flex items-center gap-1.5">
          每页
          <AdminSelect
            className="h-7 px-2 text-xs"
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
          >
            {pageSizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </AdminSelect>
          条
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className={pageBtn}
          disabled={current <= 1}
          aria-label="上一页"
          onClick={() => onPageChange(current - 1)}
        >
          ‹
        </button>

        {pageWindow(current, totalPages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={cn(
                pageBtn,
                p === current &&
                  "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-white hover:bg-[var(--app-color-accent)]"
              )}
              aria-current={p === current ? "page" : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          className={pageBtn}
          disabled={current >= totalPages}
          aria-label="下一页"
          onClick={() => onPageChange(current + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
