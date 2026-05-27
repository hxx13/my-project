import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendChartMeta } from "@/features/analytics/periodTrendChartData";
import { trendStaffFill, trendStudentFill } from "@/features/analytics/periodTrendChartData";
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
    studentFill: trendStudentFill(p.studentCount > 0 || p.personTimes > 0),
    staffFill: trendStaffFill(p.staffCount > 0 || p.personTimes > 0),
  }));

  const height = cycle === "day" ? Math.max(220, Math.min(320, 28 + points.length * 6)) : 260;
  const denseDay = cycle === "day" && data.length > 16;

  return (
    <div className="rounded-xl border border-violet-200/80 bg-gradient-to-b from-violet-50/40 to-white p-3">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-neutral-900">{meta.title}</p>
          {meta.subtitle ? <p className="text-[11px] text-neutral-500">{meta.subtitle}</p> : null}
        </div>
        <TrendLegend />
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
                value: "条",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 10, fill: "#94a3b8" },
              }}
            />
            <Tooltip content={<TrendTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="studentCount" name="学生" stackId="sets" fill="#6366f1" radius={[0, 0, 0, 0]} maxBarSize={cycle === "day" ? 14 : 36} />
            <Bar dataKey="staffCount" name="工作人员" stackId="sets" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={cycle === "day" ? 14 : 36} />
          </BarChart>
        </MeasuredChartBox>
      )}
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload?: { personTimes?: number; studentCount?: number; staffCount?: number } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  const total = p?.personTimes ?? 0;
  const student = p?.studentCount ?? 0;
  const staff = p?.staffCount ?? 0;
  return (
    <div className="rounded-lg border bg-white px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-semibold text-neutral-800">{label}</p>
      <p className="text-neutral-600">
        合计 <strong>{total}</strong> 条
      </p>
      <p className="text-indigo-700">学生 {student}</p>
      <p className="text-slate-600">工作人员 {staff}</p>
    </div>
  );
}

function TrendLegend() {
  return (
    <div className="flex gap-3 text-[10px] text-neutral-600">
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
        学生
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />
        工作人员
      </span>
    </div>
  );
}
