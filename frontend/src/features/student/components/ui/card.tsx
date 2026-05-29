import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const studentCardVariants = cva(
  "rounded-[var(--student-radius-md)] transition-all",
  {
    variants: {
      variant: {
        default:
          "bg-white shadow-[var(--student-card-shadow)] hover:shadow-md",
        soft: "bg-[var(--student-card-soft-bg)]",
        bordered:
          "bg-white border border-[var(--student-border)]",
      },
      padding: {
        md: "p-4",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  }
)

export interface StudentCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof studentCardVariants> {}

const StudentCard = React.forwardRef<HTMLDivElement, StudentCardProps>(
  ({ className, variant, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(studentCardVariants({ variant, padding, className }))}
        {...props}
      />
    )
  }
)
StudentCard.displayName = "StudentCard"

export { StudentCard, studentCardVariants }
