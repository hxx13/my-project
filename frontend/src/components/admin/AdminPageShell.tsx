import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminPageShellProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * 后台内容区统一页头：与 `AdminLayout` 外层 `main` 的 `p-6` 配合，壳内不再重复外边距。
 */
export function AdminPageShell({ title, description, actions, children, className }: AdminPageShellProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex flex-col gap-3 border-b border-neutral-200/90 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-950 sm:text-2xl">{title}</h2>
          {description ? <div className="max-w-3xl text-sm leading-relaxed text-neutral-600">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

type AdminTableShellProps = {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyMessage?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 长表纵向滚动时表头 sticky（见 index.css .admin-table-shell-inner thead th） */
  scrollable?: boolean;
};

/** 列表页表格容器：统一边框、横向滚动、加载/错误/空态 */
export function AdminTableShell({
  loading,
  error,
  onRetry,
  empty,
  emptyMessage = "暂无数据",
  children,
  className,
  scrollable,
}: AdminTableShellProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className={cn(
          "flex min-h-[200px] items-center justify-center rounded-xl border border-neutral-200/90 bg-white text-sm text-neutral-500 ring-1 ring-black/[0.02]",
          className
        )}
      >
        加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className={cn(
          "flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-rose-200/90 bg-rose-50/50 p-6 text-center text-sm text-rose-800 ring-1 ring-rose-100/80",
          className
        )}
      >
        <p>{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-50">
            重试
          </button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-neutral-200/90 bg-neutral-50/90 text-sm text-neutral-500",
          className
        )}
      >
        {emptyMessage}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-neutral-200/90 bg-white shadow-sm ring-1 ring-black/[0.02]",
        className
      )}
    >
      <div
        className={cn(
          "admin-table-shell-inner min-w-0",
          scrollable && "max-h-[min(72vh,780px)] overflow-y-auto overscroll-y-contain"
        )}
      >
        {children}
      </div>
    </div>
  );
}

type AdminDataTableWrapProps = {
  children: ReactNode;
  className?: string;
  /** 启用纵向滚动 + 表头 sticky（长表可编辑列表推荐开启） */
  scrollable?: boolean;
};

/**
 * 未走 AdminTableShell 加载态时的表格外框：与 `index.css` 中 `.admin-data-table-wrap` 样式配套。
 */
export function AdminDataTableWrap({ children, className, scrollable }: AdminDataTableWrapProps) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-neutral-200/90 bg-white shadow-sm ring-1 ring-black/[0.02]",
        className
      )}
    >
      <div
        className={cn(
          "admin-data-table-wrap min-w-0",
          scrollable && "max-h-[min(72vh,780px)] overflow-y-auto overscroll-y-contain"
        )}
      >
        {children}
      </div>
    </div>
  );
}

type AdminFormCardProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** 长表单分区卡片 */
export function AdminFormCard({ title, description, children, className }: AdminFormCardProps) {
  return (
    <section className={cn("rounded-xl border border-neutral-200/90 bg-white p-5 shadow-sm ring-1 ring-black/[0.02]", className)}>
      <div className="mb-3 border-b border-neutral-100 pb-2">
        <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
        {description ? <div className="mt-1 text-xs text-neutral-500">{description}</div> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
