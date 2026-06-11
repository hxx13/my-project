import { useMemo } from "react";
import type { HeatmapCell } from "@/api/domains/analytics.api";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_COL_PCT = 10;
const HOUR_COL_PCT = (100 - DAY_COL_PCT) / HOURS.length;

type Props = { data: HeatmapCell[]; loading?: boolean; className?: string };

export function ActivityHeatmapChart({ data, loading, className }: Props) {
  const maxCount = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);

  const shell = cn(
    "flex h-[240px] w-full min-w-0 flex-col overflow-hidden",
    className,
  );

  if (loading) {
    return (
      <div className={cn(shell, "items-center justify-center text-sm text-neutral-400")}>
        加载中…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn(shell, "items-center justify-center text-sm text-neutral-400")}>
        暂无热力数据
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex min-h-0 flex-1 w-full overflow-hidden rounded-md border border-neutral-100">
        <table
          className="border-collapse leading-tight"
          style={{ width: "100%", height: "100%", tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: `${DAY_COL_PCT}%` }} />
            {HOURS.map((h) => (
              <col key={h} style={{ width: `${HOUR_COL_PCT}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-neutral-50">
              <th
                className="truncate p-0.5 text-left text-[8px] font-semibold text-neutral-500"
                style={{ fontSize: 8 }}
              >
                时\日
              </th>
              {HOURS.map((h) => (
                <th
                  key={h}
                  className="truncate p-0 text-center font-normal text-neutral-400"
                  style={{ fontSize: 7 }}
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
                  className="truncate bg-neutral-50 p-0.5 font-medium text-neutral-600"
                  style={{ fontSize: 8 }}
                >
                  {DAY_LABELS[dow]}
                </td>
                {HOURS.map((h) => {
                  const cell = data.find((c) => c.dayOfWeek === dow && c.hour === h);
                  const intensity = cell ? cell.count / maxCount : 0;
                  const isPeak = intensity >= 0.35;
                  return (
                    <td
                      key={h}
                      className="truncate p-0 text-center"
                      style={{
                        fontSize: 7,
                        backgroundColor:
                          intensity > 0
                            ? `rgba(124, 58, 237, ${Math.max(0.08, intensity)})`
                            : "transparent",
                        fontWeight: isPeak ? 700 : 400,
                        color: isPeak ? "#fff" : undefined,
                      }}
                      title={cell ? `${DAY_LABELS[dow]} ${h}:00 — ${cell.count} 次` : undefined}
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
