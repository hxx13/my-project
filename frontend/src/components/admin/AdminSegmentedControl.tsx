import { cn } from "@/lib/utils";

export type AdminSegmentOption<T extends string = string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: AdminSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * 分段切换（如「单人 / 批量」），选中项白底+描边，aria-pressed 可访问。
 */
export function AdminSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel = "切换选项",
}: Props<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      {options.map((opt) => {
        const pressed = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            className={cn(
              "min-h-[var(--admin-control-height,2.25rem)] rounded-md border-2 px-4 py-2 text-sm font-medium shadow-sm transition-all",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--admin-focus-ring)]/40 active:translate-y-px",
              pressed
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:border-[var(--app-color-border-strong)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
            )}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
