import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { BarChart3, Camera, Layers, Settings2 } from "lucide-react";
import {
  buildStructuredFloorTabs,
  fetchWinccTelemetrySnapshot,
  type TelemetryStructuredFloorTab,
} from "@/api/telemetryApi";
import {
  captureTelemetryViewSnapshot,
  fetchTelemetryChartGroups,
  fetchTelemetryFleetMatrix,
  fetchTelemetryPartitionSummary,
  fetchTelemetryViewSnapshots,
  type DisplayProfileMode,
  type TelemetryFleetMatrixCell,
} from "@/api/domains/telemetryInsights.api";
import { fetchTelemetryArchiveSeries } from "@/api/telemetryApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminCenteredPanelShell } from "@/components/admin/AdminCenteredPanelShell";
import { AdminDataTableWrap, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { buildAutoChartGroupsFromSuites } from "@/features/telemetry-insights/buildAutoChartGroups";
import { TelemetryChartGroupPanel } from "@/features/telemetry-insights/TelemetryChartGroupPanel";
import { TelemetryFleetHeatmap } from "@/features/telemetry-insights/TelemetryFleetHeatmap";
import { TelemetrySeriesChart } from "@/features/telemetry-insights/TelemetrySeriesChart";
import { isTelemetryInsightsDebug, tiDebug } from "@/features/telemetry-insights/telemetryInsightsDebug";
import { useWatchlistVariableCatalog } from "@/features/telemetry-insights/useWatchlistVariableCatalog";

const METRIC_OPTIONS = [
  { code: "TEMP", label: "温度" },
  { code: "HUM", label: "湿度" },
  { code: "PRESSURE", label: "压差" },
] as const;

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 3600_000);
  return { from: from.toISOString().slice(0, 16), to: to.toISOString().slice(0, 16) };
}

type DrillTarget = {
  cell: TelemetryFleetMatrixCell;
  displayLabel: string;
};

function DrillDownDialog({
  target,
  displayProfile,
  fromIso,
  toIso,
  onClose,
}: {
  target: DrillTarget | null;
  displayProfile: DisplayProfileMode;
  fromIso: string;
  toIso: string;
  onClose: () => void;
}) {
  const cell = target?.cell ?? null;
  const vn = cell?.variableName?.trim() ?? "";
  const seriesQ = useQuery({
    queryKey: ["telemetry", "insights", "drill", vn, displayProfile, fromIso, toIso],
    queryFn: () =>
      fetchTelemetryArchiveSeries(
        vn,
        fromIso,
        toIso,
        displayProfile === "PRESENTATION" ? 120 : 240,
        displayProfile
      ),
    enabled: vn.length > 0,
  });

  return (
    <AdminCenteredPanelShell
      open={target != null}
      onClose={onClose}
      ariaLabel="单变量钻取"
      title={target?.displayLabel ?? "单变量曲线"}
      className="max-w-[min(560px,96vw)]"
    >
      {cell ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-[var(--app-color-text-muted)]">最新值</dt>
              <dd className="font-mono font-semibold">{cell.latestValue?.toFixed(1) ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--app-color-text-muted)]">合规</dt>
              <dd>{cell.complianceStatus ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[var(--app-color-text-muted)]">房间</dt>
              <dd>{cell.roomCanonical}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[var(--app-color-text-muted)]">WinCC 变量</dt>
              <dd className="break-all font-mono text-[10px]">{vn || "—"}</dd>
            </div>
          </dl>
          {vn ? (
            seriesQ.isPending ? (
              <div className="text-xs text-[var(--app-color-text-muted)]">加载曲线…</div>
            ) : (
              <TelemetrySeriesChart
                points={seriesQ.data?.points ?? []}
                queriedFrom={seriesQ.data?.queriedFrom}
                queriedTo={seriesQ.data?.queriedTo}
                displayProfile={displayProfile}
                metricKind={
                  (cell.metricKindCode || "").toUpperCase().includes("HUM")
                    ? "hum"
                    : (cell.metricKindCode || "").toUpperCase().includes("PRESS")
                      ? "pressure"
                      : "temp"
                }
                height={200}
                seriesLabel={target?.displayLabel}
              />
            )
          ) : null}
        </div>
      ) : null}
    </AdminCenteredPanelShell>
  );
}

