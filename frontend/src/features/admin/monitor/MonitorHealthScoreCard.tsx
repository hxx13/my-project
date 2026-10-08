/**
 * MonitorHealthScoreCard — 健康度评分
 *
 * 把分散的指标压成一个 0-100 的数，并**列出扣分原因**（只给分数不给原因等于没说）。
 * 每个因子的 level 由后端算好下发，前端只上色 —— 阈值只有后端一处。
 *
 * 放在「系统健康」上方：先看总分，再看哪个服务挂了。
 */

import type { MetricLevel } from "@/api/domains/monitor.api";
import { useMonitorStore } from "@/store/useMonitorStore";
import { cn } from "@/lib/utils";

const dotBase = "h-2.5 w-2.5 rounded-full shrink-0";

function levelDot(level: MetricLevel): string {
  if (level === "crit") return cn(dotBase, "bg-[var(--app-color-feedback-danger)]");
  if (level === "warn") return cn(dotBase, "bg-[var(--app-color-feedback-warning)]");
  return cn(dotBase, "bg-[var(--app-color-feedback-success)]");
}

function levelBadge(level: MetricLevel): string {
  if (level === "crit") {
    return "bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)]";
  }
  if (level === "warn") {
    return "bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)]";
  }
  return "bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]";
}

function levelLabel(level: MetricLevel): string {
  if (level === "crit") return "异常";
  return level === "warn" ? "注意" : "良好";
}

export function MonitorHealthScoreCard() {
  const score = useMonitorStore((s) => s.score);
  const loading = useMonitorStore((s) => s.scoreLoading);
  const error = useMonitorStore((s) => s.scoreError);

  if (loading && !score) return null;
  // 后端尚未升级（/score 404）时整块不渲染，页面其余部分照常工作
  if (!score) return null;
  if (error && !score) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">健康度</h3>
      <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="font-mono text-3xl font-bold tabular-nums text-[var(--app-color-text-primary)]">
            {score.score}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", levelBadge(score.level))}>
            {levelLabel(score.level)}
          </span>
          <span className="ml-auto text-xs text-[var(--app-color-text-tertiary)]">
            满分 100 · 计数为内存态，服务重启即清零
          </span>
        </div>

        <div className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
          {score.factors.map((f) => (
            <div key={f.key} className="flex items-center gap-2 text-xs">
              <span className={levelDot(f.level)} aria-hidden />
              <span className="w-24 shrink-0 text-[var(--app-color-text-secondary)]">{f.label}</span>
              <span className="min-w-0 flex-1 truncate text-[var(--app-color-text-primary)]" title={f.value}>
                {f.value}
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono tabular-nums",
                  f.deduction > 0
                    ? "text-[var(--app-color-feedback-danger)]"
                    : "text-[var(--app-color-text-tertiary)]",
                )}
              >
                {f.deduction > 0 ? `-${f.deduction}` : "0"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
