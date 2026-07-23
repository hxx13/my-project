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
import type { CagePiRow, CageRoomRow, IsolationUsageQueryResult, ProjectGroupRow } from "@/api/domains/analytics.api";
import { MeasuredChartBox } from "@/features/analytics/components/MeasuredChartBox";

type Props = {
  report: IsolationUsageQueryResult;
  fromSnapshot?: boolean;
  periodLabel?: string;
};

function slotCount(row: { personTimes?: number; occupiedSlots?: number }) {
  return row.occupiedSlots ?? row.personTimes ?? 0;
}

function HorizontalBarCard({
  title,
  data,
  nameKey,
}: {
  title: string;
  data: { name: string; fullName: string; slots: number }[];
  nameKey: string;
}) {
  if (data.length === 0) return null;
  const height = Math.max(200, data.length * 28);
  return (
    <AdminFormCard title={title}>
      <MeasuredChartBox height={height}>
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: "#475569" }} />
          <Tooltip
            formatter={(value) => [Number(value ?? 0), "笼位"]}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { fullName?: string } | undefined;
              return p?.fullName ?? "";
            }}
          />
          <Bar dataKey="slots" fill="#7c6cf0" radius={[0, 4, 4, 0]} barSize={18} name={nameKey} />
        </BarChart>
      </MeasuredChartBox>
    </AdminFormCard>
  );
}

export function CageOccupancyReportLayout({ report, fromSnapshot, periodLabel }: Props) {
  const groups = report.byProjectGroup ?? [];
  const pis = report.byPi ?? [];
  const rooms = report.byRoom ?? [];

  const groupChart = groups.slice(0, 15).map((r) => ({
    name: r.groupName.length > 12 ? `${r.groupName.slice(0, 12)}…` : r.groupName,
    fullName: r.groupName,
    slots: slotCount(r),
  }));

  const piChart = pis.slice(0, 15).map((r) => ({
    name: r.piName.length > 10 ? `${r.piName.slice(0, 10)}…` : r.piName,
    fullName: r.piName,
    slots: slotCount(r),
  }));

  const summary = report.summary;

  return (
    <div className="space-y-4">
      {fromSnapshot ? (
        <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
          已读取历史快照 {periodLabel ? `· ${periodLabel}` : ""}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatChip label="占用笼位合计" value={summary?.totalOccupiedSlots ?? summary?.totalPersonTimes ?? 0} />
        <StatChip label="PI课题组数" value={summary?.uniquePis ?? pis.length} />
        <StatChip label="房间数" value={summary?.uniqueRooms ?? rooms.length} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <HorizontalBarCard title="课题组笼位 Top" data={groupChart} nameKey="课题组" />
        <HorizontalBarCard title="PI课题组笼位 Top" data={piChart} nameKey="PI课题组" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <GroupTable rows={groups} />
        <PiTable rows={pis} />
      </div>

      <RoomTable rows={rooms} />
      <RegionTable rows={report.byRegion ?? []} />
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-center">
      <p className="text-[10px] font-medium text-violet-700/80">{label}</p>
      <p className="mt-0.5 text-xl font-black tabular-nums text-violet-900">{value}</p>
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
              <th className="text-right">笼位</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.groupName}>
                <td className="max-w-[12rem] truncate font-medium" title={r.groupName}>
                  {r.groupName}
                </td>
                <td className="text-right tabular-nums font-semibold text-violet-700">{slotCount(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminFormCard>
  );
}

function PiTable({ rows }: { rows: CagePiRow[] }) {
  return (
    <AdminFormCard title="按 PI课题组">
      <AdminTableShell empty={rows.length === 0} emptyMessage="无数据" scrollable>
        <table className="admin-data-table w-full text-sm">
          <thead>
            <tr>
              <th>PI课题组</th>
              <th className="text-right">笼位</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.piName}>
                <td className="max-w-[12rem] truncate font-medium" title={r.piName}>
                  {r.piName}
                </td>
                <td className="text-right tabular-nums font-semibold text-violet-700">{slotCount(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminFormCard>
  );
}

function RoomTable({ rows }: { rows: CageRoomRow[] }) {
  return (
    <AdminFormCard title="按房间（笼位数量）">
      <AdminTableShell empty={rows.length === 0} emptyMessage="无数据" scrollable>
        <table className="admin-data-table w-full text-sm">
          <thead>
            <tr>
              <th>房间</th>
              <th>位置</th>
              <th className="text-right">笼位</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.location ?? ""}-${r.roomName}-${i}`}>
                <td className="font-medium">{r.roomName}</td>
                <td className="max-w-[16rem] truncate text-neutral-600" title={r.location}>
                  {r.location ?? "—"}
                </td>
                <td className="text-right tabular-nums font-semibold text-violet-700">{slotCount(r)}</td>
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
    <AdminFormCard title="按区域（汇总）">
      <AdminTableShell empty={rows.length === 0} emptyMessage="无数据" scrollable>
        <table className="admin-data-table w-full text-sm">
          <thead>
            <tr>
              <th>区域</th>
              <th className="text-right">笼位</th>
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
