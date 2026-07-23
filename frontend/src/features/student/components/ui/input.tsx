import * as React from "react"

import { cn } from "@/lib/utils"

export interface StudentInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const StudentInput = React.forwardRef<HTMLInputElement, StudentInputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={cn(
            "w-full rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-white px-3 py-2 text-sm text-foreground placeholder:text-[var(--student-mute)] transition-colors outline-none",
            "focus-visible:border-[var(--student-primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--student-primary-soft)]",
            error &&
              "border-[var(--student-destructive)] focus-visible:border-[var(--student-destructive)] focus-visible:ring-[var(--student-destructive)]/20",
            className
          )}
          aria-invalid={!!error}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-[var(--student-destructive)]">
            {error}
          </p>
        )}
      </div>
    )
  }
)
StudentInput.displayName = "StudentInput"

export { StudentInput }
