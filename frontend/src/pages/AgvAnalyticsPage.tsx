import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgvAnalytics } from "@/api/domains/agv.api";
import { Link } from "react-router-dom";
import { ArrowLeft, Gauge, TrendingUp, Timer, BatteryFull, AlertTriangle, Route, MapPin, Clock, Package, Zap } from "lucide-react";

const ROBOTS = [
  { ip: "172.22.159.16", label: "AGV-1", color: "#3b82f6" },
  { ip: "172.22.159.18", label: "AGV-2", color: "#22c55e" },
  { ip: "172.22.159.20", label: "AGV-3", color: "#f59e0b" },
  { ip: "172.22.159.22", label: "AGV-4", color: "#8b5cf6" },
];

const TIME_PRESETS = [
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
];

// ── 时间分配颜色 ──
const TIME_COLORS: Record<string, string> = {
  "运输": "#3b82f6",
  "充电": "#22c55e",
  "站点停靠": "#f59e0b",
  "寻路": "#60a5fa",
  "其他": "#9ca3af",
};

function OverviewCard({ icon, label, value, unit, sub }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
      <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{label}</div>
        <div className="text-lg font-bold tabular-nums text-[var(--app-color-text-primary)]">
          {value}{unit && <span className="text-[11px] font-normal text-[var(--app-color-text-tertiary)] ml-1">{unit}</span>}
        </div>
        {sub && <div className="text-[9px] text-[var(--app-color-text-tertiary)] truncate">{sub}</div>}
      </div>
    </div>
  );
}

function formatSec(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  if (totalSec < 3600) return `${Math.floor(totalSec / 60)}m`;
  return `${(totalSec / 3600).toFixed(1)}h`;
}

