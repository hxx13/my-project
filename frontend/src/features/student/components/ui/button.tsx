import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const studentButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-[3px] focus-visible:ring-[var(--student-primary-soft)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--student-primary)] text-[var(--student-primary-foreground)] hover:opacity-90 border border-transparent",
        secondary:
          "bg-white text-[var(--student-primary)] border border-[var(--student-border)] hover:bg-[var(--student-mute)]/10",
        ghost:
          "text-[var(--student-primary)] hover:bg-[var(--student-mute)]/10 border border-transparent",
        destructive:
          "bg-[var(--student-destructive)] text-[var(--student-destructive-foreground)] border border-transparent hover:opacity-90",
      },
      size: {
        sm: "h-8 gap-1 px-3 text-xs",
        md: "h-10 gap-1.5 px-4 text-sm",
        lg: "h-12 gap-2 px-5 text-base",
        pill: "h-10 gap-1.5 px-5 text-sm rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface StudentButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof studentButtonVariants> {}

const StudentButton = React.forwardRef<HTMLButtonElement, StudentButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(studentButtonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
StudentButton.displayName = "StudentButton"

export { StudentButton, studentButtonVariants }
