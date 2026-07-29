import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgvConfigEntry } from "@/api/domains/agv.api";
import { fetchAgvConfig, updateAgvConfig } from "@/api/domains/agv.api";
import { Link } from "react-router-dom";
import { Play, Pause, FileText, LayoutGrid, Maximize2 } from "lucide-react";

const ROBOT_KEYS = ["AGV_ROBOT_16", "AGV_ROBOT_18", "AGV_ROBOT_20", "AGV_ROBOT_22"] as const;
const ROBOT_LABELS = [".16", ".18", ".20", ".22"] as const;

type LayoutMode = "quad" | "single";

interface Props {
  serverTime: string | null;
  layout: LayoutMode;
  onLayoutChange: (m: LayoutMode) => void;
  singleTab: number;
  onSingleTabChange: (i: number) => void;
}

export default function AgvToolbar({ serverTime, layout, onLayoutChange, singleTab, onSingleTabChange }: Props) {
  const qc = useQueryClient();
  const { data: configs } = useQuery({
    queryKey: ["agvConfig"],
    queryFn: fetchAgvConfig,
    refetchInterval: 30_000,
  });

  const master = configs?.find((c) => c.jobKey === "AGV_MASTER");
  const anyOnline = configs?.some((c) => c.jobKey.startsWith("AGV_ROBOT") && c.enabled);
  const masterOn = master?.enabled ?? false;

  const toggleRobot = async (jobKey: string, currentEnabled: boolean) => {
    const newVal = currentEnabled ? 0 : 1;
    await updateAgvConfig(jobKey, newVal);
    qc.setQueryData(["agvConfig"], (old: AgvConfigEntry[] | undefined) =>
      old?.map((c) => (c.jobKey === jobKey ? { ...c, enabled: !currentEnabled } : c)),
    );
  };

  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-[var(--app-color-text-primary)]">AGV 小车</h1>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${masterOn && anyOnline ? "bg-green-500" : masterOn ? "bg-yellow-500" : "bg-gray-400"}`} />
          <span className="text-[11px] text-[var(--app-color-text-secondary)]">
            {masterOn && anyOnline ? "轮询中" : masterOn ? "无在线车辆" : "已暂停"}
          </span>
        </div>
        {serverTime && (
          <span className="text-[10px] text-[var(--app-color-text-tertiary)]">
            {new Date(serverTime).toLocaleTimeString()}
          </span>
        )}

        {/* Layout toggle */}
        <div className="flex items-center border-l border-[var(--app-color-border-default)] pl-3 ml-1">
          <button
            onClick={() => onLayoutChange(layout === "quad" ? "single" : "quad")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--app-radius-element)] text-[11px] border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
          >
            {layout === "quad" ? <Maximize2 size={11} /> : <LayoutGrid size={11} />}
            {layout === "quad" ? "单象限" : "四象限"}
          </button>
        </div>

        {/* Single-mode tab buttons */}
        {layout === "single" && (
          <div className="flex items-center gap-0.5 ml-1">
            {ROBOT_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => onSingleTabChange(i)}
                className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                  i === singleTab
                    ? "bg-[var(--app-color-accent-soft)] border-[var(--app-color-accent)] text-[var(--app-color-accent)]"
                    : "border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Quick toggle switches */}
        {ROBOT_KEYS.map((key, i) => {
          const cfg = configs?.find((c) => c.jobKey === key);
          const on = cfg?.enabled ?? false;
          return (
            <button
              key={key}
              onClick={() => toggleRobot(key, on)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-[var(--app-radius-element)] text-[11px] border transition-colors ${
                on
                  ? "bg-[var(--app-color-accent-soft)] border-[var(--app-color-accent)] text-[var(--app-color-accent)]"
                  : "bg-transparent border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)]"
              }`}
            >
              {on ? <Play size={10} /> : <Pause size={10} />}
              {ROBOT_LABELS[i]}
            </button>
          );
        })}

        <Link
          to="/admin/agv-tracker/logs"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--app-radius-element)] text-[11px] border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
        >
          <FileText size={12} />
          日志
        </Link>
      </div>
    </div>
  );
}
