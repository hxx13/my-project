import type { ReactNode } from "react";
import { AdminButton } from "./AdminButton";
import { cn } from "@/lib/utils";

/**
 * 勾选后出现在表格上方的批量操作条。动作由调用方通过 children 给（本组件不预设任何操作）。
 * count <= 0 时整条不渲染，调用方不必自己判断。
 */
export function AdminBatchBar({
  count,
  onClear,
  children,
  className,
}: {
  count: number;
  onClear: () => void;
  children?: ReactNode;
  className?: string;
}) {
  if (count <= 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-[var(--app-color-border-strong)] bg-[var(--app-color-accent-soft)] px-3 py-2 text-xs text-[var(--app-color-text-secondary)]",
        className
      )}
    >
      <span>
        已选 <b className="text-[var(--app-color-text-primary)]">{count}</b> 条
      </span>
      <span className="h-3.5 w-px bg-[var(--app-color-border-strong)]" aria-hidden />
      {children}
      <AdminButton tone="ghost" className="ml-auto h-7 px-2 text-xs" onClick={onClear}>
        取消选择
      </AdminButton>
    </div>
  );
}