export default function AdminTelemetryInsightsPage() {
  const qc = useQueryClient();
  const { catalog } = useWatchlistVariableCatalog();
  const [range, setRange] = useState(defaultRange);
  const [floorFilter, setFloorFilter] = useState("");
  const [metricCode, setMetricCode] = useState<string>("TEMP");
  const [displayProfile, setDisplayProfile] = useState<DisplayProfileMode>("STANDARD");
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showAutoGroups, setShowAutoGroups] = useState(false);

  const fromIso = new Date(range.from).toISOString();
  const toIso = new Date(range.to).toISOString();
  const useRollup = (Date.parse(toIso) - Date.parse(fromIso)) / 3600_000 > 48;

  const snapshotQ = useQuery({
    queryKey: ["telemetry", "wincc", "insights-snapshot"],
    queryFn: () => fetchWinccTelemetrySnapshot(),
    staleTime: 60_000,
  });

  const structuredTabs = useMemo((): TelemetryStructuredFloorTab[] => {
    const items = snapshotQ.data?.items ?? [];
    return buildStructuredFloorTabs(items);
  }, [snapshotQ.data?.items]);

  const autoGroups = useMemo(() => {
    const suites = structuredTabs.flatMap((t) => t.suiteGroups ?? []);
    return buildAutoChartGroupsFromSuites(suites);
  }, [structuredTabs]);

  const manualGroupsQ = useQuery({
    queryKey: ["admin", "telemetry-insights", "chart-groups"],
    queryFn: fetchTelemetryChartGroups,
  });

  const chartGroups = useMemo(() => {
    const manual = (manualGroupsQ.data ?? []).filter((g) => g.source !== "auto_suite");
    if (showAutoGroups) return [...manual, ...autoGroups];
    return manual;
  }, [manualGroupsQ.data, autoGroups, showAutoGroups]);

  const matrixQ = useQuery({
    queryKey: ["telemetry", "insights", "matrix", fromIso, toIso, metricCode, floorFilter],
    queryFn: () =>
      fetchTelemetryFleetMatrix({
        from: fromIso,
        to: toIso,
        metricKindCode: metricCode,
        floorFilter: floorFilter.trim() || undefined,
      }),
    enabled: Boolean(fromIso && toIso),
    staleTime: 30_000,
  });

  const partitionQ = useQuery({
    queryKey: ["telemetry", "insights", "partition", fromIso, toIso, metricCode, floorFilter, displayProfile],
    queryFn: () =>
      fetchTelemetryPartitionSummary({
        from: fromIso,
        to: toIso,
        metricKindCode: metricCode,
        floorFilter: floorFilter.trim() || undefined,
        displayProfile,
      }),
    enabled: Boolean(fromIso && toIso),
    staleTime: 30_000,
  });

  const snapshotsQ = useQuery({
    queryKey: ["admin", "telemetry-insights", "snapshots"],
    queryFn: () => fetchTelemetryViewSnapshots({ page: 1, size: 10 }),
    enabled: showSnapshots,
  });

  const captureM = useMutation({
    mutationFn: () =>
      captureTelemetryViewSnapshot({
        profileCode: displayProfile,
        from: fromIso,
        to: toIso,
      }),
    onSuccess: () => {
      toast.success("快照已捕获");
      void qc.invalidateQueries({ queryKey: ["admin", "telemetry-insights", "snapshots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSeriesDrill = useCallback(
    (variableName: string, displayLabel: string) => {
      tiDebug("series drill", { variableName, metricCode });
      setDrillTarget({
        cell: {
          roomCanonical: variableName,
          metricKindCode: metricCode,
          variableName,
          displayLabel,
          complianceStatus: "UNKNOWN",
        },
        displayLabel,
      });
    },
    [metricCode]
  );

  const onHeatmapCellClick = useCallback((cell: TelemetryFleetMatrixCell) => {
    tiDebug("heatmap cell click", {
      room: cell.roomCanonical,
      variable: cell.variableName,
      status: cell.complianceStatus,
    });
    setDrillTarget({
      cell,
      displayLabel: cell.displayLabel?.trim() || cell.roomCanonical,
    });
  }, []);

  useEffect(() => {
    if (!isTelemetryInsightsDebug()) return;
    tiDebug("page state", {
      fromIso,
      toIso,
      metricCode,
      floorFilter,
      displayProfile,
      useRollup,
      autoGroups: autoGroups.length,
      manualGroups: (manualGroupsQ.data ?? []).filter((g) => g.source !== "auto_suite").length,
      matrixCells: matrixQ.data?.cells?.length,
    });
  }, [
    fromIso,
    toIso,
    metricCode,
    floorFilter,
    displayProfile,
    useRollup,
    autoGroups.length,
    manualGroupsQ.data,
    matrixQ.data?.cells?.length,
  ]);

  const onDisplayProfileChange = useCallback((v: boolean) => {
    const next = v ? "PRESENTATION" : "STANDARD";
    tiDebug("display profile toggle", { profile: next });
    setDisplayProfile(next);
  }, []);

  const floorOptions = useMemo(() => catalog.floors, [catalog.floors]);

  return (
    <AdminPageShell>
      <div className="flex items-center gap-3 shrink-0">
        <span className="inline-flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[var(--app-color-accent-primary)]" />
          遥测历史分析
        </span>
        <div className="flex flex-wrap gap-2 ml-auto">
          <Link
            to="/admin/telemetry-insights-config"
            className="inline-flex items-center rounded-[length:var(--admin-radius-md,0.375rem)] border-2 border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-container)] px-3 py-1.5 text-sm font-medium text-[var(--app-color-text-primary)] shadow-sm hover:bg-[var(--app-color-surface-hover)]"
          >
            <Settings2 className="mr-1 h-4 w-4" />
            对比组配置
          </Link>
          <AdminButton tone="secondary" onClick={() => setShowSnapshots((v) => !v)}>
            <Layers className="mr-1 h-4 w-4" />
            历史快照
          </AdminButton>
          <AdminButton tone="secondary" loading={captureM.isPending} onClick={() => captureM.mutate()}>
            <Camera className="mr-1 h-4 w-4" />
            捕获快照
          </AdminButton>
        </div>
      </div>
      <div className="max-h-[calc(100dvh-var(--admin-chrome-offset)-48px)] min-h-[200px] overflow-y-auto">
      <AdminDataTableWrap className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="mb-1 block text-[var(--app-color-text-muted)]">起始</span>
            <input
              type="datetime-local"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="rounded-[var(--app-radius-control)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--app-color-text-muted)]">结束</span>
            <input
              type="datetime-local"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="rounded-[var(--app-radius-control)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--app-color-text-muted)]">楼层</span>
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className="w-28 rounded-[var(--app-radius-control)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1.5 text-sm"
            >
              <option value="">全部</option>
              {floorOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            {METRIC_OPTIONS.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => setMetricCode(m.code)}
                className={`rounded-[var(--app-radius-control)] px-3 py-1.5 text-xs font-medium transition ${
                  metricCode === m.code
                    ? "bg-[var(--app-color-accent-primary)] text-[var(--app-color-text-on-accent)]"
                    : "border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-raised)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-color-border-default)] px-3 py-1.5">
            <span className="text-xs text-[var(--app-color-text-muted)]">标准监测</span>
            <AdminSwitchScaled
              checked={displayProfile === "PRESENTATION"}
              onChange={onDisplayProfileChange}
              aria-label="切换参观展示模式"
            />
            <span className="text-xs text-[var(--app-color-text-muted)]">参观展示</span>
          </div>
        </div>
        {useRollup ? (
          <p className="text-[10px] text-[var(--app-color-text-muted)]">
            时间窗 &gt; 48h，序列查询将自动优先使用 L1 rollup（若已跑 TELEMETRY_ARCHIVE_ROLLUP）。
          </p>
        ) : null}
      </AdminDataTableWrap>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--app-color-text-primary)]">Fleet 热力矩阵</h2>
        {matrixQ.isPending ? (
          <div className="text-sm text-[var(--app-color-text-muted)]">加载矩阵…</div>
        ) : matrixQ.isError ? (
          <div className="text-sm text-[var(--app-color-status-danger)]">{(matrixQ.error as Error).message}</div>
        ) : (
          <TelemetryFleetHeatmap
            cells={matrixQ.data?.cells ?? []}
            metricKindCode={metricCode}
            onCellClick={onHeatmapCellClick}
          />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--app-color-text-primary)]">分区汇总 sparkline</h2>
          {partitionQ.isPending ? (
            <div className="text-sm text-[var(--app-color-text-muted)]">加载分区…</div>
          ) : (partitionQ.data ?? []).length === 0 ? (
            <div className="text-sm text-[var(--app-color-text-muted)]">暂无分区数据</div>
          ) : (
            <div className="space-y-3">
              {(partitionQ.data ?? []).slice(0, 6).map((p) => (
                <div
                  key={p.partitionKey}
                  className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] p-3"
                >
                  <div className="mb-1 text-xs font-medium text-[var(--app-color-text-secondary)]">
                    {p.partitionLabel}
                  </div>
                  <TelemetrySeriesChart
                    points={p.medianPoints}
                    queriedFrom={p.queriedFrom}
                    queriedTo={p.queriedTo}
                    displayProfile={displayProfile}
                    metricKind={
                      metricCode.includes("HUM") ? "hum" : metricCode.includes("PRESS") ? "pressure" : "temp"
                    }
                    height={80}
                    seriesLabel="median"
                    stroke="var(--app-color-accent-primary)"
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">对比组曲线</h2>
            <label className="flex items-center gap-2 text-xs text-[var(--app-color-text-muted)]">
              <input
                type="checkbox"
                checked={showAutoGroups}
                onChange={(e) => setShowAutoGroups(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              叠加自动套间组
            </label>
          </div>
          {manualGroupsQ.isPending ? (
            <div className="text-sm text-[var(--app-color-text-muted)]">加载对比组…</div>
          ) : chartGroups.length === 0 ? (
            <div className="rounded-[var(--app-radius-container)] border border-dashed border-[var(--app-color-border-default)] p-4 text-sm text-[var(--app-color-text-muted)]">
              <p>尚未配置对比组。</p>
              <Link
                to="/admin/telemetry-insights-config"
                className="mt-2 inline-flex text-[var(--app-color-accent-primary)] hover:underline"
              >
                前往对比组配置 →
              </Link>
            </div>
          ) : (
            chartGroups.map((g) => (
              <TelemetryChartGroupPanel
                key={`${g.source}-${g.id ?? g.name}`}
                group={g}
                from={fromIso}
                to={toIso}
                displayProfile={displayProfile}
                fromRollup={useRollup}
                onSeriesClick={onSeriesDrill}
              />
            ))
          )}
        </section>
      </div>

      {showSnapshots ? (
        <AdminDataTableWrap className="p-4">
          <h2 className="mb-2 text-sm font-semibold">历史快照</h2>
          {snapshotsQ.isPending ? (
            <div className="text-sm text-[var(--app-color-text-muted)]">加载…</div>
          ) : (
            <ul className="space-y-2 text-xs">
              {(snapshotsQ.data?.items ?? []).map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--app-color-border-subtle)] px-2 py-1.5"
                >
                  <span>
                    #{s.id} · {s.profileCode} · {new Date(s.capturedAt).toLocaleString()}
                  </span>
                  <a
                    href={`data:application/json;charset=utf-8,${encodeURIComponent(s.payloadJson)}`}
                    download={`telemetry-snapshot-${s.id}.json`}
                    className="text-[var(--app-color-accent-primary)] hover:underline"
                  >
                    导出 JSON
                  </a>
                </li>
              ))}
            </ul>
          )}
        </AdminDataTableWrap>
      ) : null}

      <DrillDownDialog
        target={drillTarget}
        displayProfile={displayProfile}
        fromIso={fromIso}
        toIso={toIso}
        onClose={() => setDrillTarget(null)}
      />
      </div>
    </AdminPageShell>
  );
}
