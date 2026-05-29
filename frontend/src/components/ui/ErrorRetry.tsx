import { useState } from "react";
import { AlertTriangle, ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ErrorRetryProps = {
  message?: string;
  details?: string;
  onRetry?: () => void;
  className?: string;
};

export default function ErrorRetry({
  message = "加载失败，请稍后重试",
  details,
  onRetry,
  className,
}: ErrorRetryProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-twin-lg border border-[var(--twin-error-soft)] bg-[var(--twin-canvas)] px-8 py-12 text-center shadow-twin-level-1 animate-fade-in",
        className
      )}
      role="alert"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--twin-error-soft)]">
        <AlertTriangle className="h-7 w-7 text-[var(--twin-error)]" aria-hidden />
      </div>
      <p className="text-sm font-medium text-[var(--twin-ink)]">{message}</p>
      {onRetry ? (
        <div className="mt-5">
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            重试
          </Button>
        </div>
      ) : null}
      {details ? (
        <div className="mt-4 w-full max-w-md">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className="flex w-full items-center justify-center gap-1 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-body)] transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                detailsOpen && "rotate-180"
              )}
            />
            技术详情
          </button>
          {detailsOpen ? (
            <pre className="mt-2 max-h-40 overflow-auto rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft-2)] p-3 text-left text-xs text-[var(--twin-body)]">
              {details}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
