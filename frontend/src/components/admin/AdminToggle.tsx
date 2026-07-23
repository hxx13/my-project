import { useId } from "react";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
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
  id?: string;
};

/**
 * Admin toggle with label — wraps AdminSwitch (iOS-style).
 */
export function AdminToggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
  id,
}: AdminToggleProps) {
  const autoId = useId();
  const switchId = id ?? autoId;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3",
        disabled && "opacity-50",
        className,
      )}
    >
      <AdminSwitchScaled
        id={switchId}
        size="sm"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <label
        htmlFor={switchId}
        className={cn(
          "flex flex-col",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span className="select-none text-sm font-medium text-[var(--app-color-text-primary)]">
          {label}
        </span>
        {description ? (
          <span className="text-xs text-[var(--app-color-text-tertiary)]">{description}</span>
        ) : null}
      </label>
    </div>
  );
}
