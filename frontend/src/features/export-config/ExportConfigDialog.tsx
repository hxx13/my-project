import { useCallback, useEffect, useRef, useState } from "react";
import { AdminCenteredPanelShell } from "@/components/admin/AdminCenteredPanelShell";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import DataSkeleton from "@/components/ui/DataSkeleton";
import ErrorRetry from "@/components/ui/ErrorRetry";
import { cn } from "@/lib/utils";
import {
  blockIncluded,
  loadConfig,
  resetConfig,
  saveConfig,
  toggleBlock,
  toggleLevel,
  type SubtotalBlock,
  type SubtotalConfigState,
  type SubtotalSummary,
} from "./subtotalConfig";

export type { SubtotalSummary } from "./subtotalConfig";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  storageKey: string;
  fetchSummary: () => Promise<SubtotalSummary>;
  onExport: (config: SubtotalConfigState) => Promise<void> | void;
};

/** lv1+lv2+lv3 的小计条数（不含总计行）。 */
function sumSubtotals(counts: SubtotalBlock["subtotalCounts"]): number {
  return (counts.lv1 ?? 0) + (counts.lv2 ?? 0) + (counts.lv3 ?? 0);
}

const OUTLINE_BTN =
  "rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50";
const PRIMARY_BTN =
  "rounded-lg bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50";

/**
 * 导出小计配置弹层：层级开关 + 板块开关。
 * 配置由 Task 7 的纯函数读写 localStorage；导出动作交给调用方 onExport。
 */
export default function ExportConfigDialog({
  open,
  onClose,
  title,
  storageKey,
  fetchSummary,
  onExport,
}: Props) {
  const [state, setState] = useState<SubtotalConfigState>(() => loadConfig(storageKey));
  const [summary, setSummary] = useState<SubtotalSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // fetchSummary 可能每次渲染都是新函数，用 ref 固定，避免 effect 反复触发。
  const fetchRef = useRef(fetchSummary);
  fetchRef.current = fetchSummary;

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await fetchRef.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : "摘要加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setState(loadConfig(storageKey));
    void loadSummary();
  }, [open, storageKey, loadSummary]);

  /** 每次开关变化即存，onClose 不丢配置。 */
  const persist = (next: SubtotalConfigState) => {
    setState(next);
    saveConfig(storageKey, next);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(state);
    } finally {
      setExporting(false);
    }
  };

  const exportDisabled = loading || !!error || exporting || !summary;
  const levelTotal = summary
    ? summary.levels
        .filter((l) => l !== "total")
        .reduce(
          (n, l) => n + ((summary.totals.subtotals as Record<string, number>)[l] ?? 0),
          0,
        )
    : 0;

  return (
    <AdminCenteredPanelShell open={open} onClose={onClose} ariaLabel={title} title={title}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <DataSkeleton variant="table" rows={6} />
          ) : error ? (
            <ErrorRetry message={error} onRetry={() => void loadSummary()} />
          ) : !summary ? (
            <div className="py-8 text-center text-sm text-[var(--twin-mute)]">暂无数据</div>
          ) : (
            <div className="space-y-4">
              {/* 1. 摘要数字行 */}
              <p className="text-xs text-[var(--twin-mute)]">
                {summary.totals.blocks} 个板块 · {summary.totals.detailRows} 行明细 · 各级小计{" "}
                {levelTotal} 条
              </p>

              {/* 2. 层级开关（只渲染摘要实际存在的层级） */}
              {summary.levels.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold text-[var(--twin-ink)]">小计层级</h3>
                  <div className="space-y-1.5">
                    {summary.levels.map((lv) => (
                      <div
                        key={lv}
                        className="flex items-center justify-between gap-3 rounded-twin-sm px-1 py-1"
                      >
                        <span className="text-sm text-[var(--twin-body)]">
                          {summary.levelLabels[lv] ?? lv}
                        </span>
                        <AdminSwitchScaled
                          size="sm"
                          checked={!state.offLevels.includes(lv)}
                          onChange={() => persist(toggleLevel(state, lv))}
                          aria-label={summary.levelLabels[lv] ?? lv}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 3. 板块列表 */}
              <section>
                <h3 className="mb-2 text-xs font-semibold text-[var(--twin-ink)]">板块</h3>
                {summary.blocks.length === 0 ? (
                  <div className="rounded-twin-lg border border-dashed border-[var(--twin-hairline)] py-6 text-center text-sm text-[var(--twin-mute)]">
                    无可配置的板块
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-twin-lg border border-[var(--twin-hairline)]">
                    {summary.blocks.map((b) => (
                      <div
                        key={b.key}
                        className="flex items-center justify-between gap-3 border-b border-[var(--twin-hairline)] px-3 py-2 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm text-[var(--twin-ink)]" title={b.label}>
                            {b.label}
                          </div>
                          <div className="text-[11px] text-[var(--twin-mute)]">
                            明细 {b.detailCount} 行 · 小计 {sumSubtotals(b.subtotalCounts)} 条
                          </div>
                        </div>
                        <AdminSwitchScaled
                          size="sm"
                          checked={blockIncluded(state, b.key)}
                          onChange={() => persist(toggleBlock(state, b.key))}
                          aria-label={b.label}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* 4. 底部操作行 */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
          <button
            type="button"
            className={cn(OUTLINE_BTN, "disabled:pointer-events-none")}
            disabled={loading || !!error}
            onClick={() => persist(resetConfig())}
          >
            恢复全选
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className={OUTLINE_BTN} onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className={PRIMARY_BTN}
              disabled={exportDisabled}
              onClick={() => void handleExport()}
            >
              {exporting ? "导出中…" : "导出"}
            </button>
          </div>
        </div>
      </div>
    </AdminCenteredPanelShell>
  );
}
