import { AlertCircle } from "lucide-react";
import { StudentButton } from "./button";

interface ErrorRetryProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorRetry({ message = "加载失败，请重试", onRetry }: ErrorRetryProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <AlertCircle className="size-10 text-[var(--student-destructive)] mb-3" strokeWidth={1.5} />

      <p className="text-sm text-[var(--student-mute-foreground)] max-w-xs mb-4">
        {message}
      </p>

      {onRetry && (
        <StudentButton variant="ghost" size="sm" onClick={onRetry}>
          重试
        </StudentButton>
      )}
    </div>
  );
}
