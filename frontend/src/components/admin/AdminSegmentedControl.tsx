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
  /** md = 表单区常规高度；sm = 抽屉/工具栏头部那一行里的小号 */
  size?: "md" | "sm";
  className?: string;
  "aria-label"?: string;
};

/**
 * 分段切换（如「单人 / 批量」），选中项实色填充，未选中项浅底填充（无描边线条按钮）。
 *
 * 立体感 = 底座压一道内阴影（凹槽）+ 选中项浮起一道外阴影，点未选中项时有 1px 下沉反馈。
 */
export function AdminSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  size = "md",
  className,
  "aria-label": ariaLabel = "切换选项",
}: Props<T>) {
  const sm = size === "sm";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full flex-wrap items-center rounded-lg bg-[var(--app-color-surface-hover)] shadow-[inset_0_1px_2px_rgba(15,23,42,0.10)]",
        sm ? "gap-0.5 p-0.5" : "gap-1 p-1",
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
              "border-0 font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_srgb,var(--admin-focus-ring)_40%,transparent)]",
              sm
                ? "rounded-[5px] px-2 py-0.5 text-[11px] font-semibold"
                : "min-h-[var(--admin-control-height,2.25rem)] rounded-md px-4 py-2 text-sm",
              pressed
                ? "bg-[var(--app-color-accent)] text-white shadow-[0_1px_2px_rgba(15,23,42,0.28),0_1px_1px_rgba(15,23,42,0.16)]"
                : "bg-transparent text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container)] hover:text-[var(--app-color-text-primary)] active:translate-y-px"
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
