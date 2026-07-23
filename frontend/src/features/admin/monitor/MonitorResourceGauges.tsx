/**
 * MonitorResourceGauges — 资源指标
 *
 * 8 个卡片 (4×2 网格):
 *   JVM 堆 | 系统内存 | 进程 CPU | 磁盘
 *   GC 统计 | 线程    | HikariCP | JVM 进程内存
 *
 * 进度条使用 CSS transition 实现实时变动效果。
 * 颜色阈值: < 60% 绿, 60-80% 琥珀, > 80% 红
 */

import type { ResourceSnapshot } from "@/api/domains/monitor.api";
import { useMonitorStore } from "@/store/useMonitorStore";
import { cn } from "@/lib/utils";

function barColor(percent: number): string {
  if (percent > 80) return "bg-[var(--app-color-feedback-danger)]";
  if (percent > 60) return "bg-[var(--app-color-feedback-warning)]";
  return "bg-[var(--app-color-feedback-success)]";
}

function Gauge({ label, used, max, unit, percent, detail }: {
  label: string; used: string; max: string; unit: string; percent: number; detail?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{label}</span>
        <span className={cn("text-sm font-medium font-mono tabular-nums", percent > 80 ? "text-[var(--app-color-feedback-danger)]" : "text-[var(--app-color-text-secondary)]")}>
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="h-2.5 w-full rounded-[var(--app-radius-pill)] bg-[var(--app-color-surface-hover)] overflow-hidden mb-2">
        <div className={cn("h-full rounded-[var(--app-radius-pill)]", barColor(percent))}
          style={{ width: `${Math.min(percent, 100)}%`, transition: "width 0.6s ease-out" }} />
      </div>
      <p className="text-xs text-[var(--app-color-text-tertiary)] font-mono tabular-nums">
        {used} / {max} {unit}
      </p>
      {detail ? <p className="mt-1 text-xs text-[var(--app-color-text-tertiary)]">{detail}</p> : null}
    </div>
  );
}

function InfoCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
      <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{label}</span>
      <p className="mt-1 text-lg font-mono tabular-nums font-bold text-[var(--app-color-text-primary)]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--app-color-text-tertiary)]">{detail}</p> : null}
    </div>
  );
}

export function MonitorResourceGauges() {
  const r = useMonitorStore((s) => s.resources);
  const loading = useMonitorStore((s) => s.resourcesLoading);
  if (loading && !r) return null;
  if (!r) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">资源占用</h3>
      <div className="grid gap-[var(--app-space-element-gap)] grid-cols-2 lg:grid-cols-4">
        <Gauge label="JVM 堆内存" used={r.heapUsedMB.toFixed(0)} max={r.heapMaxMB.toFixed(0)} unit="MB" percent={r.heapUsedPercent}
          detail={`Metaspace ${r.nonHeapUsedMB.toFixed(0)} MB`} />
        <Gauge label="系统内存" used={`${((r.sysMemTotalMB - r.sysMemFreeMB) / 1024).toFixed(1)}`} max={`${(r.sysMemTotalMB / 1024).toFixed(1)}`} unit="GB" percent={r.sysMemUsedPercent}
          detail={`可用 ${(r.sysMemFreeMB / 1024).toFixed(1)} GB`} />
        <Gauge label="进程 CPU" used={r.cpuProcessPercent.toFixed(1)} max="100" unit="%" percent={r.cpuProcessPercent}
          detail={`系统 ${r.cpuSystemPercent.toFixed(1)}%`} />
        <Gauge label="磁盘" used={r.diskUsedGB.toFixed(0)} max={r.diskTotalGB.toFixed(0)} unit="GB" percent={r.diskUsedPercent}
          detail={r.diskPath} />
        <InfoCard label="GC 统计" value={`YGC ${r.gcYoungCount}  FGC ${r.gcFullCount}`}
          detail={`累计暂停 ${(r.gcTotalPauseMs / 1000).toFixed(1)}s`} />
        <InfoCard label="线程" value={`${r.threadLive}`}
          detail={`峰值 ${r.threadPeak} · 守护 ${r.threadDaemon}`} />
        <InfoCard label="HikariCP 连接池" value={`活跃 ${r.hikariActive}  空闲 ${r.hikariIdle}`}
          detail={`等待 ${r.hikariPending} · 上限 ${r.hikariMax}`} />
        <InfoCard label="JVM 进程" value={`${r.jvmRssMB.toFixed(0)} MB`}
          detail={`堆外 + Metaspace + CodeCache`} />
      </div>
    </section>
  );
}
