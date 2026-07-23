import type { LucideIcon } from "lucide-react";
import { StudentButton } from "./button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="flex items-center justify-center size-16 rounded-full bg-[var(--student-mute)]/60 text-[var(--student-mute-foreground)] mb-4">
        <Icon className="size-8" strokeWidth={1.5} />
      </div>

      <h3 className="text-sm font-semibold text-[var(--student-foreground)] mb-1">
        {title}
      </h3>

      {description && (
        <p className="text-xs text-[var(--student-mute-foreground)] max-w-xs mb-4">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <StudentButton variant="ghost" size="sm" onClick={onAction}>
          {actionLabel}
        </StudentButton>
      )}
    </div>
  );
}
