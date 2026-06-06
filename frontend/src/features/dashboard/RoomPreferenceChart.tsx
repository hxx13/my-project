import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { RoomUsageItem } from "@/api/domains/analytics.api";

const BAR_COLORS: [string, string][] = [
  ["#ec4899", "#f472b6"], // pink — 1st
  ["#6366f1", "#818cf8"], // indigo — 2nd
  ["#06b6d4", "#22d3ee"], // cyan — 3rd
  ["#f59e0b", "#fbbf24"], // amber — 4th
  ["#22c55e", "#4ade80"], // green — 5th
];

type Props = { data: RoomUsageItem[]; loading?: boolean };

export function RoomPreferenceChart({ data, loading }: Props) {
  const sorted = useMemo(
    () =>
      [...data].sort((a, b) => b.entryCount - a.entryCount).slice(0, 5),
    [data],
  );

  const option = useMemo(() => {
    if (sorted.length === 0) return {};

    const names = sorted.map((r) => r.roomName);
    const values = sorted.map((r) => r.entryCount);

    return {
      grid: { left: "18%", right: "12%", top: 5, bottom: 5 },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        formatter: (params: { name: string; value: number }[]) =>
          `${params[0].name}<br/>本周进出: <b>${params[0].value} 次</b>`,
      },
      xAxis: {
        type: "value" as const,
        show: false,
        max: Math.max(...values) * 1.15,
      },
      yAxis: {
        type: "category" as const,
        data: names,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#475569", fontSize: 10, fontWeight: 600 },
        inverse: true,
      },
      series: [
        {
          type: "bar",
          data: values.map((v, i) => ({
            value: v,
            itemStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: BAR_COLORS[i]?.[0] ?? "#a78bfa" },
                  { offset: 1, color: BAR_COLORS[i]?.[1] ?? "#c4b5fd" },
                ],
              },
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: 12,
          label: {
            show: true,
            position: "right",
            color: "#475569",
            fontSize: 9,
            fontWeight: 700,
            formatter: "{c} 次",
          },
          animationEasing: "elasticOut" as const,
          animationDelay: (idx: number) => idx * 80,
        },
      ],
    };
  }, [sorted]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
        加载房间数据…
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
        暂无房间偏好数据
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ width: "100%", height: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
