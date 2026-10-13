import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const studentCardVariants = cva(
  "rounded-[var(--student-radius-md)] transition-all",
  {
    variants: {
      variant: {
        /* 底色走令牌，别写 bg-white：--student-canvas 亮色就是 #fff（外观不变），暗色才有对应深底。
           硬写白底会让卡片在暗色下变成「白卡片 + 近白字」。 */
        default:
          "bg-[var(--student-canvas)] shadow-student-card hover:shadow-student-card-hover",
        soft: "bg-[var(--student-card-soft-bg)]",
        bordered:
          "bg-[var(--student-canvas)] border border-[var(--student-border)]",
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
