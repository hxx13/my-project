import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgvConfigEntry } from "@/api/domains/agv.api";
import { fetchAgvConfig, updateAgvConfig, fetchCoordConfigs, updateCoordConfig } from "@/api/domains/agv.api";
import { Link } from "react-router-dom";
import { FileText, LayoutGrid, Maximize2, Settings2, BarChart3, RotateCw } from "lucide-react";

const ROBOT_KEYS = ["AGV_ROBOT_16", "AGV_ROBOT_18", "AGV_ROBOT_20", "AGV_ROBOT_22"] as const;
const ROBOT_SHORT = [".16", ".18", ".20", ".22"] as const;
const ROBOT_NAMES = ["AGV-1", "AGV-2", "AGV-3", "AGV-4"] as const;
type LayoutMode = "quad" | "single";

interface Props {
  serverTime: string | null;
  layout: LayoutMode; onLayoutChange: (m: LayoutMode) => void;
  singleTab: number; onSingleTabChange: (i: number) => void;
  analysisOpen: boolean; onAnalysisToggle: () => void;
}

export default function AgvSidebar({ serverTime, layout, onLayoutChange, singleTab, onSingleTabChange, analysisOpen, onAnalysisToggle }: Props) {
  const qc = useQueryClient();
  const { data: configs } = useQuery({ queryKey: ["agvConfig"], queryFn: fetchAgvConfig, refetchInterval: 30_000 });
  const { data: rotations } = useQuery({ queryKey: ["agvCoordConfigs"], queryFn: fetchCoordConfigs, staleTime: 60_000 });
  const master = configs?.find((c) => c.jobKey === "AGV_MASTER");
  const anyOnline = configs?.some((c) => c.jobKey.startsWith("AGV_ROBOT") && c.enabled);
  const masterOn = master?.enabled ?? false;

  const toggleRobot = async (jobKey: string, cur: boolean) => {
    const v = cur ? 0 : 1; await updateAgvConfig(jobKey, v);
    qc.setQueryData(["agvConfig"], (old: AgvConfigEntry[] | undefined) =>
      old?.map((c) => (c.jobKey === jobKey ? { ...c, enabled: !cur } : c)));
  };

  const rotateRobot = async (ip: string) => {
    const cur = rotations?.[ip] ?? 0;
    const next = ((cur + 90) % 360 + 360) % 360;
    await updateCoordConfig(ip, next);
    qc.setQueryData(["agvCoordConfigs"], (old: Record<string, number> | undefined) => ({ ...old, [ip]: next }));
  };

  const showSingleTabs = layout === "single";

  return (
    <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-[var(--z-overlay)] flex items-center gap-0.5 px-2 py-1 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-md">
      <span className={`w-2 h-2 rounded-full shrink-0 mx-0.5 ${masterOn && anyOnline ? "bg-green-500" : masterOn ? "bg-yellow-500" : "bg-gray-400"}`} />
      <button onClick={() => onLayoutChange(layout === "quad" ? "single" : "quad")}
        className="px-2 py-0.5 rounded-full text-[10px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors flex items-center gap-1">
        {layout === "quad" ? <Maximize2 size={11} /> : <LayoutGrid size={11} />}
      </button>
      <span className="w-px h-3 bg-[var(--app-color-border-default)]" />

      {ROBOT_KEYS.map((key, i) => {
        const on = configs?.find((c) => c.jobKey === key)?.enabled ?? false;
        const ip = `172.22.159.${16 + i * 2}`;
        const deg = rotations?.[ip] ?? 0;
        return (
          <span key={key} className="flex items-center gap-0">
            <button onClick={() => toggleRobot(key, on)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-l-full transition-colors hover:bg-[var(--app-color-surface-hover)]"
              title={`${ROBOT_NAMES[i]} ${on ? "开" : "关"}`}>
              <span className={`relative w-5 h-2.5 rounded-full transition-colors ${on ? "bg-[var(--app-color-accent)]" : "bg-[var(--app-color-border-default)]"}`}>
                <span className={`absolute top-0.5 w-1.5 h-1.5 rounded-full bg-white shadow transition-all ${on ? "left-3" : "left-0.5"}`} />
              </span>
              <span className="text-[9px] text-[var(--app-color-text-secondary)]">{ROBOT_SHORT[i]}</span>
            </button>
            <button onClick={() => rotateRobot(ip)}
              className="px-0.5 py-0.5 rounded-r-full hover:bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] transition-colors"
              title={`旋转坐标系: ${deg}°`}>
              <RotateCw size={10} />
            </button>
          </span>
        );
      })}

      <span className="w-px h-3 bg-[var(--app-color-border-default)]" />
      {showSingleTabs && ROBOT_SHORT.map((l, i) => (
        <button key={l} onClick={() => onSingleTabChange(i)}
          className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${i === singleTab ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}>{l}</button>
      ))}
      {showSingleTabs && <span className="w-px h-3 bg-[var(--app-color-border-default)]" />}
      <Link to="/admin/agv-tracker/logs"
        className="px-2 py-0.5 rounded-full text-[10px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors flex items-center gap-1"><FileText size={11} />日志</Link>
      <Link to="/admin/agv-tracker/analytics"
        className="px-2 py-0.5 rounded-full text-[10px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors flex items-center gap-1"><BarChart3 size={11} />分析</Link>
      <button onClick={onAnalysisToggle}
        className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center ${analysisOpen ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}><Settings2 size={11} /></button>
    </div>
  );
}
