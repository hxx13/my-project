import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ================================================================== */
/*  AdminFormField — 统一表单字段包装器                                  */
/*  label: 字段标签                                                      */
/*  hint:  可选提示文案（显示在标签下方）                                  */
/*  fullWidth: 在 AdminFormGrid 中跨两列                                */
/* ================================================================== */

export type AdminFormFieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
};

export function AdminFormField({ label, hint, children, className, fullWidth }: AdminFormFieldProps) {
  return (
    <div className={cn("admin-form-field", fullWidth && "col-span-2", className)}>
      <span className="admin-form-field-label">{label}</span>
      {hint ? <p className="admin-form-field-hint">{hint}</p> : null}
      {children}
    </div>
  );
}

/* ================================================================== */
/*  AdminFormGrid — 3 列紧凑表单网格                                     */
/*  子元素默认各占一列；带 fullWidth 的 AdminFormField 会跨三列            */
/* ================================================================== */

export type AdminFormGridProps = {
  children: ReactNode;
  className?: string;
};

export function AdminFormGrid({ children, className }: AdminFormGridProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-3", className)}>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  AdminFormInput — 统一文本输入框                                      */
/* ================================================================== */

export type AdminFormInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> & {
  className?: string;
};

export function AdminFormInput({ className, type, ...props }: AdminFormInputProps) {
  return (
    <input
      type={type}
      className={cn(
        "w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:ring-2 focus:ring-[color:var(--admin-focus-ring)]/40",
        className
      )}
      {...props}
    />
  );
}

/* ================================================================== */
/*  AdminFormSelect — 统一下拉框（基于原生 select）                       */
/* ================================================================== */

export type AdminFormSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  className?: string;
};

export function AdminFormSelect({ className, children, ...props }: AdminFormSelectProps) {
  return (
    <select
      className={cn(
        "w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)] focus:ring-2 focus:ring-[color:var(--admin-focus-ring)]/40",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/* ================================================================== */
/*  AdminTagCheckboxGroup — 标签式多选组                                 */
/*  替换手搓的 status type checkbox 组                                   */
/* ================================================================== */

export type TagOption = { value: string; label: string };

export type AdminTagCheckboxGroupProps = {
  options: readonly TagOption[];
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
};

export function AdminTagCheckboxGroup({ options, value, onChange, className }: AdminTagCheckboxGroupProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => {
        const checked = value.includes(opt.value);
        return (
          <label
            key={opt.value}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors select-none",
              checked
                ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]"
                : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] text-[var(--app-color-text-secondary)] hover:border-[var(--app-color-border-strong)]"
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                onChange(checked ? value.filter((c) => c !== opt.value) : [...value, opt.value]);
              }}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  AdminRadioGroup — 单选组（替换手搓 radio）                           */
/* ================================================================== */

export type AdminRadioGroupProps<T extends string = string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  name: string;
  className?: string;
};

export function AdminRadioGroup<T extends string = string>({
  options, value, onChange, name, className,
}: AdminRadioGroupProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--app-color-text-primary)] select-none"
        >
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-[var(--app-color-accent)]"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  AdminFormToggleRow — 开关行（开关 + 标签文字）                        */
/* ================================================================== */

export type AdminFormToggleRowProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * 统一开关行：children 放 AdminSwitchScaled，label 放文案。
 * 用法：<AdminFormToggleRow label="启用此规则"><AdminSwitchScaled ... /></AdminFormToggleRow>
 */
export function AdminFormToggleRow({ label, children, className }: AdminFormToggleRowProps) {
  return (
    <div className={cn("admin-form-toggle-row", className)}>
      <label>
        {children}
        <span>{label}</span>
      </label>
    </div>
  );
}
