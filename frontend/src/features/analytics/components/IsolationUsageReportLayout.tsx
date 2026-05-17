import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import type { IsolationUsageQueryResult, ProjectGroupRow } from "@/api/domains/analytics.api";
import { MeasuredChartBox } from "@/features/analytics/components/MeasuredChartBox";

type Props = {
  report: IsolationUsageQueryResult;
  fromSnapshot?: boolean;
  periodLabel?: string;
};

export function IsolationUsageReportLayout({ report, fromSnapshot, periodLabel }: Props) {
  const groups = report.byProjectGroup ?? [];
  const chartData = groups.slice(0, 20).map((r) => ({
    name: r.groupName.length > 14 ? `${r.groupName.slice(0, 14)}…` : r.groupName,
    fullName: r.groupName,
    personTimes: r.personTimes,
  }));
  const chartHeight = Math.max(220, chartData.length * 28);

  return (
    <div className="space-y-4">
      {fromSnapshot ? (
        <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
          已读取历史快照 {periodLabel ? `· ${periodLabel}` : ""}
        </p>
      ) : null}

      {chartData.length > 0 ? (
        <AdminFormCard title="课题组人次分布">
          <MeasuredChartBox height={chartHeight}>
              <BarChart layout="vertical" data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10, fill: "#475569" }}
                />
                <Tooltip
                  formatter={(value) => [Number(value ?? 0), "人次"]}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as { fullName?: string } | undefined;
                    return p?.fullName ?? "";
                  }}
                />
                <Bar dataKey="personTimes" fill="#7c6cf0" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
          </MeasuredChartBox>
        </AdminFormCard>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <GroupTable rows={groups} />
        <RegionTable rows={report.byRegion ?? []} />
      </div>
    </div>
  );
}

function GroupTable({ rows }: { rows: ProjectGroupRow[] }) {
  return (
    <AdminFormCard title="按课题组">
      <AdminTableShell empty={rows.length === 0} emptyMessage="无数据" scrollable>
        <table className="admin-data-table w-full text-sm">
          <thead>
            <tr>
              <th>课题组</th>
              <th className="text-right">人次</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.groupName}>
                <td className="max-w-[12rem] truncate font-medium" title={r.groupName}>
                  {r.groupName}
                </td>
                <td className="text-right tabular-nums font-semibold text-violet-700">{r.personTimes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminFormCard>
  );
}

function RegionTable({ rows }: { rows: { regionName: string; personTimes: number }[] }) {
  return (
    <AdminFormCard title="按区域">
      <AdminTableShell empty={rows.length === 0} emptyMessage="无数据" scrollable>
        <table className="admin-data-table w-full text-sm">
          <thead>
            <tr>
              <th>区域</th>
              <th className="text-right">人次</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.regionName}>
                <td>{r.regionName}</td>
                <td className="text-right tabular-nums font-semibold text-violet-700">{r.personTimes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminFormCard>
  );
}
