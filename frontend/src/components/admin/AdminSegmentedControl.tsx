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
 * 分段切换（如「单人 / 批量」），选中项实色填充，未选中项浅底填充（无描边线条按钮）。
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
        "inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-[var(--app-color-surface-hover)] p-1",
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
              "min-h-[var(--admin-control-height,2.25rem)] rounded-md border-0 px-4 py-2 text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--admin-focus-ring)]/40",
              pressed
                ? "bg-[var(--app-color-accent)] text-white shadow-sm"
                : "bg-transparent text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container)] hover:text-[var(--app-color-text-primary)]"
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
