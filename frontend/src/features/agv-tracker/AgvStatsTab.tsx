import { useState, useEffect, useMemo, useCallback } from "react";
import { Settings, RefreshCw, AlertTriangle, BarChart3, Activity } from "lucide-react";
import {
  useConfigs, useSnapshot,
  getMetricLabel, getMetricFormat,
} from "@/api/domains/agv-stats.api";
import { useSseStats } from "@/features/agv-tracker/useSseStats";
import AgvMetricCard from "@/features/agv-tracker/AgvMetricCard";
import AgvStatsConfigPanel from "@/features/agv-tracker/AgvStatsConfigPanel";

/**
 * AGV Stats Pipeline Tab — real-time metrics dashboard.
 *
 * Pipeline selector at top, auto-layout metric cards grid below.
 * SSE subscription provides live-updating values.
 * Gear button opens config management slide-out panel.
 */
export default function AgvStatsTab() {
  const [configOpen, setConfigOpen] = useState(false);

  // Fetch active configs to populate pipeline dropdown
  const { data: configs = [], isLoading: configsLoading } = useConfigs();

  const activePipeConfigs = useMemo(
    () => configs.filter(
      (c) => (c.configType === "METRIC_PIPE" || c.configType === "BUNDLE") && c.isActive !== false
    ),
    [configs]
  );

  // Selected pipeline slug
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  // Time range
  const [timeFrom, setTimeFrom] = useState<string>("");
  const [timeTo, setTimeTo] = useState<string>("");

  // SSE subscription for real-time data
  const sseStats = useSseStats(
    selectedSlug,
    timeFrom || undefined,
    timeTo || undefined
  );

  // REST fallback: fetch snapshot when no SSE or SSE disconnected
  const { data: restSnapshot, isLoading: snapshotLoading } = useSnapshot(
    selectedSlug || "",
    !sseStats.connected
  );

  // Merge SSE data with REST fallback
  const snapshotData = useMemo(() => {
    if (sseStats.connected && sseStats.data) return sseStats.data;
    if (restSnapshot) return restSnapshot;
    return sseStats.data;
  }, [sseStats.connected, sseStats.data, restSnapshot]);

  // Auto-select first active pipe if none selected
  const handleSlugChange = useCallback((slug: string) => {
    setSelectedSlug(slug || null);
  }, []);

  // Auto-select first active pipe on initial load
  useEffect(() => {
    if (!selectedSlug && activePipeConfigs.length > 0 && !configsLoading) {
      const first = activePipeConfigs[0];
      if (first.pipelineSlug) setSelectedSlug(first.pipelineSlug);
    }
  }, [selectedSlug, activePipeConfigs, configsLoading]);

  const selectedConfig = activePipeConfigs.find((c) => c.pipelineSlug === selectedSlug);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: pipeline selector + time range + actions */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--app-color-border-default)]">
        {/* Pipeline dropdown */}
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[var(--app-color-text-secondary)] shrink-0" />
          <select
            value={selectedSlug || ""}
            onChange={(e) => handleSlugChange(e.target.value)}
            disabled={configsLoading || activePipeConfigs.length === 0}
            className="appearance-none bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] rounded-[var(--app-radius-element)] px-2.5 py-1.5 text-[11px] text-[var(--app-color-text-primary)] min-w-[160px] disabled:opacity-50 cursor-pointer"
          >
            <option value="" disabled>
              {configsLoading ? "加载中..." : activePipeConfigs.length === 0 ? "暂无可用管道" : "选择管道"}
            </option>
            {activePipeConfigs.map((cfg) => (
              <option key={cfg.id} value={cfg.pipelineSlug || ""}>
                {cfg.name}
              </option>
            ))}
          </select>
        </div>

        {/* Time range */}
        <div className="flex items-center gap-1.5">
          <label className="text-[9px] text-[var(--app-color-text-tertiary)] shrink-0">
            从
          </label>
          <input
            type="datetime-local"
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
            className="bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] rounded-[var(--app-radius-element)] px-2 py-1.5 text-[10px] text-[var(--app-color-text-primary)] w-[160px]"
          />
          <label className="text-[9px] text-[var(--app-color-text-tertiary)] shrink-0">
            至
          </label>
          <input
            type="datetime-local"
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
            className="bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] rounded-[var(--app-radius-element)] px-2 py-1.5 text-[10px] text-[var(--app-color-text-primary)] w-[160px]"
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Connection status */}
        {selectedSlug && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                sseStats.connected ? "animate-pulse" : ""
              }`}
              style={{
                backgroundColor: sseStats.connected ? "#22c55e" : "#6b7280",
              }}
            />
            <span className="text-[var(--app-color-text-tertiary)]">
              {sseStats.connected ? "实时" : snapshotData ? "缓存" : "连接中"}
            </span>
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={() => {
            // Re-trigger SSE by clearing slug briefly
            if (selectedSlug) {
              const slug = selectedSlug;
              setSelectedSlug(null);
              setTimeout(() => setSelectedSlug(slug), 50);
            }
          }}
          disabled={!selectedSlug}
          className="p-1.5 rounded-full text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 transition-colors"
          title="刷新数据"
        >
          <RefreshCw size={14} />
        </button>

        {/* Config gear button */}
        <button
          onClick={() => setConfigOpen(true)}
          className="p-1.5 rounded-full text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)] transition-colors"
          title="统计配置"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {/* No pipeline selected */}
        {!selectedSlug && !configsLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <BarChart3 size={32} className="text-[var(--app-color-text-tertiary)]" />
            <div>
              <div className="text-[12px] font-medium text-[var(--app-color-text-primary)]">
                选择一个管道开始监控
              </div>
              <div className="text-[10px] text-[var(--app-color-text-tertiary)] mt-1">
                从上方下拉菜单选择已激活的指标管道，或点击齿轮图标创建新管道
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {configsLoading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
              加载管道配置中...
            </span>
          </div>
        )}

        {/* SSE error */}
        {sseStats.error && selectedSlug && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-[var(--app-radius-element)] border border-red-200 bg-red-50 text-[10px] text-red-600">
            <AlertTriangle size={12} />
            <span>实时连接异常: {sseStats.error}。显示缓存数据。</span>
          </div>
        )}

        {/* No data state */}
        {selectedSlug && snapshotData && snapshotData.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <BarChart3 size={32} className="text-[var(--app-color-text-tertiary)]" />
            <div>
              <div className="text-[12px] font-medium text-[var(--app-color-text-primary)]">
                暂无指标数据
              </div>
              <div className="text-[10px] text-[var(--app-color-text-tertiary)] mt-1">
                检查管道配置的源站点组是否有数据，或确认时间范围是否正确
              </div>
            </div>
          </div>
        )}

        {/* Metric cards grid */}
        {selectedSlug && snapshotData && snapshotData.length > 0 && (
          <>
            {/* Pipeline info bar */}
            {selectedConfig && (
              <div className="mb-3 flex items-center gap-2 text-[10px]">
                <span className="font-semibold text-[var(--app-color-text-primary)]">
                  {selectedConfig.name}
                </span>
                {selectedConfig.pipelineSlug && (
                  <span className="text-[var(--app-color-text-tertiary)] font-mono">
                    /{selectedConfig.pipelineSlug}
                  </span>
                )}
                <span className="text-[var(--app-color-text-tertiary)]">
                  {snapshotData.length} 项指标
                </span>
              </div>
            )}

            {/* Cards */}
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              }}
            >
              {snapshotData.map((snap) => {
                const label = getMetricLabel(snap.metricKey);
                const format = getMetricFormat(snap.metricKey);
                return (
                  <AgvMetricCard
                    key={`${snap.configId}-${snap.metricKey}`}
                    label={label}
                    value={snap.currentValue}
                    trend={snap.trend}
                    isRunning={snap.isRunning}
                    format={format}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* Loading snapshot */}
        {selectedSlug && snapshotLoading && !snapshotData && (
          <div className="flex items-center justify-center h-full">
            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
              加载指标数据中...
            </span>
          </div>
        )}
      </div>

      {/* Config panel */}
      <AgvStatsConfigPanel open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}
