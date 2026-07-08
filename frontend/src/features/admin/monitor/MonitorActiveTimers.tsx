/**
 * MonitorActiveTimers — 活跃计时器
 *
 * 三区布局:
 *   1. 待到期的激活倒计时（双栏：待激活 + 待签退）
 *   2. Tick 状态卡片
 *   3. 最近计时器事件历史
 *
 * 10s 自动刷新，倒计时每秒更新。全部中文标签。
 */

import { useState, useEffect } from "react";
import { useMonitorStore } from "@/store/useMonitorStore";
import type { PendingTimer, TimerHistoryEntry } from "@/api/domains/monitor.api";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// 倒计时 Hook — 每秒刷新
// ═══════════════════════════════════════════

function useCountdown(targetIso: string | null): { label: string; urgent: boolean } {
  const [state, setState] = useState({ label: "—", urgent: false });
  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) { setState({ label: "已到期", urgent: true }); return; }
      const s = Math.floor(diff / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const urgent = s < 60;
      if (h > 0) setState({ label: `${h}时${m % 60}分${s % 60}秒`, urgent });
      else if (m > 0) setState({ label: `${m}分${s % 60}秒`, urgent });
      else setState({ label: `${s}秒`, urgent });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return state;
}

// ═══════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════

function timeAgo(iso: string | null): string {
  if (!iso) return "无记录";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  return `${Math.floor(s / 3600)} 小时前`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function userDisplay(userId: string, userName?: string): string {
  if (userName) return `${userId}（${userName}）`;
  return userId;
}

// ═══════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════

export function MonitorActiveTimers() {
  const timers = useMonitorStore((s) => s.timers);
  const timersLoading = useMonitorStore((s) => s.timersLoading);
  const timerHistory = useMonitorStore((s) => s.timerHistory);
  const timerHistoryLoading = useMonitorStore((s) => s.timerHistoryLoading);

  if (timersLoading && !timers) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">
        加载中…
      </div>
    );
  }
  if (!timers) return null;

  const { pendingTimers, lastPullTick, lastDueTick, swingPullIntervalMs, dueProcessIntervalMs } = timers;
  const pullIntervalSec = Math.round(swingPullIntervalMs / 1000);
  const dueIntervalSec = Math.round(dueProcessIntervalMs / 1000);

  const activationTimers = pendingTimers.filter((t) =>
    t.state.includes("PENDING_ACTIVATION"),
  );
  const exitTimers = pendingTimers.filter((t) =>
    t.state.includes("AUTO_EXIT"),
  );

  return (
    <div className="flex flex-col gap-[var(--app-space-section-gap)]">

      {/* ═══ 区域一：待到期的激活倒计时（双栏） ═══ */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">
          待到期的激活倒计时
        </h3>
        {pendingTimers.length === 0 ? (
          <div className="flex min-h-[80px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]">
            暂无待到期的激活计时器
          </div>
        ) : (
          <div className="grid gap-[var(--app-space-element-gap)] lg:grid-cols-2">
            <CountdownSubTable
              title="待激活倒计时"
              items={activationTimers}
              emptyText="暂无待激活的计时器"
            />
            <CountdownSubTable
              title="待签退倒计时"
              items={exitTimers}
              emptyText="暂无待签退的计时器"
            />
          </div>
        )}
      </section>

      {/* ═══ 区域二：Tick 状态 ═══ */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">
          系统 Tick 状态
        </h3>
        <div
          className="grid gap-[var(--app-space-element-gap)]"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        >
          <TickStatusCard
            label="门禁即时拉取"
            interval={`间隔 ${pullIntervalSec}s`}
            lastRunAt={lastPullTick}
          />
          <TickStatusCard
            label="到期处理引擎"
            interval={`间隔 ${dueIntervalSec}s`}
            lastRunAt={lastDueTick}
          />
        </div>
      </section>

      {/* ═══ 区域三：最近计时器事件历史 ═══ */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">
          最近计时器事件历史
        </h3>
        <TimerHistoryTable items={timerHistory} loading={timerHistoryLoading} />
      </section>

    </div>
  );
}

// ═══════════════════════════════════════════
// CountdownSubTable — 单栏倒计时子表
// ═══════════════════════════════════════════

function CountdownSubTable({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: PendingTimer[];
  emptyText: string;
}) {
  const count = items.length;

  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden flex flex-col max-h-[320px]">
      {/* sticky 表头 + 计数徽章 */}
      <div className="shrink-0 flex items-center gap-2 border-b-2 border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-hover)] px-4 py-2.5 shadow-[var(--app-elevation-card)]">
        <span className="text-sm font-bold text-[var(--app-color-text-primary)]">{title}</span>
        <span className={cn(
          "inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full px-1.5 text-xs font-bold tabular-nums",
          count > 0 ? "bg-[var(--app-color-feedback-info-soft)] text-[var(--app-color-feedback-info)]" : "bg-[var(--app-color-surface-raised)] text-[var(--app-color-text-tertiary)]",
        )}>{count}</span>
      </div>

      {count === 0 ? (
        <div className="flex min-h-[80px] items-center justify-center text-xs text-[var(--app-color-text-tertiary)]">{emptyText}</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] font-medium">
                <th className="py-2 pl-4 text-left">用户</th>
                <th className="py-2 text-left w-16">通道</th>
                <th className="py-2 text-right w-24">倒计时</th>
                <th className="py-2 pr-4 text-right w-24">到期时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t, i) => (
                <CountdownRow key={`${t.userId}-${t.state}-${i}`} timer={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// CountdownRow — 单行实时倒计时
// ═══════════════════════════════════════════

function CountdownRow({ timer }: { timer: PendingTimer }) {
  const cd = useCountdown(timer.scheduledExitAt);
  const displayName = userDisplay(timer.userId, timer.userName);

  return (
    <tr className="border-b border-[var(--app-color-border-default)] last:border-b-0">
      <td className="py-2 pl-4 text-[var(--app-color-text-primary)] font-medium">
        {displayName}
      </td>
      <td className="py-2 text-[var(--app-color-text-secondary)] font-mono">
        {timer.channelCode}
      </td>
      <td
        className={cn(
          "py-2 text-right font-mono tabular-nums font-bold",
          cd.urgent
            ? "text-[var(--app-color-feedback-danger)]"
            : "text-[var(--app-color-text-primary)]",
        )}
      >
        {cd.label}
      </td>
      <td className="py-2 pr-4 text-right text-[var(--app-color-text-tertiary)]">
        {formatTime(timer.scheduledExitAt)}
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════
// TickStatusCard
// ═══════════════════════════════════════════

function TickStatusCard({
  label,
  interval,
  lastRunAt,
}: {
  label: string;
  interval: string;
  lastRunAt: string | null;
}) {
  const fresh =
    lastRunAt != null && Date.now() - new Date(lastRunAt).getTime() < 30_000;

  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            lastRunAt == null
              ? "bg-[var(--app-color-text-tertiary)]"
              : fresh
                ? "bg-[var(--app-color-feedback-success)] motion-safe:animate-pulse"
                : "bg-[var(--app-color-feedback-warning)]",
          )}
        />
        <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">
          {label}
        </span>
      </div>
      <p className="text-xs text-[var(--app-color-text-tertiary)]">
        {interval} · 上次 {timeAgo(lastRunAt)}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════
// TimerHistoryTable — 计时器事件历史
// ═══════════════════════════════════════════

function TimerHistoryTable({
  items,
  loading,
}: {
  items: TimerHistoryEntry[];
  loading: boolean;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]">
        加载中…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]">
        暂无计时器事件记录
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden flex flex-col max-h-[400px]">
      <div className="shrink-0 border-b-2 border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-hover)] px-4 py-2.5 shadow-[var(--app-elevation-card)]">
        <span className="text-sm font-bold text-[var(--app-color-text-primary)]">最近计时器事件</span>
        <span className="ml-2 inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full px-1.5 text-xs font-bold tabular-nums bg-[var(--app-color-feedback-info-soft)] text-[var(--app-color-feedback-info)]">{items.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-[2] border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-xs text-[var(--app-color-text-secondary)] font-bold">
              <th className="py-2 pl-4 text-left w-36">时间</th>
              <th className="py-2 text-left w-32">用户</th>
              <th className="py-2 text-left w-36">阶段</th>
              <th className="py-2 pr-4 text-left">详情</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry, i) => (
              <tr key={`hist-${i}`} className="border-b border-[var(--app-color-border-default)] last:border-b-0">
                <td className="py-2 pl-4 text-xs text-[var(--app-color-text-tertiary)] font-mono">{formatDateTime(entry.eventTime)}</td>
                <td className="py-2 text-xs text-[var(--app-color-text-primary)] font-medium">{userDisplay(entry.userId, entry.userName)}</td>
                <td className="py-2 text-xs font-medium text-[var(--app-color-text-secondary)]">{entry.stageLabel || "—"}</td>
                <td className="py-2 pr-4 text-xs text-[var(--app-color-text-tertiary)] truncate">{entry.detail || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