export default function AgvAnalyticsPage() {
  const [tab, setTab] = useState(0);
  const [presetIdx, setPresetIdx] = useState(1); // default: 24h
  const robot = ROBOTS[tab];
  const preset = TIME_PRESETS[presetIdx];

  const { from, to } = useMemo(() => {
    const now = new Date();
    return {
      to: now.toISOString(),
      from: new Date(now.getTime() - preset.hours * 3600_000).toISOString(),
    };
  }, [preset.hours]);

  const { data, isLoading } = useQuery({
    queryKey: ["agvAnalytics", robot.ip, from, to],
    queryFn: () => fetchAgvAnalytics(robot.ip, from, to),
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col bg-[var(--app-color-surface-page)] -my-6 sm:-my-8">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        <Link to="/admin/agv-tracker" className="p-1 text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]"><ArrowLeft size={16} /></Link>
        <h1 className="text-sm font-semibold text-[var(--app-color-text-primary)]">{robot.label} 数据分析</h1>
        <span className="text-[10px] text-[var(--app-color-text-tertiary)] flex items-center gap-1">
          <Clock size={10} />最近{preset.label}
        </span>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex items-center justify-between border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        <div className="flex">
          {ROBOTS.map((r, i) => (
            <button key={r.ip} onClick={() => setTab(i)}
              className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${i === tab ? "border-[var(--app-color-accent)] text-[var(--app-color-accent)]" : "border-transparent text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 pr-2">
          {TIME_PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => setPresetIdx(i)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                i === presetIdx
                  ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]"
                  : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="text-xs text-[var(--app-color-text-tertiary)] py-8 text-center">加载中...</div>
        ) : !data ? (
          <div className="text-xs text-[var(--app-color-text-tertiary)] py-8 text-center">该时间范围内无数据</div>
        ) : (
          <>
            {/* ── ① 任务概览 ── */}
            <div>
              <h3 className="text-[11px] font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1">
                <Zap size={13} className="text-[var(--app-color-accent)]" />任务概览
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <OverviewCard icon={<Package size={16} />} label="运输趟次"
                  value={String(data.overview.transportTrips ?? "—")} unit="趟" />
                <OverviewCard icon={<Route size={16} />} label="总里程"
                  value={String(data.overview.totalDistanceKm ?? "—")} unit="km" />
                <OverviewCard icon={<Timer size={16} />} label="活跃时长"
                  value={String(data.overview.totalTimeHr ?? "—")} unit="h" />
                <OverviewCard icon={<Gauge size={16} />} label="平均速度"
                  value={String(data.overview.avgSpeedMps ?? "—")} unit="m/s" />
                <OverviewCard icon={<BatteryFull size={16} />} label="电量均值"
                  value={String(data.overview.avgBattery != null ? (data.overview.avgBattery * 100).toFixed(0) : "—")} unit="%" />
                <OverviewCard icon={<TrendingUp size={16} />} label="移动占比"
                  value={String(data.overview.utilization ?? "—")} unit="%"
                  sub={data.overview.totalSamples != null ? `${data.overview.totalSamples} 采样` : undefined} />
              </div>
            </div>

            {/* ── ② 时间分配 ── */}
            {data.timeDistribution && data.timeDistribution.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1">
                  <Clock size={13} className="text-[var(--app-color-accent)]" />时间分配
                </h3>
                <div className="space-y-1.5">
                  {data.timeDistribution.map((item) => {
                    const pct = item.percent;
                    if (pct < 0.5) return null; // skip negligible
                    return (
                      <div key={item.category} className="flex items-center gap-2">
                        <span className="text-[10px] w-14 shrink-0 text-[var(--app-color-text-secondary)]">{item.category}</span>
                        <div className="flex-1 h-5 rounded-full bg-[var(--app-color-border-default)] overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                            style={{
                              width: `${Math.max(pct, 2)}%`,
                              backgroundColor: TIME_COLORS[item.category] || "#6b7280",
                            }}>
                            {pct >= 8 && (
                              <span className="text-[9px] font-bold text-white tabular-nums">{pct}%</span>
                            )}
                          </div>
                        </div>
                        <span className="text-[9px] w-10 text-right tabular-nums text-[var(--app-color-text-tertiary)]">{formatSec(item.totalSec)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── ③ 站点排行 ── */}
            {data.stationRanking && data.stationRanking.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1">
                  <MapPin size={13} className="text-[var(--app-color-accent)]" />站点停留排行
                </h3>
                <div className="rounded border border-[var(--app-color-border-default)] overflow-hidden">
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr className="bg-[var(--app-color-surface-container)] text-[var(--app-color-text-tertiary)]">
                        <th className="text-left px-3 py-1.5 font-normal">站点</th>
                        <th className="text-right px-3 py-1.5 font-normal">到访</th>
                        <th className="text-right px-3 py-1.5 font-normal">总停留</th>
                        <th className="text-right px-3 py-1.5 font-normal">均停留</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stationRanking.map((s, i) => (
                        <tr key={s.station} className={`border-t border-[var(--app-color-border-default)] ${i % 2 === 0 ? "bg-[var(--app-color-surface-container)]" : ""}`}>
                          <td className="px-3 py-1.5 font-medium text-[var(--app-color-text-primary)]">
                            {s.stationName || s.station}
                            {s.stationName && <span className="text-[9px] text-[var(--app-color-text-tertiary)] ml-1">{s.station}</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-[var(--app-color-text-secondary)]">{s.count}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-[var(--app-color-text-secondary)]">{formatSec(s.totalSec)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-[var(--app-color-text-secondary)]">{s.avgSec}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── ④ 异常汇总 ── */}
            <div>
              <h3 className="text-[11px] font-semibold text-[var(--app-color-text-primary)] mb-2 flex items-center gap-1">
                <AlertTriangle size={13} className="text-[var(--app-color-accent)]" />异常汇总
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "急停", count: data.anomalies.emergencyCount, color: "#ef4444" },
                  { label: "阻挡", count: data.anomalies.blockedCount, color: "#f97316" },
                  { label: "定位异常", count: data.anomalies.relocCount, color: "#eab308" },
                  { label: "合计", count: data.anomalies.totalAnomalies, color: "#6b7280" },
                ].map(item => (
                  <div key={item.label}
                    className="flex flex-col items-center gap-1 px-3 py-3 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
                    <span className="text-2xl font-black tabular-nums" style={{ color: item.count > 0 ? item.color : "var(--app-color-text-tertiary)" }}>
                      {item.count}
                    </span>
                    <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{item.label}</span>
                  </div>
                ))}
              </div>
              {data.anomalies.totalAnomalies === 0 && (
                <p className="text-[10px] text-green-600 mt-1.5">✅ 该时段无异常事件</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
