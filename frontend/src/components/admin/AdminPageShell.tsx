import { useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminPageShellProps = {
  /** 页标题。不传时 header 区域完全不渲染（紧凑双滚动布局） */
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 占满 AdminLayout 剩余高度：工具栏固定、表格区独立滚动（见 UI 规范 §高度链） */
  fillHeight?: boolean;
};

/**
 * 后台内容区统一页壳。
 * 当 title / description / actions 均未传入时，不渲染 header 区域，内容区直接顶满。
 */
export function AdminPageShell({ title, description, actions, children, className, fillHeight }: AdminPageShellProps) {
  const hasHeader = !!(title || description || actions);

  return (
    <div className={cn(
      fillHeight ? "flex h-full min-h-0 flex-col gap-6" : hasHeader ? "space-y-6" : "",
      className
    )}>
      {hasHeader && (
        <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--app-color-border-default)] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            {title ? <h2 className="text-xl font-semibold tracking-tight text-[var(--app-color-text-primary)] sm:text-2xl">{title}</h2> : null}
            {description ? <div className="max-w-3xl text-sm leading-relaxed text-[var(--app-color-text-secondary)]">{description}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {fillHeight ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : children}
    </div>
  );
}

type AdminFillScrollRegionProps = {
  children: ReactNode;
  className?: string;
};

/** fillHeight 页壳内的可滚动主体（表格、长列表） */
export function AdminFillScrollRegion({ children, className }: AdminFillScrollRegionProps) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-auto overscroll-y-contain", className)}>
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
  const tableRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <div role="status" aria-busy="true" aria-live="polite"
        className={cn("flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]", className)}
      >
        加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div className={cn("flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--app-color-feedback-error)]/30 bg-[var(--app-color-feedback-danger-soft)] p-6 text-center text-sm text-[var(--app-color-feedback-error)]", className)}>
        <p>{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="rounded-lg border border-[var(--app-color-feedback-error)]/40 bg-[var(--app-color-surface-container)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-feedback-error)] hover:bg-[var(--app-color-surface-hover)]">重试</button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-sm text-[var(--app-color-text-tertiary)]",
          className
        )}
      >
        {emptyMessage}
      </div>
    );
  }
  return (
    <div
      ref={tableRef}
      className={cn(
        "overflow-x-auto rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm",
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
        "overflow-x-auto rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm",
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
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/** 长表单分区卡片。当 title / description / actions 均未传入时，不渲染 header 区域。 */
export function AdminFormCard({ title, description, actions, children, className, style }: AdminFormCardProps) {
  const hasHeader = !!(title || description || actions);
  return (
    <section className={cn("rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm", className)} style={style}>
      {hasHeader ? (
        <div className="mb-3 flex items-start justify-between border-b border-[var(--app-color-border-default)] pb-2">
          <div>
            {title ? <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)]">{title}</h3> : null}
            {description ? <div className="mt-1 text-xs text-[var(--app-color-text-tertiary)]">{description}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={hasHeader ? "space-y-3" : undefined}>{children}</div>
    </section>
  );
}
