import { cn } from "@/lib/utils";

export type AdminToggleProps = {
  /** Whether the toggle is on */
  checked: boolean;
  /** Called when toggled */
  onChange: (checked: boolean) => void;
  /** Label text displayed next to the toggle */
  label: string;
  /** Additional description shown below the label */
  description?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Admin toggle/switch component following the Bento design system.
 * Uses --app-color-* semantic tokens for all colors.
 */
export function AdminToggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}: AdminToggleProps) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-3",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <div className="relative">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={cn(
            "h-5 w-9 rounded-full border-2 transition-colors duration-150",
            checked
              ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)]"
              : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)]",
          )}
        />
        <div
          className={cn(
            "absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-[var(--color-white)] shadow-sm transition-transform duration-150",
            checked && "translate-x-4",
          )}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-[var(--app-color-text-primary)] select-none">
          {label}
        </span>
        {description ? (
          <span className="text-xs text-[var(--app-color-text-tertiary)]">
            {description}
          </span>
        ) : null}
      </div>
    </label>
  );
}
