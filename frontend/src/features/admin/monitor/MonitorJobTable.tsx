/**
 * MonitorJobTable — 定时任务实时监视表
 *
 * 导出:
 *   MonitorJobToolbar — 筛选栏（由父级放在滚动区外）
 *   MonitorJobTable   — 纯表格 (sticky thead，在父级滚动区内)
 *
 * 状态派生规则（优先序）:
 *   running===true              → 绿色 "运行中" + pulse（覆盖 lastStatus）
 *   !running && lastStatus=SUCCESS → 灰色 "成功"
 *   !running && lastStatus=FAILED  → 红色 "失败" + error tooltip
 *   !running && enabled===false    → 灰色 "已禁用"
 *   无 lastStatus                  → 灰色 "空闲"
 */

import { useState, useMemo } from "react";
import type { JobSnapshot } from "@/api/domains/monitor.api";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════

/** 将 ISO 日期格式化为 "MM-DD HH:mm"，null → "从未" */
function fmtDate(iso: string | null): string {
  if (!iso) return "从未";
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

// ═══════════════════════════════════════════
// 当前状态派生
// ═══════════════════════════════════════════

interface DerivedStatus {
  label: string;
  variant: "running" | "success" | "failed" | "disabled" | "idle";
  errorMsg: string | null;
}

function deriveStatus(job: JobSnapshot): DerivedStatus {
  if (job.running) {
    return { label: "运行中", variant: "running", errorMsg: null };
  }
  if (!job.enabled) {
    return { label: "已禁用", variant: "disabled", errorMsg: null };
  }
  if (job.lastStatus === "SUCCESS") {
    return { label: "成功", variant: "success", errorMsg: null };
  }
  if (job.lastStatus === "FAILED") {
    return { label: "失败", variant: "failed", errorMsg: job.lastError ?? null };
  }
  return { label: "空闲", variant: "idle", errorMsg: null };
}

// ═══════════════════════════════════════════
// 状态 dot
// ═══════════════════════════════════════════

const dotBase = "h-2.5 w-2.5 rounded-full shrink-0";

function StatusDot({ variant }: { variant: DerivedStatus["variant"] }) {
  const cls = (() => {
    switch (variant) {
      case "running":
        return cn(dotBase, "bg-[var(--app-color-feedback-success)] motion-safe:animate-pulse");
      case "failed":
        return cn(dotBase, "bg-[var(--app-color-feedback-danger)]");
      case "disabled":
        return cn(dotBase, "bg-[var(--app-color-text-tertiary)] opacity-40");
      case "idle":
        return cn(dotBase, "bg-[var(--app-color-text-tertiary)]");
      case "success":
        return cn(dotBase, "bg-[var(--app-color-text-tertiary)]");
      default:
        return cn(dotBase, "bg-[var(--app-color-text-tertiary)]");
    }
  })();
  return <span className={cls} aria-label={variant} />;
}

// ═══════════════════════════════════════════
// 筛选
// ═══════════════════════════════════════════

export type JobFilterKey = "ALL" | "RUNNING" | "FAILED" | "CORE" | "DISABLED";

export const JOB_FILTERS: { key: JobFilterKey; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "RUNNING", label: "运行中" },
  { key: "FAILED", label: "失败" },
  { key: "CORE", label: "核心" },
  { key: "DISABLED", label: "已禁用" },
];

const CORE_PREFIXES = ["TELEMETRY", "DAHUA", "ARO", "RUN_REAPER", "PERSONNEL"];

export function useJobFilter(jobs: JobSnapshot[]) {
  const [filter, setFilter] = useState<JobFilterKey>("ALL");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let r = jobs;

    if (filter === "RUNNING") r = r.filter((j) => j.running);
    else if (filter === "FAILED") r = r.filter((j) => !j.running && j.lastStatus === "FAILED");
    else if (filter === "DISABLED") r = r.filter((j) => !j.enabled);
    else if (filter === "CORE") r = r.filter((j) => CORE_PREFIXES.some((p) => j.jobKey.startsWith(p)));

    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (j) =>
          j.jobName.toLowerCase().includes(q) ||
          j.jobKey.toLowerCase().includes(q),
      );
    }

    return r;
  }, [jobs, filter, search]);

  return { filter, setFilter, search, setSearch, filtered };
}

// ═══════════════════════════════════════════
// MonitorJobToolbar — 由父级放在滚动区外
// ═══════════════════════════════════════════

