import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgvTrajectory, type AgvTrajectoryRow } from "@/api/domains/agv.api";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";

const TABS = AGV_ROBOTS.map(r => ({ ip: r.ip, label: `${r.label} (${r.short})` }));

function taskLabel(code: number | null): string {
  if (code == null) return "—";
  switch (code) { case 0: return "空闲"; case 1: return "移动中"; case 2: return "执行任务"; case 3: return "暂停"; case 4: return "待命"; case 5: return "充电中"; case 6: return "错误"; default: return `状态${code}`; }
}
const fmt = (v: number | null | undefined, d = 2): string => v != null ? v.toFixed(d) : "—";
const fmtJson = (v: unknown): string => Array.isArray(v) && v.length > 0 ? v.join(", ") : "—";

function useAgvLog(ip: string) {
  const [tick, setTick] = useState(0);

  const q = useQuery({
    queryKey: ["agvTrajectoryLog", ip, tick],
    queryFn: () => fetchAgvTrajectory(ip, "2000-01-01T00:00:00", new Date().toISOString(), 1000),
    staleTime: 30_000,
  });

  const doRefresh = () => setTick(t => t + 1);
  return { ...q, doRefresh };
}

const columns = [
  { key: "time", label: "时间", render: (r: AgvTrajectoryRow) => new Date(r.recorded_at).toLocaleTimeString() },
  { key: "x", label: "X", render: (r: AgvTrajectoryRow) => fmt(r.x) },
  { key: "y", label: "Y", render: (r: AgvTrajectoryRow) => fmt(r.y) },
  { key: "angle", label: "角度°", render: (r: AgvTrajectoryRow) => r.angle != null ? (r.angle * 180 / Math.PI).toFixed(0) : "—" },
  { key: "confidence", label: "置信度", render: (r: AgvTrajectoryRow) => r.confidence != null ? Math.round(r.confidence * 100) + "%" : "—" },
  { key: "battery", label: "电量", render: (r: AgvTrajectoryRow, g?: AgvTrajectoryRow[]) => {
    if (g && g.length > 1) {
      const bats = g.map(x => x.battery).filter((b): b is number => b != null);
      if (bats.length >= 2) return Math.round(Math.min(...bats) * 100) + "%→" + Math.round(Math.max(...bats) * 100) + "%";
    }
    return r.battery != null ? Math.round(r.battery * 100) + "%" : "—";
  }},
  { key: "charging", label: "充电", render: (r: AgvTrajectoryRow) => r.charging ? "⚡" : "" },
  { key: "task_status", label: "任务", render: (r: AgvTrajectoryRow) => taskLabel(r.task_status) },
  { key: "station", label: "站点", render: (r: AgvTrajectoryRow) => r.station || "—" },
  { key: "map", label: "地图", render: (r: AgvTrajectoryRow) => r.map_name || "—" },
  { key: "odo", label: "里程(m)", render: (r: AgvTrajectoryRow) => fmt(r.odo, 1) },
  { key: "blocked", label: "阻挡", render: (r: AgvTrajectoryRow) => r.blocked ? "⚠" : "" },
  { key: "emergency", label: "急停", render: (r: AgvTrajectoryRow) => r.emergency ? "🛑" : "" },
  { key: "reloc", label: "重定位", render: (r: AgvTrajectoryRow) => r.reloc_status != null ? r.reloc_status : "—" },
  { key: "fork", label: "叉臂", render: (r: AgvTrajectoryRow) => fmt(r.fork_height, 3) },
  { key: "jack", label: "顶升", render: (r: AgvTrajectoryRow) => r.jack_enable ? (r.jack_state === 1 ? "↑升" : r.jack_state === 2 ? "↑↓" : "↓降") : "—" },
  { key: "errors", label: "错误", render: (r: AgvTrajectoryRow) => fmtJson(r.errors_json) },
  { key: "warnings", label: "警告", render: (r: AgvTrajectoryRow) => fmtJson(r.warnings_json) },
];

export default function AgvLogPage() {
  const [tab, setTab] = useState(0);
  const { data, isLoading, doRefresh } = useAgvLog(TABS[tab].ip);

  return (
    <div className="flex flex-col h-full bg-[var(--app-color-surface-page)] -my-6 sm:-my-8">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        <div className="flex items-center gap-3">
          <Link to="/admin/agv-tracker" className="p-1 text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]"><ArrowLeft size={16} /></Link>
          <h1 className="text-sm font-semibold text-[var(--app-color-text-primary)]">AGV 轨迹日志</h1>
          {data && <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{data.length} 条</span>}
          <button onClick={doRefresh} className="p-1 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"><RefreshCw size={14} /></button>
        </div>
      </div>

      <div className="shrink-0 flex border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        {TABS.map((t, i) => (
          <button key={t.ip} onClick={() => setTab(i)}
            className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${i === tab ? "border-[var(--app-color-accent)] text-[var(--app-color-accent)]" : "border-transparent text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-xs text-[var(--app-color-text-tertiary)]">加载中...</div>
        ) : data?.length === 0 ? (
          <div className="p-4 text-xs text-[var(--app-color-text-tertiary)]">暂无数据</div>
        ) : (() => {
          // 自动折叠连续相同的行
          // 合并条件：位置不变 + 站点不变 + 任务不变 → 同一段
          const KEYS = ["x", "y", "station", "task_status", "charging", "blocked", "emergency"] as const;
          type R = AgvTrajectoryRow;
          const sameRow = (a: R, b: R) => KEYS.every((k) => {
            const va = a[k as keyof R], vb = b[k as keyof R];
            if (typeof va === "number" && typeof vb === "number") return Math.abs(va - vb) < 0.01;
            return String(va ?? "") === String(vb ?? "");
          });
          const groups: { rows: R[]; from: string; to: string }[] = [];
          if (data) {
            for (const row of data) {
              const last = groups[groups.length - 1];
              if (last && sameRow(last.rows[0], row)) {
                last.rows.push(row);
                last.to = new Date(row.recorded_at).toLocaleTimeString();
              } else {
                const t = new Date(row.recorded_at).toLocaleTimeString();
                groups.push({ rows: [row], from: t, to: t });
              }
            }
          }
          return (
          <table className="w-max min-w-full text-[10px] border-collapse">
            <thead className="sticky top-0 bg-[var(--app-color-surface-container)] z-10">
              <tr className="border-b border-[var(--app-color-border-default)]">
                {columns.map((c) => (
                  <th key={c.key} className="text-left px-1.5 py-1.5 text-[var(--app-color-text-tertiary)] font-normal whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const row = g.rows[0];
                const merged = g.rows.length > 1;
                return (
                <tr key={row.id} className={`border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)] ${merged ? "bg-[var(--app-color-surface-hover)]/40" : ""}`}>
                  {columns.map((c) => {
                    if (c.key === "time" && merged) {
                      return (
                        <td key={c.key} className="px-1.5 py-1 text-[var(--app-color-text-primary)] whitespace-nowrap tabular-nums">
                          {g.from} ~ {g.to}
                          <span className="ml-1 text-[9px] text-[var(--app-color-text-tertiary)]">×{g.rows.length}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} className="px-1.5 py-1 text-[var(--app-color-text-primary)] whitespace-nowrap tabular-nums">{c.render(row, g.rows)}</td>
                    );
                  })}
                </tr>
              )})}
            </tbody>
          </table>
          );
          })()}
      </div>
    </div>
  );
}
