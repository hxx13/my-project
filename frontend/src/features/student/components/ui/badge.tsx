import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "error" | "access" | "telemetry" | "alert" | "profile";

const variantStyles: Record<BadgeVariant, string> = {
  default:   "bg-[var(--student-primary-soft)] text-[var(--student-primary)] border border-[color-mix(in_srgb,var(--student-primary)_20%,transparent)]",
  success:   "bg-[var(--student-success-soft)] text-[var(--student-success)] border border-[color-mix(in_srgb,var(--student-success)_20%,transparent)]",
  warning:   "bg-[var(--student-warning-soft)] text-[var(--student-warning)] border border-[color-mix(in_srgb,var(--student-warning)_20%,transparent)]",
  error:     "bg-[var(--student-error-soft)] text-[var(--student-error)] border border-[color-mix(in_srgb,var(--student-error)_20%,transparent)]",
  access:    "bg-[var(--student-accent-access-soft)] text-[var(--student-accent-access)] border border-[color-mix(in_srgb,var(--student-accent-access)_20%,transparent)]",
  telemetry: "bg-[var(--student-accent-telemetry-soft)] text-[var(--student-accent-telemetry)] border border-[color-mix(in_srgb,var(--student-accent-telemetry)_20%,transparent)]",
  alert:     "bg-[var(--student-accent-alert-soft)] text-[var(--student-accent-alert)] border border-[color-mix(in_srgb,var(--student-accent-alert)_20%,transparent)]",
  profile:   "bg-[var(--student-accent-profile-soft)] text-[var(--student-accent-profile)] border border-[color-mix(in_srgb,var(--student-accent-profile)_20%,transparent)]",
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
