/**
 * MonitorRecentLogFeed — 最近调度日志
 *
 * 展示最近 10-20 条 SCHEDULER 日志。
 * 新日志从上方滑入 (translateY + opacity, 200ms stagger)。
 * 尊重 prefers-reduced-motion → 降级为即时显示。
 */

import { useMonitorStore } from "@/store/useMonitorStore";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false });
}

export function MonitorRecentLogFeed() {
  const logs = useMonitorStore((s) => s.recentLogs);

  if (logs.length === 0) {
    return (
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">
          最近调度日志
        </h3>
        <div className="flex min-h-[100px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]">
          暂无调度日志
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">
        最近调度日志
        <span className="ml-2 font-normal text-[var(--app-color-text-tertiary)]">
          {logs.length} 条
        </span>
      </h3>
      <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
        <div className="divide-y divide-[var(--app-color-border-default)]">
          {logs.slice(0, 20).map((log, i) => (
            <div
              key={`${log.jobKey}-${log.ts}-${i}`}
              className={cn(
                "flex items-center gap-3 px-5 py-2.5 text-sm",
                "motion-safe:animate-[slideIn_200ms_ease-out_both]",
              )}
              style={
                // stagger: 50ms per item, 在支持动画时生效
                { animationDelay: `${i * 50}ms` }
              }
            >
              {/* 时间戳 */}
              <span className="text-xs text-[var(--app-color-text-tertiary)] font-mono tabular-nums shrink-0 w-20">
                {formatTime(log.ts)}
              </span>

              {/* 成功/失败图标 */}
              <span
                className={cn(
                  "text-xs font-medium shrink-0 w-8",
                  log.success
                    ? "text-[var(--app-color-feedback-success)]"
                    : "text-[var(--app-color-feedback-danger)]",
                )}
              >
                {log.success ? "完成" : "失败"}
              </span>

              {/* 任务名 + 详情 */}
              <span className="text-[var(--app-color-text-secondary)] truncate">
                <span className="text-[var(--app-color-text-primary)] font-medium">
                  {log.jobName || log.jobKey}
                </span>
                {log.detail ? <span> — {log.detail}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
