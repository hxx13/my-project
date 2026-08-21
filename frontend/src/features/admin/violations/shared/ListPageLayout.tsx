import type { JSX, ReactNode } from "react";

type ListPageLayoutProps = {
  toolbar: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * 列表页固定高度壳：工具栏固定、主体唯一滚动、页脚固定，整页不滚。
 * 父级必须是有界高度的 flex 容器（如 AdminPageShell fillHeight 内），否则 flex-1 min-h-0
 * 不成立，会退化成整页滚动。
 * 参照：src/pages/AdminInventoryPage.tsx
 */
export function ListPageLayout({ toolbar, children, footer }: ListPageLayoutProps): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">{toolbar}</div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-y-contain">{children}</div>
      {footer != null ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}
