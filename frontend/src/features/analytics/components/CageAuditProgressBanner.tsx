import { Loader2 } from "lucide-react";
import type { CageAuditProgress } from "@/api/domains/analytics.api";
import { cn } from "@/lib/utils";

type Props = {
  progress: CageAuditProgress | undefined;
  visible: boolean;
  className?: string;
};

export function CageAuditProgressBanner({ progress, visible, className }: Props) {
  if (!visible) return null;

  const status = progress?.status ?? "running";
  const percent = Math.min(100, Math.max(0, progress?.percent ?? 0));
  const isFailed = status === "failed";
  const isDone = status === "done";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border px-4 py-3 shadow-sm",
        isFailed
          ? "border-rose-200 bg-rose-50/90"
          : isDone
            ? "border-emerald-200 bg-emerald-50/80"
            : "border-violet-200 bg-violet-50/90",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {!isDone && !isFailed ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-violet-600" aria-hidden />
        ) : null}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-semibold",
              isFailed ? "text-rose-800" : isDone ? "text-emerald-800" : "text-violet-900"
            )}
          >
            {isFailed
              ? "笼架数据拉取失败"
              : isDone
                ? "笼架快照已生成"
                : "正在拉取笼架占用数据…"}
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            {progress?.message ??
              "订阅后需分批请求 ARO 笼架详情，请稍候，完成后将自动展示各周期快照。"}
          </p>
          {!isDone && !isFailed ? (
            <div className="mt-2.5">
              <div className="h-2 overflow-hidden rounded-full bg-violet-100">
                <div
                  className="h-full rounded-full bg-violet-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(percent, status === "running" ? 4 : 0)}%` }}
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px] text-violet-700/80">
                <span>
                  {progress?.cycleTotal
                    ? `清算周期 ${progress.cycleIndex ?? 0}/${progress.cycleTotal}`
                    : "准备中"}
                </span>
                <span className="tabular-nums">
                  {progress?.totalShelves
                    ? `笼架 ${progress.processedShelves ?? 0}/${progress.totalShelves}`
                    : null}
                  {progress?.totalShelves ? " · " : null}
                  {percent}%
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
