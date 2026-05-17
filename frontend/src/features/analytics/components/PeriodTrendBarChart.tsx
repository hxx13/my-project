import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendChartMeta } from "@/features/analytics/periodTrendChartData";
import { trendBarFill } from "@/features/analytics/periodTrendChartData";
import type { AnalyticsCompareCycle } from "@/features/analytics/analyticsPipelineFilter";
import { MeasuredChartBox } from "@/features/analytics/components/MeasuredChartBox";

type Props = {
  cycle: AnalyticsCompareCycle;
  meta: TrendChartMeta;
};

export function PeriodTrendBarChart({ cycle, meta }: Props) {
  const points = meta?.points ?? [];
  const data = points.map((p) => ({
    ...p,
    fill: trendBarFill(p.highlight, p.personTimes > 0 || p.highlight !== "none"),
  }));

  const height = cycle === "day" ? Math.max(220, Math.min(320, 28 + points.length * 6)) : 240;
  const denseDay = cycle === "day" && data.length > 16;

  return (
    <div className="rounded-xl border border-violet-200/80 bg-gradient-to-b from-violet-50/40 to-white p-3">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-neutral-900">{meta.title}</p>
          <p className="text-[11px] text-neutral-500">{meta.subtitle}</p>
        </div>
        <TrendLegend cycle={cycle} />
      </div>

      {data.length === 0 ? (
        <p className="py-12 text-center text-xs text-neutral-400">暂无历史清算数据，无法绘制趋势</p>
      ) : (
        <MeasuredChartBox height={height}>
            <BarChart data={data} margin={{ top: 12, right: 8, left: 4, bottom: denseDay ? 8 : 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="axisLabel"
                tick={{ fontSize: cycle === "day" ? 9 : 10, fill: "#64748b" }}
                interval={cycle === "day" && data.length > 20 ? 1 : 0}
                angle={denseDay ? -35 : 0}
                textAnchor={denseDay ? "end" : "middle"}
                height={denseDay ? 48 : 24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                allowDecimals={false}
                width={40}
                label={{
                  value: "人次",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 10, fill: "#94a3b8" },
                }}
              />
              <Tooltip content={<TrendTooltip />} />
              <Bar dataKey="personTimes" radius={[4, 4, 0, 0]} maxBarSize={cycle === "day" ? 14 : 36}>
                {data.map((entry, i) => (
                  <Cell key={entry.periodKey ?? i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
        </MeasuredChartBox>
      )}
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { periodKey: string; personTimes: number; deltaRounds?: number } }[];
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-neutral-800">{p.periodKey}</p>
      <p className="mt-1 tabular-nums text-violet-700">本期 {p.personTimes} 人次</p>
      {p.deltaRounds != null ? (
        <p className={p.deltaRounds > 0 ? "text-emerald-600" : p.deltaRounds < 0 ? "text-rose-600" : "text-neutral-500"}>
          较上期 {p.deltaRounds > 0 ? "+" : ""}
          {p.deltaRounds}
        </p>
      ) : null}
    </div>
  );
}

function TrendLegend({ cycle }: { cycle: AnalyticsCompareCycle }) {
  if (cycle === "day") {
    return (
      <div className="flex flex-wrap gap-2 text-[10px] text-neutral-600">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" /> 昨日
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-amber-500" /> 前日
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-indigo-300" /> 其他日
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-neutral-600">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm bg-violet-600" /> 最近一期
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm bg-slate-400" /> 上一期
      </span>
    </div>
  );
}
