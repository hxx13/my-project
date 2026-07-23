import { cn } from "@/lib/utils";

function PulseBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn(
        "animate-skeleton-pulse rounded-twin-xs bg-[var(--twin-canvas-soft-2)]",
        className
      )}
      style={style}
    />
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="w-full space-y-0" role="status" aria-label="加载中">
      <div className="flex items-center gap-4 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-4 py-3">
        {[1, 2, 3, 4].map((i) => (
          <PulseBlock key={i} className="h-3.5 rounded" style={{ width: `${40 + i * 15}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-[var(--twin-hairline)] px-4 py-3"
        >
          {[1, 2, 3, 4].map((c) => (
            <PulseBlock
              key={c}
              className="h-3.5 rounded"
              style={{ width: `${20 + c * 12}%` }}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">正在加载表格数据…</span>
    </div>
  );
}

function CardSkeleton({ rows = 4, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      role="status"
      aria-label="加载中"
    >
      {Array.from({ length: rows * cols }).map((_, i) => (
        <div
          key={i}
          className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-2"
        >
          <PulseBlock className="mb-3 h-4 w-3/4" />
          <PulseBlock className="mb-2 h-3 w-full" />
          <PulseBlock className="mb-2 h-3 w-5/6" />
          <PulseBlock className="h-3 w-2/3" />
        </div>
      ))}
      <span className="sr-only">正在加载卡片数据…</span>
    </div>
  );
}

function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="加载中">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <PulseBlock className="h-3.5 w-20" />
          <PulseBlock className="h-9 w-full rounded-twin-sm" />
        </div>
      ))}
      <PulseBlock className="h-9 w-24 rounded-twin-md" />
      <span className="sr-only">正在加载表单…</span>
    </div>
  );
}

type DataSkeletonProps = {
  variant?: "table" | "card" | "form";
  rows?: number;
  cols?: number;
  fields?: number;
  className?: string;
};

export default function DataSkeleton({
  variant = "table",
  rows = 5,
  cols = 3,
  fields = 5,
  className,
}: DataSkeletonProps) {
  return (
    <div className={cn("animate-fade-in", className)}>
      {variant === "table" && <TableSkeleton rows={rows} />}
      {variant === "card" && <CardSkeleton rows={rows} cols={cols} />}
      {variant === "form" && <FormSkeleton fields={fields} />}
    </div>
  );
}
