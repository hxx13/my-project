import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
  error?: string;
}

const StudentSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, error, disabled, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative">
          <select
            ref={ref}
            disabled={disabled}
            className={cn(
              "w-full rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-white px-3 py-2 text-sm text-[var(--student-ink)] placeholder:text-[var(--student-mute)] transition-colors outline-none appearance-none pr-8",
              "focus-visible:border-[var(--student-primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--student-primary-soft)]",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--student-canvas-soft)]",
              error &&
                "border-[var(--student-destructive)] focus-visible:border-[var(--student-destructive)] focus-visible:ring-[var(--student-destructive)]/20",
              className
            )}
            aria-invalid={!!error}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-4 text-[var(--student-mute)]" />
        </div>
        {error && (
          <p className="mt-1 text-xs text-[var(--student-destructive)]">{error}</p>
        )}
      </div>
    );
  }
);
StudentSelect.displayName = "StudentSelect";

export { StudentSelect };
