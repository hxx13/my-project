import { useId } from "react";
import type { JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";

type FieldGridProps = { children: ReactNode; className?: string };

type FieldCellProps = {
  span: 12 | 6 | 4;
  label?: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "warn";
  children: ReactNode | ((controlId: string) => ReactNode);
};

/**
 * 本项目的列起点使用约定：合法列起点仅 1/5/7/9（跨度只允许 span 12/6/4）。
 * 供单测与 Playwright 测量脚本复用。参数非法时返回全 0，不产生负偏移。
 */
export function gridColumnStarts(containerWidth: number, gutterPx: number): number[] {
  if (containerWidth <= 0) return [0, 0, 0, 0];
  const colWidth = (containerWidth - 11 * gutterPx) / 12;
  if (colWidth < 0) return [0, 0, 0, 0];
  return [1, 5, 7, 9].map((i) => (i - 1) * (colWidth + gutterPx));
}

/** 表单栅格容器。必须渲染 data-grid="12"（后续 Playwright 测量脚本依赖）。 */
export function FieldGrid({ children, className }: FieldGridProps): JSX.Element {
  return (
    <div data-grid="12" className={cn("grid grid-cols-12 gap-4", className)}>
      {children}
    </div>
  );
}

const SPAN_CLASS: Record<FieldCellProps["span"], string> = {
  12: "col-span-12",
  6: "col-span-6",
  4: "col-span-4",
};

/** 栅格单元格：span 12/6/4 → grid-column: span N。label 通过 htmlFor 关联控件。 */
export function FieldCell({ span, label, hint, tone = "default", children }: FieldCellProps): JSX.Element {
  const controlId = useId();
  return (
    <div className={SPAN_CLASS[span]}>
      {label != null ? (
        <label
          htmlFor={controlId}
          className={cn(
            "mb-1 block text-xs font-medium",
            tone === "warn" ? "text-[var(--app-color-feedback-warning)]" : "text-[var(--app-color-text-secondary)]"
          )}
        >
          {label}
        </label>
      ) : null}
      <div className="min-w-0">{typeof children === "function" ? children(controlId) : children}</div>
      {hint != null ? (
        <div
          className={cn(
            "mt-1 text-xs",
            tone === "warn" ? "text-[var(--app-color-feedback-warning)]" : "text-[var(--app-color-text-secondary)]"
          )}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
