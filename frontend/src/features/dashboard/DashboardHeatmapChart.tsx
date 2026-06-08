import { useMemo } from "react";
import type { HeatmapCell } from "@/api/domains/analytics.api";

const DAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HOUR_START = 7;
const HOUR_END = 20;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

type Props = { data: HeatmapCell[]; loading?: boolean; groupName?: string };

export function DashboardHeatmapChart({ data, loading, groupName }: Props) {
  // 仅保留 7:00–20:00
  const filtered = useMemo(
    () => data.filter((d) => d.hour >= HOUR_START && d.hour <= HOUR_END),
    [data],
  );

  const maxCount = useMemo(
    () => Math.max(1, ...filtered.map((d) => d.count)),
    [filtered],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
        加载热力数据…
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
        暂无热力数据
      </div>
    );
  }

  const cellStyle = (
    cell: HeatmapCell | undefined,
    _h: number,
  ): React.CSSProperties => {
    if (!cell || cell.count === 0) {
      return { textAlign: "center" as const, color: "#e5e7eb" };
    }
    const intensity = cell.count / maxCount;
    const alpha = Math.max(0.06, intensity);
    const isPeak = intensity >= 0.35;
    return {
      textAlign: "center" as const,
      backgroundColor: `rgba(124,58,237,${alpha})`,
      fontWeight: isPeak ? 700 : 400,
      color: isPeak ? "#fff" : undefined,
      boxShadow: isPeak
        ? `0 0 ${4 + intensity * 10}px rgba(124,58,237,${0.2 + intensity * 0.2})`
        : undefined,
      animation: isPeak ? "cellBreathe 2s ease-in-out infinite" : undefined,
      fontSize: 8,
    };
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden rounded-md border border-purple-100">
      {groupName && (
        <div className="shrink-0 px-2 py-0.5 text-[9px] font-semibold text-purple-600 bg-purple-50 border-b border-purple-100 text-center truncate">
          📌 {groupName}
        </div>
      )}
      <div className="flex-1 p-0.5">
      <table
        className="border-collapse text-[8px]"
        style={{ width: "100%", tableLayout: "fixed" }}
      >
        <colgroup>
          <col style={{ width: "10%" }} />
          {HOURS.map((h) => (
            <col key={h} style={{ width: `${90 / HOURS.length}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ background: "linear-gradient(180deg, #faf5ff, #f3e8ff)" }}>
            <th
              style={{
                padding: "1px 3px",
                color: "#7c3aed",
                fontWeight: 600,
                fontSize: 8,
              }}
            >
              📅
            </th>
            {HOURS.map((h) => (
              <th
                key={h}
                style={{
                  padding: "1px",
                  color: "#a78bfa",
                  fontWeight: 400,
                  fontSize: 8,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
            <tr key={dow}>
              <td
                style={{
                  padding: "1px 3px",
                  fontWeight: 600,
                  color: "#6d28d9",
                  background: "#faf5ff",
                  fontSize: 8,
                }}
              >
                {DAY_LABELS[dow]}
              </td>
              {HOURS.map((h) => {
                const cell = filtered.find(
                  (c) => c.dayOfWeek === dow && c.hour === h,
                );
                return (
                  <td
                    key={h}
                    style={cellStyle(cell, h)}
                    title={
                      cell
                        ? `${DAY_LABELS[dow]} ${h}:00 — ${cell.count} 次`
                        : undefined
                    }
                  >
                    {cell && cell.count > 0 ? cell.count : "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
