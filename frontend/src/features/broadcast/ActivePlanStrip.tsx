import { CalendarClock, Loader2, Pause, Play } from "lucide-react";
import { AdminButton } from "@/components/admin/AdminButton";
import type { ActivePlan } from "@/api/domains/broadcast.api";
import { dotClass, dotColor } from "./ui";

/**
 * 「现在到底在放什么」。
 *
 * 定时方案只是**批量启动器** —— 到点把若干分区带起来，之后每一路归自己。这一条把
 * 「哪个方案在执行、带了几路、其中几路在响、有没有被人工停掉的」摆在最显眼处，
 * 并提供方案级的暂停/恢复（单路的暂停在左侧分区行里）。
 */
export default function ActivePlanStrip({
  plans,
  loading,
  busyPlanId,
  onPausePlan,
  onResumePlan,
}: {
  plans: ActivePlan[];
  loading: boolean;
  busyPlanId: number | null;
  onPausePlan: (id: number) => void;
  onResumePlan: (id: number) => void;
}) {
  if (loading && plans.length === 0) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        读取执行状态…
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-xs text-[var(--app-color-text-tertiary)]">
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        当前没有正在执行的定时方案
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5">
      <span className="shrink-0 text-xs font-medium text-[var(--app-color-text-secondary)]">正在执行</span>
      {plans.map((p) => {
        const paused = p.runState === "PAUSED";
        const manual = p.zones.filter((z) => z.paused).length;
        return (
          <span key={p.id} className="flex items-center gap-2 text-xs">
            <span
              className={dotClass}
              style={{ background: dotColor(paused ? "warn" : p.playingCount > 0 ? "ok" : "bad") }}
            />
            <b className="text-[var(--app-color-text-primary)]">{p.planName}</b>
            <span className="text-[var(--app-color-text-tertiary)]">
              {p.startTime?.slice(0, 5)}–{p.endTime?.slice(0, 5)}
              {p.loopPlay ? " · 循环" : ""}
              {p.runStartedAt ? ` · 本轮 ${String(p.runStartedAt).slice(11, 16)} 起` : ""}
            </span>
            <span className="text-[var(--app-color-text-secondary)]">
              {p.playingCount}/{p.zoneCount} 路在响
            </span>
            {manual > 0 ? (
              <span className="text-[var(--app-color-feedback-warning)]">{manual} 路已人工停</span>
            ) : null}
            {paused ? (
              <AdminButton
                tone="primary"
                className="h-6 px-2 text-xs"
                loading={busyPlanId === p.id}
                onClick={() => onResumePlan(p.id)}
              >
                <Play className="mr-1 h-3 w-3" />
                恢复方案
              </AdminButton>
            ) : (
              <AdminButton
                tone="secondary"
                className="h-6 px-2 text-xs"
                loading={busyPlanId === p.id}
                onClick={() => onPausePlan(p.id)}
              >
                <Pause className="mr-1 h-3 w-3" />
                暂停方案
              </AdminButton>
            )}
          </span>
        );
      })}
    </div>
  );
}
