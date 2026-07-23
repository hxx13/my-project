import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean | "indeterminate") => void;
  label?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onCheckedChange, label, disabled }: CheckboxProps) {
  const checkbox = (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--student-radius-xs)] border-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--student-primary-soft)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-[var(--student-primary)] bg-[var(--student-primary)]"
          : "border-[var(--student-hairline)] bg-white"
      )}
    >
      <CheckboxPrimitive.Indicator forceMount className="text-white">
        {checked === "indeterminate" ? (
          <Minus className="size-3.5" strokeWidth={3} />
        ) : (
          <Check className="size-3.5" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (label) {
    return (
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        {checkbox}
        <span className="text-sm text-[var(--student-body)]">{label}</span>
      </label>
    );
  }

  return checkbox;
}
