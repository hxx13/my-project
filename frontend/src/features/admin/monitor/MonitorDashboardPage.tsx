/**
 * 系统监控面板 — v5
 *
 * 布局: 两个对等容器
 *   上方容器: AdminFormCard (shrink-0) — 标题行 + pill 标签
 *   下方容器: rounded-xl border shadow-sm overflow-hidden (flex-1)
 *     ├─ shrink-0: 筛选栏（表格专用，其他 tab 不渲染）
 *     └─ flex-1 overflow-auto: 滚动区（卡片 / 表格 / 计时器 / 日志）
 *        表头 sticky 不随滚动
 */

import { useEffect, useRef, useState } from "react";
import { AdminPageShell, AdminFormCard } from "@/components/admin/AdminPageShell";
import { useMonitorStore } from "@/store/useMonitorStore";
import { useMonitorSocket } from "@/hooks/useMonitorSocket";
import { MonitorSkeleton } from "@/features/admin/monitor/MonitorSkeleton";
import { MonitorStatusBar } from "@/features/admin/monitor/MonitorStatusBar";
import { MonitorHealthCards, ActiveSessionsSection } from "@/features/admin/monitor/MonitorHealthCards";
import { MonitorResourceGauges } from "@/features/admin/monitor/MonitorResourceGauges";
import { ClientVersionCard } from "@/features/admin/monitor/ClientVersionCard";
import { MonitorJobToolbar, MonitorJobTable, useJobFilter } from "@/features/admin/monitor/MonitorJobTable";
import { MonitorActiveTimers } from "@/features/admin/monitor/MonitorActiveTimers";
import { MonitorRecentLogFeed } from "@/features/admin/monitor/MonitorRecentLogFeed";
import { cn } from "@/lib/utils";

const POLL_MAIN_MS = 15_000;
const POLL_TIMERS_MS = 10_000;
const POLL_SESSIONS_MS = 30_000;

type TabId = "overview" | "jobs" | "timers" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "总览" },
  { id: "jobs",     label: "定时任务" },
  { id: "timers",   label: "活跃计时器" },
  { id: "logs",     label: "调度日志" },
];

function JobsTab() {
  const jobs = useMonitorStore((s) => s.jobs);
  const runJobNow = useMonitorStore((s) => s.runJobNow);
  const { filter, setFilter, search, setSearch, filtered } = useJobFilter(jobs);

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
      {/* 筛选栏 — 滚动区外，始终可见 */}
      <MonitorJobToolbar
        total={jobs.length}
        filter={filter} setFilter={setFilter}
        search={search} setSearch={setSearch}
      />
      {/* 表格 — 滚动区内，sticky thead */}
      <div className="flex-1 min-h-0 overflow-auto overscroll-y-contain">
        <div className="px-5 pb-4">
          <MonitorJobTable filtered={filtered} onRun={runJobNow} />
        </div>
      </div>
    </div>
  );
}

function OverviewTab() {
  const sessions = useMonitorStore((s) => s.sessions);
  return (
    <div className="flex flex-col gap-[var(--app-space-section-gap)]">
      {/* 健康卡片 + 资源指标 */}
      <MonitorHealthCards />
      <ClientVersionCard />
      <MonitorResourceGauges />
      {/* 活跃连接列表 — 自然高度，由外层统一滚动 */}
      {sessions ? <ActiveSessionsSection sessions={sessions} /> : null}
    </div>
  );
}

export function MonitorDashboardPage() {
  const fetchAll = useMonitorStore((s) => s.fetchAll);
  const fetchTimers = useMonitorStore((s) => s.fetchTimers);
  const jobsLoading = useMonitorStore((s) => s.jobsLoading);

  const [activeTab, setActiveTab] = useState<TabId>("overview");

  useMonitorSocket();

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      fetchAll();
      fetchTimers();
    }
  }, [fetchAll, fetchTimers]);

  const fetchSessions = useMonitorStore((s) => s.fetchSessions);
  const fetchTimerHistory = useMonitorStore((s) => s.fetchTimerHistory);

  useEffect(() => { const t = setInterval(() => fetchAll(), POLL_MAIN_MS); return () => clearInterval(t); }, [fetchAll]);
  useEffect(() => { const t = setInterval(() => { fetchTimers(); fetchTimerHistory(); }, POLL_TIMERS_MS); return () => clearInterval(t); }, [fetchTimers, fetchTimerHistory]);
  useEffect(() => { const t = setInterval(() => fetchSessions(), POLL_SESSIONS_MS); return () => clearInterval(t); }, [fetchSessions]);

  const refreshAll = () => { fetchAll(); fetchTimers(); fetchTimerHistory(); fetchSessions(); };
  const isInitialLoading = jobsLoading;

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">

        {/* ═══ 上方容器: 操作+标签卡片 (shrink-0, 始终可见) ═══ */}
        <AdminFormCard className="shrink-0 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">系统监控</h2>
              <MonitorStatusBar />
            </div>
            <button type="button" onClick={refreshAll}
              className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors">
              手动刷新
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--twin-canvas-soft-2)] p-0.5 self-start">
            {TABS.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm"
                    : "text-[var(--twin-mute)] hover:text-[var(--twin-body)]",
                )}>{tab.label}</button>
            ))}
          </div>
        </AdminFormCard>

        {/* ═══ 第二层：内容区（flex-1，按 tab 区分布局） ═══ */}
        {/* 总览/计时器/日志 → 纯滚动区（无边框）；定时任务 → 自带表格容器 */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {isInitialLoading ? (
            <MonitorSkeleton />
          ) : (
            <>
              {activeTab === "jobs" && <JobsTab />}

              {(activeTab === "overview" || activeTab === "timers" || activeTab === "logs") && (
                <div className="flex-1 min-h-0 overflow-auto overscroll-y-contain pt-4 pb-8">
                  <div className="px-5">
                    {activeTab === "overview" && <OverviewTab />}
                    {activeTab === "timers" && <MonitorActiveTimers />}
                    {activeTab === "logs" && <MonitorRecentLogFeed />}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </AdminPageShell>
  );
}
