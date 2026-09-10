import { cn } from "@/lib/utils";
import { AdminFormInput, AdminFormSelect } from "@/components/admin/AdminFormPrimitives";

/** 与工具栏一致的描边按钮风格 */
const pagerBtn =
  "rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed";

/* ================================================================== */
/*  PaginationBar — 设施检查维护各 tab 共用的分页条                        */
/*  放在固定高度链的固定区，根节点带 shrink-0，不参与内容区滚动             */
/* ================================================================== */

export type PaginationBarProps = {
  page: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
  onSizeChange?: (size: number) => void;
  sizeOptions?: number[];
  className?: string;
  /** 加载中禁用所有可触发请求的控件（翻页按钮、跳页输入、每页条数） */
  disabled?: boolean;
};

export function PaginationBar({
  page,
  size,
  total,
  onPageChange,
  onSizeChange,
  sizeOptions = [20, 50, 100],
  className,
  disabled = false,
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, size)));
  // 若当前 size 不在候选里（如调用方传入 10），补进下拉以免选中态空白
  const options = sizeOptions.includes(size) ? sizeOptions : [size, ...sizeOptions];

  const jump = (el: HTMLInputElement) => {
    if (disabled) {
      el.value = String(page);
      return;
    }
    const raw = el.value;
    if (raw.trim() !== "") {
      const n = Number(raw);
      if (Number.isFinite(n) && Number.isInteger(n)) {
        const clamped = Math.min(totalPages, Math.max(1, n));
        if (clamped !== page) onPageChange(clamped);
      }
    }
    el.value = String(page);
  };

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-3 text-xs text-[var(--app-color-text-secondary)]",
        className
      )}
    >
      <span>
        第 {page} / 共 {totalPages} 页 · 共 {total} 条
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {onSizeChange && (
          <label className="flex items-center gap-1.5">
            每页
            <AdminFormSelect
              className="w-auto"
              value={size}
              disabled={disabled}
              onChange={(e) => onSizeChange(Number(e.target.value))}
            >
              {options.map((s) => (
                <option key={s} value={s}>
                  {s} 条
                </option>
              ))}
            </AdminFormSelect>
          </label>
        )}

        <button
          type="button"
          className={pagerBtn}
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </button>
        <button
          type="button"
          className={pagerBtn}
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </button>

        <label className="flex items-center gap-1.5">
          跳至
          <AdminFormInput
            key={page}
            type="number"
            min={1}
            max={totalPages}
            defaultValue={page}
            disabled={disabled}
            className="w-16"
            onKeyDown={(e) => {
              if (e.key === "Enter") jump(e.currentTarget);
            }}
            onBlur={(e) => jump(e.currentTarget)}
          />
        </label>
      </div>
    </div>
  );
}
