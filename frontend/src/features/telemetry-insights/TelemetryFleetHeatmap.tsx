import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import type { TelemetryFleetMatrixCell } from "@/api/domains/telemetryInsights.api";
import { tiDebug } from "@/features/telemetry-insights/telemetryInsightsDebug";

export type TelemetryFleetHeatmapProps = {
  cells: TelemetryFleetMatrixCell[];
  metricKindCode?: string;
  onCellClick?: (cell: TelemetryFleetMatrixCell) => void;
};

function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function statusColor(status?: string | null): string {
  switch ((status || "").toUpperCase()) {
    case "OK":
      return readCssVar("--app-color-status-success", "#16a34a");
    case "LOW":
      return readCssVar("--app-color-status-info", "#0284c7");
    case "HIGH":
      return readCssVar("--app-color-status-danger", "#dc2626");
    default:
      return readCssVar("--app-color-text-muted", "#71717a");
  }
}


function cellLabel(cell: TelemetryFleetMatrixCell): string {
  return cell.displayLabel?.trim() || cell.roomCanonical;
}

function buildFleetHeatmapOption(rows: TelemetryFleetMatrixCell[]): EChartsOption {
  const textMuted = readCssVar("--app-color-text-muted", "#71717a");
  const textPrimary = readCssVar("--app-color-text-primary", "#18181b");
  const surfacePage = readCssVar("--app-color-surface-page", "#fffbf5");
  const borderDefault = readCssVar("--app-color-border-default", "#e7e5e4");

  const xLabels = rows.map((cell) => {
    const label = cellLabel(cell);
    const parts = label.split("-").filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1]! : label;
  });

  return {
    animation: false,
    grid: { left: 4, right: 4, top: 8, bottom: rows.length > 12 ? 52 : 36, containLabel: false },
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: readCssVar("--app-color-surface-raised", "#ffffff"),
      borderColor: borderDefault,
      textStyle: { color: textPrimary, fontSize: 11 },
      formatter: (params: unknown) => {
        const p = params as { dataIndex?: number };
        const idx = p.dataIndex ?? -1;
        const cell = rows[idx];
        if (!cell) return "";
        const val = cell.latestValue;
        return [
          cellLabel(cell),
          cell.roomCanonical !== cellLabel(cell) ? cell.roomCanonical : "",
          cell.variableName ? `变量：${cell.variableName}` : "",
          `最新值：${val != null && Number.isFinite(val) ? val.toFixed(1) : "—"}`,
          `合规：${cell.complianceStatus ?? "?"}`,
        ]
          .filter(Boolean)
          .join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: xLabels,
      axisLine: { lineStyle: { color: borderDefault } },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 9,
        color: textMuted,
        rotate: rows.length > 10 ? 45 : 0,
        interval: 0,
      },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: [""],
      show: false,
    },
    dataZoom:
      rows.length > 16
        ? [
            {
              type: "slider",
              xAxisIndex: 0,
              height: 14,
              bottom: 4,
              borderColor: borderDefault,
              fillerColor: readCssVar("--app-color-accent-primary-subtle", "rgba(217,119,6,0.12)"),
              handleSize: "60%",
            },
          ]
        : undefined,
    visualMap: {
      show: false,
      min: 0,
      max: 1,
      inRange: { color: [surfacePage] },
    },
    series: [
      {
        type: "heatmap",
        data: rows.map((cell, i) => ({
          value: [i, 0, cell.latestValue ?? 0],
          itemStyle: {
            color: statusColor(cell.complianceStatus),
            opacity: 0.82,
            borderColor: borderDefault,
            borderWidth: 1,
          },
          emphasis: {
            itemStyle: {
              borderColor: readCssVar("--app-color-border-strong", "#a8a29e"),
              borderWidth: 2,
              shadowBlur: 6,
              shadowColor: "rgba(0,0,0,0.12)",
            },
          },
          label: {
            show: true,
            formatter: () => {
              const val = cell.latestValue;
              return val != null && Number.isFinite(val) ? val.toFixed(1) : "—";
            },
            fontSize: 10,
            fontWeight: 600,
            color: textPrimary,
          },
        })),
        itemStyle: { borderRadius: 4 },
      },
    ],
  };
}

export function TelemetryFleetHeatmap({ cells, onCellClick }: TelemetryFleetHeatmapProps) {
  const rows = useMemo(() => {
    const byRoom = new Map<string, TelemetryFleetMatrixCell>();
    for (const c of cells) {
      byRoom.set(c.roomCanonical, c);
    }
    return [...byRoom.values()].sort((a, b) => a.roomCanonical.localeCompare(b.roomCanonical, "zh-CN"));
  }, [cells]);

  const option = useMemo(() => buildFleetHeatmapOption(rows), [rows]);

  const chartHeight = Math.max(96, Math.min(180, 72 + Math.ceil(rows.length / 16) * 24));

  const onEvents = useMemo(
    () => ({
      click: (params: { dataIndex?: number }) => {
        const idx = params.dataIndex ?? -1;
        const cell = rows[idx];
        if (cell) {
          tiDebug("heatmap chart click", { index: idx, room: cell.roomCanonical });
          onCellClick?.(cell);
        }
      },
    }),
    [rows, onCellClick]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-6 text-sm text-[var(--app-color-text-muted)]">
        所选时间窗内暂无房间归档数据。请确认 WinCC 归档已写入且时间范围有效。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3">
      <ReactECharts
        option={option}
        style={{ height: chartHeight, width: "100%", minWidth: Math.max(320, rows.length * 52) }}
        opts={{ renderer: "canvas" }}
        notMerge
        lazyUpdate
        onEvents={onEvents}
      />
    </div>
  );
}
