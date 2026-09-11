import { cn } from "@/lib/utils";

type SkeletonVariant = "text" | "circular" | "rectangular";

const variantClasses: Record<SkeletonVariant, string> = {
  text: "h-4 w-full rounded-[var(--student-radius-sm)]",
  circular: "rounded-full",
  rectangular: "rounded-[var(--student-radius-md)]",
};

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
}

export function Skeleton({ className, variant = "text", ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-[color-mix(in_srgb,var(--student-mute)_25%,transparent)]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
