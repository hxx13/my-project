import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, disabled }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[var(--student-radius-pill)] border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--student-primary-soft)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--student-primary)]" : "bg-[var(--student-hairline)]"
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block h-4 w-4 rounded-[var(--student-radius-full)] bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  );
}
