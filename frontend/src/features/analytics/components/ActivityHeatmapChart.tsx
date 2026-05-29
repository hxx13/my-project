import { useMemo } from "react";
import type { HeatmapCell } from "@/api/domains/analytics.api";

const DAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

type Props = { data: HeatmapCell[]; loading?: boolean };

export function ActivityHeatmapChart({ data, loading }: Props) {
  const maxCount = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);

  if (loading) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">加载中…</div>;
  if (data.length === 0) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">暂无热力数据</div>;

  return (
    <div className="h-[240px] w-full overflow-auto" style={{ scrollbarWidth: "thin" }}>
      <table className="border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white px-1 py-0.5 text-neutral-400">时\日</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="px-1 py-0.5 font-normal text-neutral-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
            <tr key={dow}>
              <td className="sticky left-0 bg-white px-1 py-0.5 font-medium text-neutral-500">{DAY_LABELS[dow]}</td>
              {Array.from({ length: 24 }, (_, h) => {
                const cell = data.find((c) => c.dayOfWeek === dow && c.hour === h);
                const intensity = cell ? cell.count / maxCount : 0;
                return (
                  <td
                    key={h}
                    className="px-1 py-0.5 text-center"
                    style={{
                      backgroundColor: intensity > 0
                        ? `rgba(124, 58, 237, ${Math.max(0.08, intensity)})`
                        : "transparent",
                    }}
                    title={cell ? `${DAY_LABELS[dow]} ${h}:00 — ${cell.count} 次` : undefined}
                  >
                    {cell ? cell.count : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
