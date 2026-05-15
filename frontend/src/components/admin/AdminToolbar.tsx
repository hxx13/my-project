import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminToolbarProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

/**
 * 后台列表页工具栏：筛选与主操作横排换行，主输入区可收缩（Fluent 命令栏轻量版）。
 * 间距使用 `index.css` 中 `--admin-toolbar-gap` / `--admin-toolbar-row-gap`。
 */
export function AdminToolbar({ className, children, ...props }: AdminToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        "flex flex-wrap items-end gap-x-[var(--admin-toolbar-gap,0.5rem)] gap-y-[var(--admin-toolbar-row-gap,0.75rem)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** 主筛选区：占满剩余宽度并可收缩，避免把按钮挤到下一行时仍独占整行 */
export function AdminToolbarPrimary({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 flex-1 basis-[min(100%,20rem)]", className)} {...props} />;
}

/** 按钮组等：不换行优先收缩由 Primary 承担 */
export function AdminToolbarActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 flex-wrap items-center gap-2", className)} {...props} />;
}
