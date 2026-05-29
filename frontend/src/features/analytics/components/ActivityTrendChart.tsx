import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { DailyTrendPoint } from "@/api/domains/analytics.api";

type Props = { data: DailyTrendPoint[]; loading?: boolean };

export function ActivityTrendChart({ data, loading }: Props) {
  if (loading) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">加载中…</div>;
  if (data.length === 0) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">暂无趋势数据</div>;

  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    entry: d.entryCount,
    exit: d.exitCount,
  }));

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(chartData.length / 10) - 1)} />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Bar dataKey="entry" name="进入" fill="#7c3aed" radius={[2, 2, 0, 0]} />
          <Bar dataKey="exit" name="离开" fill="#f59e0b" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
