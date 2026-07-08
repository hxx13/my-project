/**
 * MonitorStatusBar — 连接状态栏
 *
 * 显示 Socket.IO 连接状态 + 最后更新时间。
 * 三态: 已连接 (绿) / 断开重连 (红) / 初始连接中 (灰)
 */

import { useMonitorStore } from "@/store/useMonitorStore";
import { cn } from "@/lib/utils";

function formatTime(iso: string | null): string {
  if (!iso) return "--:--:--";
  return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false });
}

const dotBase = "h-2.5 w-2.5 rounded-full shrink-0";

export function MonitorStatusBar() {
  const socketConnected = useMonitorStore((s) => s.socketConnected);
  const lastEventAt = useMonitorStore((s) => s.lastEventAt);
  const jobsLoading = useMonitorStore((s) => s.jobsLoading);

  const dotCls = jobsLoading
    ? "bg-[var(--app-color-text-tertiary)]"
    : socketConnected
      ? "bg-[var(--app-color-feedback-success)]"
      : "bg-[var(--app-color-feedback-danger)] motion-safe:animate-pulse";

  const label = jobsLoading
    ? "正在连接…"
    : socketConnected
      ? "已连接"
      : "连接已断开 · 正在重连…";

  return (
    <div
      className="flex shrink-0 items-center gap-2 text-sm"
      role="status"
      aria-live="polite"
      aria-label={`Socket.IO ${label}`}
    >
      <span className={cn(dotBase, dotCls)} />
      <span className="text-[var(--app-color-text-secondary)]">{label}</span>
      <span className="text-[var(--app-color-text-tertiary)]">
        · 最后更新 {formatTime(lastEventAt)}
      </span>
    </div>
  );
}
