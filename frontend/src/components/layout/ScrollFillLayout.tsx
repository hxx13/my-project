import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type LayoutProps = {
  children: ReactNode;
  className?: string;
};

/**
 * 标准「顶栏固定 + 下方滚动」高度链。
 * 用于 filter/tab 切换后内容区被 flex min-height:auto 截断的场景。
 *
 * 规则：容器给 flex-1 时必须同时给 min-h-0（默认 min-height:auto 不缩，内容会顶破父容器
 * 导致整页下滚）；固定区一律 shrink-0；滚动只发生在指定区域。
 * 参照实现：src/pages/AdminInventoryPage.tsx
 */
export function FillHeightColumn({ children, className }: LayoutProps) {
  return <div className={cn("flex h-full min-h-0 flex-col", className)}>{children}</div>;
}

/** 占据剩余高度并可纵向滚动的区域 */
export function FillHeightScroll({ children, className }: LayoutProps) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-y-contain", className)}>
      {children}
    </div>
  );
}

type SplitSidebarScrollLayoutProps = {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  sidebarClassName?: string;
  contentClassName?: string;
};

/** 左侧分类/筛选 + 右侧列表：两侧均可独立滚动 */
export function SplitSidebarScrollLayout({
  sidebar,
  children,
  className,
  sidebarClassName,
  contentClassName,
}: SplitSidebarScrollLayoutProps) {
  return (
    <div className={cn("flex min-h-0 flex-1", className)}>
      <aside className={cn("min-h-0 shrink-0 overflow-y-auto overscroll-y-contain", sidebarClassName)}>
        {sidebar}
      </aside>
      <div className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
