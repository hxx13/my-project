import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgvAnalytics } from "@/api/domains/agv.api";
import { Link } from "react-router-dom";
import { ArrowLeft, Gauge, Zap, Timer, MapPin, GitBranch, BarChart3, Activity, TrendingUp } from "lucide-react";

const ROBOTS = [
  { ip: "172.22.159.16", label: "AGV-1", color: "#3b82f6" },
  { ip: "172.22.159.18", label: "AGV-2", color: "#22c55e" },
  { ip: "172.22.159.20", label: "AGV-3", color: "#f59e0b" },
  { ip: "172.22.159.22", label: "AGV-4", color: "#8b5cf6" },
];

const MetricCard = ({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit?: string }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
    <div className="text-[var(--app-color-accent)]">{icon}</div>
    <div>
      <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{label}</div>
      <div className="text-sm font-bold tabular-nums text-[var(--app-color-text-primary)]">
        {value}{unit && <span className="text-[10px] font-normal text-[var(--app-color-text-tertiary)] ml-0.5">{unit}</span>}
      </div>
    </div>
  </div>
);

export default function AgvAnalyticsPage() {
  const [tab, setTab] = useState(0);
  const robot = ROBOTS[tab];
  const now = new Date().toISOString();
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["agvAnalytics", robot.ip],
    queryFn: () => fetchAgvAnalytics(robot.ip, hourAgo, now),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col h-full bg-[var(--app-color-surface-page)] -my-6 sm:-my-8">
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        <Link to="/admin/agv-tracker" className="p-1 text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]"><ArrowLeft size={16} /></Link>
        <h1 className="text-sm font-semibold text-[var(--app-color-text-primary)]">AGV 数据分析</h1>
        <span className="text-[10px] text-[var(--app-color-text-tertiary)]">最近1小时 · 后端计算</span>
      </div>

      <div className="shrink-0 flex border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        {ROBOTS.map((r, i) => (
          <button key={r.ip} onClick={() => setTab(i)}
            className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${i === tab ? "border-[var(--app-color-accent)] text-[var(--app-color-accent)]" : "border-transparent text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]"}`}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {isLoading ? <div className="text-xs text-[var(--app-color-text-tertiary)]">加载中...</div>
        : !data ? <div className="text-xs text-[var(--app-color-text-tertiary)]">无数据</div> : (
          <>
            {/* Overview */}
            <div className="grid grid-cols-3 gap-2">
              <MetricCard icon={<Gauge size={16} />} label="平均速度" value={String(data.overview.avgSpeedMps ?? "—")} unit="m/s" />
              <MetricCard icon={<TrendingUp size={16} />} label="总里程" value={String(data.overview.totalDistanceKm ?? "—")} unit="km" />
              <MetricCard icon={<Timer size={16} />} label="时间跨度" value={String(data.overview.totalTimeHr ?? "—")} unit="h" />
              <MetricCard icon={<Activity size={16} />} label="利用率" value={String(data.overview.utilization ?? "—")} unit="%" />
              <MetricCard icon={<GitBranch size={16} />} label="路径效率" value={String(data.overview.pathEfficiency ?? "—")} unit="%" />
              <MetricCard icon={<Zap size={16} />} label="总采样" value={String(data.overview.totalSamples ?? "—")} unit="条" />
            </div>

            {/* Speed histogram */}
            {data.speedHistogram && data.speedHistogram.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1"><BarChart3 size={13} /> 速度分布 (m/s)</h3>
                <div className="flex items-end gap-1 h-20">
                  {data.speedHistogram.map((b) => {
                    const maxC = Math.max(...data.speedHistogram.map(h => h.count), 1);
                    return (
                    <div key={b.label} className="flex-1 flex flex-col items-center gap-0.5">
                      <span className="text-[9px] tabular-nums text-[var(--app-color-text-secondary)]">{b.count}</span>
                      <div className="w-full rounded-t" style={{ height: `${(b.count / maxC) * 60}px`, backgroundColor: robot.color, opacity: 0.3 + 0.7 * (b.count / maxC) }} />
                      <span className="text-[8px] text-[var(--app-color-text-tertiary)]">{b.label}</span>
                    </div>
                  )})}
                </div>
              </div>
            )}

            {/* Station ranking */}
            {data.stationRanking && data.stationRanking.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1"><MapPin size={13} /> 站点停留时长</h3>
                <table className="w-full text-[10px] border-collapse">
                  <thead><tr className="border-b border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)]">{["站点","到访","总停留","均停"].map(h => <th key={h} className="text-left px-2 py-1 font-normal">{h}</th>)}</tr></thead>
                  <tbody>
                    {data.stationRanking.slice(0, 15).map(s => (
                      <tr key={s.station} className="border-b border-[var(--app-color-border-default)]">
                        <td className="px-2 py-1 font-medium">{s.station}</td>
                        <td className="px-2 py-1 tabular-nums">{s.count}</td>
                        <td className="px-2 py-1 tabular-nums">{s.totalSec >= 60 ? `${Math.floor(s.totalSec/60)}m${s.totalSec%60}s` : `${s.totalSec}s`}</td>
                        <td className="px-2 py-1 tabular-nums">{s.avgSec}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Station hops */}
            {data.stationHops && data.stationHops.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1"><GitBranch size={13} /> 站间移动</h3>
                <table className="w-full text-[10px] border-collapse">
                  <thead><tr className="border-b border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)]">{["起","止","耗时","距离"].map(h => <th key={h} className="text-left px-2 py-1 font-normal">{h}</th>)}</tr></thead>
                  <tbody>
                    {data.stationHops.slice(0, 30).map((h, i) => (
                      <tr key={i} className="border-b border-[var(--app-color-border-default)]">
                        <td className="px-2 py-1">{h.from}</td><td className="px-2 py-1">{h.to}</td>
                        <td className="px-2 py-1 tabular-nums">{h.durationSec}s</td>
                        <td className="px-2 py-1 tabular-nums">{h.distance}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Accel events */}
            {data.accelEvents && data.accelEvents.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1"><Activity size={13} /> 加速度事件 ({" > "}0.5 m/s²) · {data.accelEvents.length}次</h3>
                <div className="flex flex-wrap gap-1">
                  {data.accelEvents.slice(-30).map((e, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${e.type === "急加速" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {new Date(e.ts).toLocaleTimeString()} {e.type} {e.mps2}m/s²
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
