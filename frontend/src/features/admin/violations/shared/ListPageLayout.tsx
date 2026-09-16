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
 *
 * 主体只滚纵向（overflow-x-hidden）：横向滚动归各页自己的表格容器。
 * 这里若开 overflow-x auto，任何子元素哪怕溢出一个亚像素（DPR 1.5 下分页器按钮实测
 * clientWidth 966 / scrollWidth 967，翻页换数字时必现）都会在整页底部画出一条横向滚动条，
 * 看着像是"表格外面又冒出第二个滚动条"。
 * 注意不能只写 overflow-y-auto —— overflow-x:visible + overflow-y:auto 会被规范强制
 * 计算成 overflow-x:auto，等于没改。
 */
export function ListPageLayout({ toolbar, children, footer }: ListPageLayoutProps): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">{toolbar}</div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">{children}</div>
      {footer != null ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}
