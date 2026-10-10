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
  /**
   * Y 轴**最小跨度** = 该指标合规区间跨度 × 本比例（默认 0 = 贴紧数据，与既有页面观感一致）。
   *
   * <p>为什么要有它：默认域是 `[最小−8%, 最大+8%]`，数据波动小时曲线会顶满整幅，
   * 几度的差异看起来像剧烈起伏。传 0.5 这类值把纵轴拉开，波动才显得平缓。
   */
  yMinSpanRatio?: number;
  /**
   * 给上下两条虚线（当天最小/最大）**标上数值**。默认关 —— 其它页面线条多，标了会挤；
   * 单日归档这种「就看这一条的波动」的场景标上更好读。
   */
  showExtremeLabels?: boolean;
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
  yMinSpanRatio,
  showExtremeLabels = false,
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
    // 纵轴最小跨度：比例取 0 时与改造前**逐字等价**（span 仍是 hi-lo、中点仍是 (lo+hi)/2，
    // 于是域仍是 [lo-pad, hi+pad]），所以既有页面观感不变。
    const span = Math.max(hi - lo, (band.max - band.min) * Math.max(0, yMinSpanRatio ?? 0));
    const mid = (lo + hi) / 2;
    const pad = Math.max(span * 0.08, 0.35);
    const half = span / 2 + pad;
    return { chartYMin: lo, chartYMax: hi, yAxisDomain: [mid - half, mid + half] as [number, number] };
  }, [chartData, displayProfile, metricKind, yMinSpanRatio]);

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
              fill="var(--app-color-feedback-success-soft, rgba(34,197,94,0.08))"
              strokeOpacity={0}
            />
          ) : null}
          {displayProfile === "STANDARD" && chartYMin != null ? (
            <ReferenceLine
              y={chartYMin}
              stroke="var(--app-color-border-strong)"
              strokeDasharray="4 3"
              label={
                showExtremeLabels
                  ? {
                      value: `最小 ${chartYMin.toFixed(1)}`,
                      position: "insideTopRight",
                      fontSize: 9,
                      /*
                       * 颜色写**具体色值**，不要写 CSS 变量：这是 SVG 的呈现属性，带 var(...) 时
                       * 屏幕上看没问题，但浏览器导出 PDF 会把这几段文字整段丢掉（实测：同一张图里
                       * 轴刻度在、这两行不在）。选的是原变量对应的中性灰。
                       */
                      fill: "#6b7280",
                    }
                  : undefined
              }
            />
          ) : null}
          {displayProfile === "STANDARD" && chartYMax != null ? (
            <ReferenceLine
              y={chartYMax}
              stroke="var(--app-color-border-strong)"
              strokeDasharray="4 3"
              label={
                showExtremeLabels
                  ? {
                      value: `最大 ${chartYMax.toFixed(1)}`,
                      position: "insideBottomRight",
                      fontSize: 9,
                      fill: "#6b7280",
                    }
                  : undefined
              }
            />
          ) : null}
          {aMin != null ? (
            /* 令牌名照实际存在的用：`--app-color-status-*` 在主题里**没有定义**，
               写了等于没写（stroke 取不到值 → 线画不出来、也不报错，静默消失）。 */
            <ReferenceLine y={aMin} stroke="var(--app-color-feedback-warning)" strokeDasharray="2 4" />
          ) : null}
          {aMax != null ? (
            <ReferenceLine y={aMax} stroke="var(--app-color-feedback-danger)" strokeDasharray="2 4" />
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