export function MonitorJobToolbar({
  total,
  filter,
  setFilter,
  search,
  setSearch,
}: {
  total: number;
  filter: JobFilterKey;
  setFilter: (f: JobFilterKey) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  return (
    <div className="shrink-0 flex items-center gap-2 flex-wrap px-5 py-3 border-b border-[var(--app-color-border-default)]">
      <span className="text-sm font-semibold text-[var(--app-color-text-secondary)]">
        定时任务监视{" "}
        <span className="font-normal text-[var(--app-color-text-tertiary)]">
          {total} 个
        </span>
      </span>
      <div className="flex-1" />
      {JOB_FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => setFilter(f.key)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors border",
            filter === f.key
              ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent-active)]"
              : "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]",
          )}
        >
          {f.label}
        </button>
      ))}
      <input
        type="text"
        placeholder="搜索任务…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-1.5 text-xs text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--app-color-accent)] w-40"
      />
    </div>
  );
}

// ═══════════════════════════════════════════
// 单行
// ═══════════════════════════════════════════

function JobRow({
  job,
  onRun,
}: {
  job: JobSnapshot;
  onRun: (k: string) => void;
}) {
  const st = deriveStatus(job);
  const isRunning = st.variant === "running";
  const isDisabled = st.variant === "disabled";

  return (
    <tr
      className={cn(
        "border-b border-[var(--app-color-border-default)] transition-colors",
        isRunning && "bg-[var(--app-color-feedback-success-soft)]",
        st.variant === "failed" && "bg-[var(--app-color-feedback-danger-soft)]/50",
        isDisabled && "opacity-50",
      )}
    >
      {/* 1. 启用 */}
      <td className="p-3 pl-5 w-16">
        {job.enabled ? (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]">
            启用
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)]">
            禁用
          </span>
        )}
      </td>

      {/* 2. 任务名称 */}
      <td className="p-3">
        <div className="text-sm font-medium text-[var(--app-color-text-primary)]">
          {job.jobName}
        </div>
        <div className="text-xs text-[var(--app-color-text-tertiary)] font-mono">
          {job.jobKey}
        </div>
      </td>

      {/* 3. 上次执行 */}
      <td className="p-3 w-24 text-sm text-[var(--app-color-text-secondary)] font-mono tabular-nums">
        {fmtDate(job.lastRunAt)}
      </td>

      {/* 4. 上次成功 */}
      <td className="p-3 w-24 text-sm text-[var(--app-color-text-secondary)] font-mono tabular-nums">
        {fmtDate(job.lastSuccessAt)}
      </td>

      {/* 5. 当前状态 */}
      <td className="p-3 w-20">
        <div className="flex items-center gap-2">
          <StatusDot variant={st.variant} />
          {st.variant === "failed" && st.errorMsg ? (
            <span
              className="text-xs font-medium text-[var(--app-color-feedback-danger)] cursor-help underline decoration-dotted underline-offset-2"
              title={st.errorMsg}
            >
              {st.label}
            </span>
          ) : (
            <span
              className={cn(
                "text-xs font-medium",
                isRunning &&
                  "text-[var(--app-color-feedback-success)]",
                st.variant === "success" && "text-[var(--app-color-text-tertiary)]",
                st.variant === "failed" && "text-[var(--app-color-feedback-danger)]",
                st.variant === "disabled" && "text-[var(--app-color-text-tertiary)]",
                st.variant === "idle" && "text-[var(--app-color-text-tertiary)]",
              )}
            >
              {st.label}
            </span>
          )}
        </div>
      </td>

      {/* 6. 调度方式 */}
      <td className="p-3 text-sm text-[var(--app-color-text-secondary)] max-w-[220px] truncate">
        {job.scheduleDescription || "—"}
      </td>

      {/* 7. 操作 */}
      <td className="p-3 pr-5 w-20">
        <button
          type="button"
          disabled={job.running || !job.enabled}
          onClick={() => onRun(job.jobKey)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]",
            "hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]",
            "focus:outline-2 focus:outline-offset-2 focus:outline-[var(--app-color-accent)]",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {"▶ 执行"}
        </button>
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════
// MonitorJobTable — 纯表格（在父级滚动区内）
// ═══════════════════════════════════════════

export function MonitorJobTable({
  filtered,
  onRun,
}: {
  filtered: JobSnapshot[];
  onRun: (k: string) => void;
}) {
  if (filtered.length === 0) {
    return (
      <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">
        暂无匹配任务
      </div>
    );
  }

  return (
    /* div 无 overflow — 由父容器处理滚动，保证 sticky thead 生效 */
    <div>
      <table className="w-full min-w-max text-left text-sm whitespace-nowrap border-collapse">
        <thead className="border-b-2 border-[var(--app-color-border-strong)]">
          <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
            <th className="p-3 pl-5 w-16">启用</th>
            <th className="p-3">任务名称</th>
            <th className="p-3 w-24">上次执行</th>
            <th className="p-3 w-24">上次成功</th>
            <th className="p-3 w-20">当前状态</th>
            <th className="p-3">调度方式</th>
            <th className="p-3 pr-5 w-20">操作</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((job) => (
            <JobRow key={job.jobKey} job={job} onRun={onRun} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
