import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { RoomUsageItem } from "@/api/domains/analytics.api";

const ROOM_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899",
  "#f97316", "#14b8a6", "#ef4444", "#3b82f6", "#a855f7", "#22c55e",
];

type Props = { data: RoomUsageItem[]; loading?: boolean };

export function ActivityRoomChart({ data, loading }: Props) {
  if (loading) return (
    <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">加载中…</div>
  );
  if (data.length === 0) return (
    <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">暂无房间数据</div>
  );

  const chartData = data.slice(0, 20);

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="roomName" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
          <Bar dataKey="entryCount" name="进出次数" maxBarSize={32} radius={[4, 4, 0, 0]}>
            {chartData.map((_, idx) => (
              <Cell key={idx} fill={ROOM_COLORS[idx % ROOM_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
