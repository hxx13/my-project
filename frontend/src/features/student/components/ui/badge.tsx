import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "error" | "access" | "telemetry" | "alert" | "profile";

const variantStyles: Record<BadgeVariant, string> = {
  default:   "bg-[var(--student-primary-soft)] text-[var(--student-primary)] border border-[var(--student-primary)]/20",
  success:   "bg-[var(--student-success-soft)] text-[var(--student-success)] border border-[var(--student-success)]/20",
  warning:   "bg-[var(--student-warning-soft)] text-[var(--student-warning)] border border-[var(--student-warning)]/20",
  error:     "bg-[var(--student-error-soft)] text-[var(--student-error)] border border-[var(--student-error)]/20",
  access:    "bg-[var(--student-accent-access-soft)] text-[var(--student-accent-access)] border border-[var(--student-accent-access)]/20",
  telemetry: "bg-[var(--student-accent-telemetry-soft)] text-[var(--student-accent-telemetry)] border border-[var(--student-accent-telemetry)]/20",
  alert:     "bg-[var(--student-accent-alert-soft)] text-[var(--student-accent-alert)] border border-[var(--student-accent-alert)]/20",
  profile:   "bg-[var(--student-accent-profile-soft)] text-[var(--student-accent-profile)] border border-[var(--student-accent-profile)]/20",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center h-5 px-2 rounded-[var(--student-radius-full)] text-xs font-medium whitespace-nowrap", variantStyles[variant], className)} {...props}>
      {children}
    </span>
  );
}
