import { useId } from "react";
import type { JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";

type InspectorGroupProps = { title: string; children: ReactNode };

type InspectorRowProps = {
  label: string;
  stack?: boolean;
  hint?: ReactNode;
  tone?: "default" | "warn" | "error";
  /** 必填：标签旁显示红色 * */
  required?: boolean;
  children: ReactNode | ((controlId: string) => ReactNode);
};

/**
 * 检查器分组。渲染为检查器单卡内部的分隔线分区（非独立浮动卡）：
 * 首区贴卡顶，后续区以顶部分隔线隔开，左右留白与画布 p-5 对齐。
 * 必须渲染 data-grid="inspector"（后续 Playwright 测量脚本依赖）。
 */
export function InspectorGroup({ title, children }: InspectorGroupProps): JSX.Element {
  return (
    <section
      data-grid="inspector"
      className="px-5 py-4 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-[var(--app-color-border-default)]"
    >
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-color-text-secondary)]">
        {title}
      </h4>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** 检查器单行：label 列宽 var(--insp-label)，控件占剩余；stack=true 时改单列。 */
export function InspectorRow({
  label,
  stack = false,
  hint,
  tone = "default",
  required = false,
  children,
}: InspectorRowProps): JSX.Element {
  const controlId = useId();
  const labelClass = cn(
    "text-xs font-medium",
    tone === "error"
      ? "text-[var(--app-color-feedback-danger)]"
      : tone === "warn"
        ? "text-[var(--app-color-feedback-warning)]"
        : "text-[var(--app-color-text-secondary)]"
  );

  return (
    <div
      className={cn(stack ? "flex flex-col gap-1" : "grid min-h-8 items-center gap-x-2 gap-y-1")}
      style={stack ? undefined : { gridTemplateColumns: "var(--insp-label) minmax(0,1fr)" }}
    >
      <label htmlFor={controlId} className={labelClass}>
        {label}
        {required ? (
          <span className="ml-0.5 text-[var(--app-color-feedback-danger)]" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      <div className="min-w-0">{typeof children === "function" ? children(controlId) : children}</div>
      {hint != null ? (
        <div
          className={cn(
            "text-xs",
            tone === "error"
              ? "text-[var(--app-color-feedback-danger)]"
              : tone === "warn"
                ? "text-[var(--app-color-feedback-warning)]"
                : "text-[var(--app-color-text-secondary)]",
            stack ? "" : "col-span-2"
          )}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
