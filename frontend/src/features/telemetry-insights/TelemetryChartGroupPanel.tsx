import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TelemetryArchiveSeries } from "@/api/telemetryApi";
import {
  fetchTelemetryArchiveSeriesBatch,
  type DisplayProfileMode,
  type TelemetryChartGroup,
} from "@/api/domains/telemetryInsights.api";
import {
  displayLabelForVariable,
  metricKindForVariable,
} from "@/features/telemetry-insights/buildWatchlistVariableCatalog";
import { TelemetrySeriesChart } from "@/features/telemetry-insights/TelemetrySeriesChart";
import { useWatchlistVariableCatalog } from "@/features/telemetry-insights/useWatchlistVariableCatalog";

const METRIC_ROWS = [
  { key: "TEMP", label: "温度", kind: "temp" as const, color: "var(--app-color-chart-temp, #fb923c)" },
  { key: "HUM", label: "湿度", kind: "hum" as const, color: "var(--app-color-chart-hum, #22d3ee)" },
  { key: "PRESS", label: "压差", kind: "pressure" as const, color: "var(--app-color-chart-pressure, #c084fc)" },
] as const;

function metricRowForCode(code: string): (typeof METRIC_ROWS)[number] | null {
  const mk = code.toUpperCase();
  if (mk.includes("HUM") || mk.includes("RH") || mk === "H") return METRIC_ROWS[1];
  if (mk.includes("PRESS") || mk.includes("PA") || mk === "P") return METRIC_ROWS[2];
  if (mk.includes("TEMP") || mk === "T") return METRIC_ROWS[0];
  return null;
}

function metricRowForVariable(
  vn: string,
  group: TelemetryChartGroup,
  catalog: ReturnType<typeof useWatchlistVariableCatalog>["catalog"]
): (typeof METRIC_ROWS)[number] {
  const mk = metricKindForVariable(vn, group.variableMetadata, catalog);
  return metricRowForCode(mk) ?? METRIC_ROWS[0];
}

export type TelemetryChartGroupPanelProps = {
  group: TelemetryChartGroup;
  from: string;
  to: string;
  displayProfile: DisplayProfileMode;
  fromRollup?: boolean;
  onSeriesClick?: (variableName: string, displayLabel: string) => void;
};

export function TelemetryChartGroupPanel({
  group,
  from,
  to,
  displayProfile,
  fromRollup,
  onSeriesClick,
}: TelemetryChartGroupPanelProps) {
  const { catalog } = useWatchlistVariableCatalog();
  const vars = group.variableNames ?? [];
  const batchQ = useQuery({
    queryKey: ["telemetry", "insights", "batch", group.id ?? group.name, from, to, displayProfile, vars.join("|")],
    queryFn: () =>
      fetchTelemetryArchiveSeriesBatch({
        variableNames: vars,
        from,
        to,
        displayProfile,
        fromRollup,
        maxPoints: displayProfile === "PRESENTATION" ? 120 : 240,
      }),
    enabled: vars.length > 0 && Boolean(from && to),
    staleTime: 30_000,
  });

  const seriesByVar = useMemo(() => {
    const map = new Map<string, TelemetryArchiveSeries>();
    for (const s of batchQ.data?.series ?? []) {
      map.set(s.variableName, s);
    }
    return map;
  }, [batchQ.data?.series]);

  const labelFor = (vn: string) => displayLabelForVariable(vn, group.variableMetadata, catalog);

  if (vars.length === 0) {
    return (
      <div className="text-xs text-[var(--app-color-text-muted)]">对比组「{group.name}」无变量</div>
    );
  }

  return (
    <div className="space-y-2 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)]">{group.name}</h3>
          {group.description ? (
            <p className="text-xs text-[var(--app-color-text-muted)]">{group.description}</p>
          ) : null}
        </div>
        <span className="text-[10px] uppercase tracking-wide text-[var(--app-color-text-muted)]">
          {group.source === "auto_suite" ? "自动套间" : "手动组"} · {group.layoutMode}
        </span>
      </div>
      {batchQ.isPending ? (
        <div className="text-xs text-[var(--app-color-text-muted)]">加载对比序列…</div>
      ) : batchQ.isError ? (
        <div className="text-xs text-[var(--app-color-status-danger)]">
          {(batchQ.error as Error)?.message ?? "加载失败"}
        </div>
      ) : group.layoutMode === "small_multiples" ? (
        <div className="space-y-3">
          {METRIC_ROWS.map((row) => {
            const metricVars = vars.filter((v) => metricRowForVariable(v, group, catalog).key === row.key);
            if (metricVars.length === 0) return null;
            return (
              <div key={row.key}>
                <div className="mb-1 text-[10px] font-semibold text-[var(--app-color-text-secondary)]">
                  {row.label}
                </div>
                <div className="space-y-2">
                  {metricVars.map((vn) => {
                    const series = seriesByVar.get(vn);
                    const label = labelFor(vn);
                    return (
                      <div key={vn}>
                        <button
                          type="button"
                          className="mb-0.5 max-w-full truncate text-left text-[10px] text-[var(--app-color-accent-primary)] hover:underline"
                          title={vn}
                          onClick={() => onSeriesClick?.(vn, label)}
                        >
                          {label}
                        </button>
                        <TelemetrySeriesChart
                          points={series?.points ?? []}
                          queriedFrom={series?.queriedFrom}
                          queriedTo={series?.queriedTo}
                          displayProfile={displayProfile}
                          metricKind={row.kind}
                          height={72}
                          stroke={row.color}
                          seriesLabel={label}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {vars.map((vn) => {
            const series = seriesByVar.get(vn);
            const label = labelFor(vn);
            const row = metricRowForVariable(vn, group, catalog);
            return (
              <div key={vn}>
                <button
                  type="button"
                  className="mb-0.5 text-[10px] text-[var(--app-color-accent-primary)] hover:underline"
                  title={vn}
                  onClick={() => onSeriesClick?.(vn, label)}
                >
                  {label}
                </button>
                <TelemetrySeriesChart
                  points={series?.points ?? []}
                  queriedFrom={series?.queriedFrom}
                  queriedTo={series?.queriedTo}
                  displayProfile={displayProfile}
                  metricKind={row.kind}
                  height={88}
                  seriesLabel={label}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
