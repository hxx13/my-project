import type { JSX, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * 检查器内的裸控件样式类：静止态即带可见边框 + 填充背景。
 * 背景用 surface-container（同 AdminSelect 规范）：在所有主题都有真实颜色，
 * 不像 surface-page 在 night-sky 暗色主题下是 transparent，导致控件背景丢失。
 * hover 加深边框 → focus 显 accent 边框 + 3px 光环。
 */
export const bareControlClass =
  "min-h-7 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-sm text-[var(--app-color-text-primary)] outline-none transition-colors placeholder:text-[var(--app-color-text-tertiary)] hover:border-[var(--app-color-border-strong)] focus-visible:border-[var(--app-color-accent)] focus-visible:ring-[3px] focus-visible:ring-[color:var(--app-color-accent-soft)]";

/** 提交校验失败时的高亮：红边 + 浅红底，覆盖默认边框/背景。 */
export const bareControlErrorClass =
  "border-[var(--app-color-feedback-danger)] bg-[var(--app-color-feedback-danger-soft)] hover:border-[var(--app-color-feedback-danger)] focus-visible:border-[var(--app-color-feedback-danger)] focus-visible:ring-[color:var(--app-color-feedback-danger-soft)]";

/**
 * 实心填充触发器（对齐 AdminButton secondary）：禁止「仅描边线条」观感。
 * 静止/聚焦都是填充面；open 时略加深，避免 focus 只剩细线框。
 */
export const filledTriggerClass =
  "min-h-8 rounded-md border-0 bg-[var(--app-color-surface-hover)] px-2.5 py-1.5 text-sm font-medium text-[var(--app-color-text-primary)] shadow-sm outline-none transition-colors hover:bg-[var(--app-color-border-default)] focus-visible:bg-[var(--app-color-border-default)] focus-visible:ring-2 focus-visible:ring-[var(--app-color-accent)]/35 focus-visible:ring-offset-1";

export const filledTriggerOpenClass =
  "bg-[var(--app-color-border-default)] ring-2 ring-[var(--app-color-accent)]/35 ring-offset-1";

export const filledTriggerErrorClass =
  "bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)] ring-2 ring-[var(--app-color-feedback-danger)]/40 ring-offset-1";

export function BareInput({
  invalid,
  className,
  ...p
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }): JSX.Element {
  return (
    <input
      {...p}
      aria-invalid={invalid || undefined}
      className={cn(bareControlClass, invalid && bareControlErrorClass, "w-full", className)}
    />
  );
}

type BareNumberWithUnitProps = {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
};

/** 数字框 + 右侧单位后缀，如「7 天」「3 次」。 */
export function BareNumberWithUnit({
  value,
  onChange,
  unit,
  placeholder,
  disabled,
  id,
  invalid,
}: BareNumberWithUnitProps): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(bareControlClass, invalid && bareControlErrorClass, "min-w-0 flex-1")}
      />
      <span className="shrink-0 text-sm text-[var(--app-color-text-secondary)]">{unit}</span>
    </div>
  );
}
