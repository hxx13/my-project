import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgvTrajectory, type AgvTrajectoryRow } from "@/api/domains/agv.api";
import { X } from "lucide-react";

const TABS = [
  { ip: "172.22.159.16", label: ".16" },
  { ip: "172.22.159.18", label: ".18" },
  { ip: "172.22.159.20", label: ".20" },
  { ip: "172.22.159.22", label: ".22" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

function LogTable({ ip }: { ip: string }) {
  const now = useMemo(() => new Date().toISOString(), []);
  const oneHourAgo = useMemo(() => new Date(Date.now() - 3600000).toISOString(), []);

  const { data, isLoading } = useQuery({
    queryKey: ["agvTrajectory", ip],
    queryFn: () => fetchAgvTrajectory(ip, oneHourAgo, now, 500),
    enabled: true,
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return <div className="p-4 text-xs text-[var(--app-color-text-tertiary)]">加载中...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="p-4 text-xs text-[var(--app-color-text-tertiary)]">暂无数据</div>;
  }

  return (
    <div className="overflow-auto max-h-full">
      <table className="w-full text-[11px] border-collapse">
        <thead className="sticky top-0 bg-[var(--app-color-surface-container)]">
          <tr className="border-b border-[var(--app-color-border-default)]">
            <th className="text-left p-1.5 text-[var(--app-color-text-tertiary)] font-normal">时间</th>
            <th className="text-right p-1.5 text-[var(--app-color-text-tertiary)] font-normal">x</th>
            <th className="text-right p-1.5 text-[var(--app-color-text-tertiary)] font-normal">y</th>
            <th className="text-right p-1.5 text-[var(--app-color-text-tertiary)] font-normal">电量</th>
            <th className="text-left p-1.5 text-[var(--app-color-text-tertiary)] font-normal">站点</th>
            <th className="text-left p-1.5 text-[var(--app-color-text-tertiary)] font-normal">地图</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row: AgvTrajectoryRow) => (
            <tr key={row.id} className="border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]">
              <td className="p-1.5 text-[var(--app-color-text-primary)] tabular-nums">
                {new Date(row.recorded_at).toLocaleTimeString()}
              </td>
              <td className="p-1.5 text-right text-[var(--app-color-text-secondary)] tabular-nums">
                {row.x?.toFixed(2)}
              </td>
              <td className="p-1.5 text-right text-[var(--app-color-text-secondary)] tabular-nums">
                {row.y?.toFixed(2)}
              </td>
              <td className="p-1.5 text-right tabular-nums" style={{ color: row.battery != null && row.battery < 0.2 ? "#ef4444" : undefined }}>
                {row.battery != null ? Math.round(row.battery * 100) + "%" : "-"}
              </td>
              <td className="p-1.5 text-[var(--app-color-text-secondary)]">{row.station ?? "-"}</td>
              <td className="p-1.5 text-[var(--app-color-text-secondary)]">{row.map_name ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AgvLogDrawer({ open, onClose }: Props) {
  const [tab, setTab] = useState(0);

  if (!open) return null;

  return (
    <div
      className="fixed top-0 right-0 h-full w-96 bg-[var(--app-color-surface-container)] border-l border-[var(--app-color-border-default)] shadow-lg flex flex-col"
      style={{ zIndex: 600 }}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[var(--app-color-border-default)]">
        <span className="text-xs font-medium text-[var(--app-color-text-primary)]">轨迹日志</span>
        <button onClick={onClose} className="p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-[var(--app-color-border-default)]">
        {TABS.map((t, i) => (
          <button
            key={t.ip}
            onClick={() => setTab(i)}
            className={`flex-1 py-1.5 text-[11px] border-b-2 transition-colors ${
              i === tab
                ? "border-[var(--app-color-accent)] text-[var(--app-color-accent)]"
                : "border-transparent text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <LogTable ip={TABS[tab].ip} />
      </div>
    </div>
  );
}
