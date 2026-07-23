import { type LucideIcon, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
};

export default function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-twin-lg bg-[var(--twin-canvas-soft)] px-8 py-12 text-center shadow-twin-level-1 animate-fade-in",
        className
      )}
      role="status"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--twin-canvas-soft-2)] ring-1 ring-[var(--twin-hairline)]">
        <Icon className="h-7 w-7 text-[var(--twin-mute)]" aria-hidden />
      </div>
      <p className="text-sm font-medium text-[var(--twin-ink)]">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--twin-mute)]">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5">
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
