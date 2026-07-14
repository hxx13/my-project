import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-hover)]",
        className,
      )}
    />
  );
}

export default function MonitorAnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-[var(--app-space-element-gap)]">
      {/* Heading placeholder */}
      <SkeletonBlock className="h-6 w-32" />

      {/* Stat cards row: 4 cards in a grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--app-space-element-gap)]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm"
          >
            <SkeletonBlock className="h-3 w-16 mb-3" />
            <SkeletonBlock className="h-8 w-20 mb-2" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Response time + status distribution row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--app-space-element-gap)]">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm"
          >
            <SkeletonBlock className="h-4 w-24 mb-4" />
            <SkeletonBlock className="h-24 w-full" />
          </div>
        ))}
      </div>

      {/* Ranking lists row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--app-space-element-gap)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm"
          >
            <SkeletonBlock className="h-4 w-20 mb-4" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex justify-between items-center py-2">
                <SkeletonBlock className="h-3 w-32" />
                <SkeletonBlock className="h-3 w-12" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
