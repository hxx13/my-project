import { useMemo } from "react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TelemetryArchiveSeriesPoint } from "@/api/telemetryApi";
import type { DisplayProfileMode } from "@/api/domains/telemetryInsights.api";
import { MeasuredChartBox } from "@/features/analytics/components/MeasuredChartBox";

const COMPLIANCE_BANDS = {
  temp: { min: 18, max: 26 },
  hum: { min: 40, max: 70 },
  pressure: { min: 0, max: 60 },
} as const;

export type TelemetrySeriesChartProps = {
  points: TelemetryArchiveSeriesPoint[];
  queriedFrom?: string | null;
  queriedTo?: string | null;
  displayProfile?: DisplayProfileMode;
  metricKind?: "temp" | "hum" | "pressure" | string;
  alarmMin?: number | null;
  alarmMax?: number | null;
  height?: number;
  seriesLabel?: string;
  stroke?: string;
};

function metricBand(metricKind?: string) {
  const mk = (metricKind || "").toUpperCase();
  if (mk.includes("HUM") || mk.includes("RH")) return COMPLIANCE_BANDS.hum;
  if (mk.includes("PRESS") || mk.includes("PA")) return COMPLIANCE_BANDS.pressure;
  return COMPLIANCE_BANDS.temp;
}

export function TelemetrySeriesChart({
  points,
  queriedFrom,
  queriedTo,
  displayProfile = "STANDARD",
  metricKind = "temp",
  alarmMin,
  alarmMax,
  height = 120,
  seriesLabel,
  stroke,
}: TelemetrySeriesChartProps) {
  const chartData = useMemo(() => {
    return (points ?? [])
      .map((p) => {
        const tMs = Date.parse(p.t);
        return { tMs, v: p.value ?? null, t: p.t };
      })
      .filter((row) => Number.isFinite(row.tMs));
  }, [points]);

  const xDomain = useMemo((): [number, number] | undefined => {
    if (!queriedFrom || !queriedTo) return undefined;
    const a = Date.parse(queriedFrom);
    const b = Date.parse(queriedTo);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
    return [Math.min(a, b), Math.max(a, b)];
  }, [queriedFrom, queriedTo]);

  const { yAxisDomain, chartYMin, chartYMax } = useMemo(() => {
    const band = metricBand(metricKind);
    if (displayProfile === "PRESENTATION") {
      return {
        yAxisDomain: [band.min, band.max] as [number, number],
        chartYMin: null as number | null,
        chartYMax: null as number | null,
      };
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of chartData) {
      const v = row.v;
      if (v != null && Number.isFinite(Number(v))) {
        const n = Number(v);
        lo = Math.min(lo, n);
        hi = Math.max(hi, n);
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      return { chartYMin: null, chartYMax: null, yAxisDomain: undefined as [number, number] | undefined };
    }
    const pad = Math.max((hi - lo) * 0.08, 0.35);
    return { chartYMin: lo, chartYMax: hi, yAxisDomain: [lo - pad, hi + pad] as [number, number] };
  }, [chartData, displayProfile, metricKind]);

  const lineColor = stroke ?? "var(--app-color-accent-primary, #d97706)";

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-[var(--app-color-text-muted)]"
        style={{ height }}
      >
        尚无归档点
      </div>
    );
  }

  const band = metricBand(metricKind);
  const aMin = alarmMin ?? band.min;
  const aMax = alarmMax ?? band.max;

  return (
    <MeasuredChartBox height={height}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 14 }}>
          <XAxis
            type="number"
            dataKey="tMs"
            domain={xDomain ?? ["dataMin", "dataMax"]}
            tick={{ fontSize: 9, fill: "var(--app-color-text-muted)" }}
            tickFormatter={(ms) =>
              new Date(ms).toLocaleString(undefined, {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            }
          />
          <YAxis hide domain={yAxisDomain ?? ["auto", "auto"]} />
          {displayProfile === "PRESENTATION" ? (
            <ReferenceArea
              y1={band.min}
              y2={band.max}
              fill="var(--app-color-status-success-subtle, rgba(34,197,94,0.08))"
              strokeOpacity={0}
            />
          ) : null}
          {displayProfile === "STANDARD" && chartYMin != null ? (
            <ReferenceLine y={chartYMin} stroke="var(--app-color-border-strong)" strokeDasharray="4 3" />
          ) : null}
          {displayProfile === "STANDARD" && chartYMax != null ? (
            <ReferenceLine y={chartYMax} stroke="var(--app-color-border-strong)" strokeDasharray="4 3" />
          ) : null}
          {aMin != null ? (
            <ReferenceLine y={aMin} stroke="var(--app-color-status-warning)" strokeDasharray="2 4" />
          ) : null}
          {aMax != null ? (
            <ReferenceLine y={aMax} stroke="var(--app-color-status-danger)" strokeDasharray="2 4" />
          ) : null}
          <Tooltip
            contentStyle={{
              fontSize: 11,
              background: "var(--app-color-surface-raised)",
              border: "1px solid var(--app-color-border-default)",
            }}
            formatter={(value: unknown) => [
              value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(1),
              seriesLabel ?? "值",
            ]}
            labelFormatter={(ms) =>
              typeof ms === "number" && Number.isFinite(ms)
                ? new Date(ms).toLocaleString()
                : String(ms)
            }
          />
          <Line
            type={displayProfile === "PRESENTATION" ? "monotone" : "linear"}
            dataKey="v"
            stroke={lineColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
    </MeasuredChartBox>
  );
}
