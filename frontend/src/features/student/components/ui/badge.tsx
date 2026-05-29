import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "error" | "access" | "telemetry" | "alert" | "profile";

const variantStyles: Record<BadgeVariant, string> = {
  default:   "bg-[var(--student-primary-soft)] text-[var(--student-primary)]",
  success:   "bg-[var(--student-success-soft)] text-[var(--student-success)]",
  warning:   "bg-[var(--student-warning-soft)] text-[var(--student-warning)]",
  error:     "bg-[var(--student-error-soft)] text-[var(--student-error)]",
  access:    "bg-[var(--student-accent-access-soft)] text-[var(--student-accent-access)]",
  telemetry: "bg-[var(--student-accent-telemetry-soft)] text-[var(--student-accent-telemetry)]",
  alert:     "bg-[var(--student-accent-alert-soft)] text-[var(--student-accent-alert)]",
  profile:   "bg-[var(--student-accent-profile-soft)] text-[var(--student-accent-profile)]",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center h-5 px-2 rounded-[var(--student-radius-full)] text-xs font-medium", variantStyles[variant], className)} {...props}>
      {children}
    </span>
  );
}
