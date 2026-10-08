/**
 * MonitorResourceGauges — 资源指标
 *
 * 8 个卡片 (4×2 网格):
 *   JVM 堆 | 系统内存 | 进程 CPU | 磁盘
 *   GC 统计 | 线程    | HikariCP | JVM 进程 RSS
 *
 * 进度条使用 CSS transition 实现实时变动效果。
 *
 * ⚠ 颜色**由后端下发的 level 决定**（ok/warn/crit），前端不再硬编码 60/80 ——
 * 那套阈值原先两头各写一份，必然漂移。
 */

import type { MetricLevel, ResourceSnapshot } from "@/api/domains/monitor.api";
import { useMonitorStore } from "@/store/useMonitorStore";
import { cn } from "@/lib/utils";

/** 等级 → 进度条底色。 */
function levelBar(level: MetricLevel): string {
  if (level === "crit") return "bg-[var(--app-color-feedback-danger)]";
  if (level === "warn") return "bg-[var(--app-color-feedback-warning)]";
  return "bg-[var(--app-color-feedback-success)]";
}

/** 等级 → 百分比文字色。 */
function levelText(level: MetricLevel): string {
  return level === "crit"
    ? "text-[var(--app-color-feedback-danger)]"
    : "text-[var(--app-color-text-secondary)]";
}

function Gauge({ label, used, max, unit, percent, level, detail }: {
  label: string; used: string; max: string; unit: string; percent: number; level: MetricLevel; detail?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{label}</span>
        <span className={cn("text-sm font-medium font-mono tabular-nums", levelText(level))}>
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="h-2.5 w-full rounded-[var(--app-radius-pill)] bg-[var(--app-color-surface-hover)] overflow-hidden mb-2">
        <div className={cn("h-full rounded-[var(--app-radius-pill)]", levelBar(level))}
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

  // 系统内存：有 MemAvailable 就用它算「已用」，「空闲（不含缓存）」会永远接近满，是误导。
  const hasAvailable = r.sysMemAvailableMB >= 0;
  const sysUsedGB = (r.sysMemTotalMB - (hasAvailable ? r.sysMemAvailableMB : r.sysMemFreeMB)) / 1024;
  const sysDetail = hasAvailable
    ? `可用 ${(r.sysMemAvailableMB / 1024).toFixed(1)} GB（含可回收缓存）`
    : `空闲 ${(r.sysMemFreeMB / 1024).toFixed(1)} GB（该平台无 MemAvailable）`;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">资源占用</h3>
      <div className="grid gap-[var(--app-space-element-gap)] grid-cols-2 lg:grid-cols-4">
        <Gauge label="JVM 堆内存" used={r.heapUsedMB.toFixed(0)} max={r.heapMaxMB.toFixed(0)} unit="MB"
          percent={r.heapUsedPercent} level={r.heapLevel}
          detail={`Metaspace ${r.nonHeapUsedMB.toFixed(0)} MB`} />
        <Gauge label="系统内存" used={sysUsedGB.toFixed(1)} max={(r.sysMemTotalMB / 1024).toFixed(1)} unit="GB"
          percent={r.sysMemUsedPercent} level={r.sysMemLevel} detail={sysDetail} />
        <Gauge label="进程 CPU" used={r.cpuProcessPercent.toFixed(1)} max="100" unit="%"
          percent={r.cpuProcessPercent} level={r.cpuLevel}
          detail={`系统 ${r.cpuSystemPercent.toFixed(1)}%`} />
        <Gauge label="磁盘" used={r.diskUsedGB.toFixed(0)} max={r.diskTotalGB.toFixed(0)} unit="GB"
          percent={r.diskUsedPercent} level={r.diskLevel} detail={r.diskPath} />
        <InfoCard label="GC 统计" value={`YGC ${r.gcYoungCount}  FGC ${r.gcFullCount}`}
          detail={`累计暂停 ${(r.gcTotalPauseMs / 1000).toFixed(1)}s`} />
        <InfoCard label="线程" value={`${r.threadLive}`}
          detail={`峰值 ${r.threadPeak} · 守护 ${r.threadDaemon}`} />
        <InfoCard label="HikariCP 连接池" value={`活跃 ${r.hikariActive}  空闲 ${r.hikariIdle}`}
          detail={`等待 ${r.hikariPending} · 上限 ${r.hikariMax}`} />
        {/* RSS 只有 Linux 的 /proc 给得出；非 Linux 显示「—」，不编一个数出来 */}
        <InfoCard label="JVM 进程 RSS"
          value={r.jvmRssMB >= 0 ? `${r.jvmRssMB.toFixed(0)} MB` : "—"}
          detail={r.jvmRssMB >= 0 ? "含堆外 · 取自 /proc/self/status" : "仅 Linux 可取（Windows 无 /proc）"} />
      </div>
    </section>
  );
}
