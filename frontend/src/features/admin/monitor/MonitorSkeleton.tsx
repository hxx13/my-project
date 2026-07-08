/**
 * MonitorSkeleton — 监控面板全页加载骨架屏
 *
 * 使用与真实组件相同的 Bento grid 布局，DataSkeleton 风格的占位卡片。
 * 遵循 Impeccable 产品规则：骨架屏而非居中 spinner。
 */

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

function HealthCardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-3 w-3 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-3 w-32" />
        </div>
      </div>
    </div>
  );
}

function ResourceGaugeSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-4 w-12" />
        </div>
        <SkeletonBlock className="h-3 w-full rounded-[var(--app-radius-pill)]" />
        <SkeletonBlock className="h-3 w-32" />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm">
      <div className="space-y-0 divide-y divide-[var(--app-color-border-default)]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <SkeletonBlock className="h-2.5 w-2.5 rounded-full shrink-0" />
            <SkeletonBlock className="h-4 flex-1" />
            <SkeletonBlock className="h-4 w-14 shrink-0" />
            <SkeletonBlock className="h-4 w-12 shrink-0" />
            <SkeletonBlock className="h-4 w-16 shrink-0" />
            <SkeletonBlock className="h-8 w-10 shrink-0 rounded-[var(--app-radius-element)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonitorSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--app-space-section-gap)]">
      {/* 状态栏骨架 */}
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-3 w-3 rounded-full" />
        <SkeletonBlock className="h-4 w-48" />
      </div>

      {/* 健康卡片骨架 */}
      <div>
        <SkeletonBlock className="mb-3 h-5 w-20" />
        <div className="grid gap-[var(--app-space-element-gap)]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <HealthCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* 资源指标骨架 */}
      <div>
        <SkeletonBlock className="mb-3 h-5 w-20" />
        <div className="grid gap-[var(--app-space-element-gap)]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <ResourceGaugeSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* 任务表格骨架 */}
      <div>
        <SkeletonBlock className="mb-3 h-5 w-24" />
        <TableSkeleton />
      </div>
    </div>
  );
}
