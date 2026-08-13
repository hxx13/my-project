import { useState } from "react";
import { X, GanttChartSquare, MapPin, SlidersHorizontal, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AgvTimelineTab from "./AgvTimelineTab";
import AgvZonePanel from "./AgvZonePanel";
import AgvRulePanel from "./AgvRulePanel";
import AgvStatsTab from "./AgvStatsTab";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";

type ModalTab = "timeline" | "zones" | "rules" | "stats";

const TABS: { key: ModalTab; label: string; icon: typeof GanttChartSquare }[] = [
  { key: "timeline", label: "时间线", icon: GanttChartSquare },
  { key: "zones", label: "区域", icon: MapPin },
  { key: "rules", label: "规则", icon: SlidersHorizontal },
  { key: "stats", label: "实时指标", icon: Activity },
];

type PendingPick = { x: number; y: number } | { x1: number; y1: number; x2: number; y2: number };

interface Props {
  open: boolean;
  onClose: () => void;
  onRequestPick?: () => void;
  onRequestRectPick?: () => void;
  pendingPick?: PendingPick | null;
  onClearPick?: () => void;
  focusZoneId?: number | null;
  creatableTags?: string[];
  allTagColors?: Record<string, string>;
}

export default function AgvAnalysisModal({ open, onClose, onRequestPick, onRequestRectPick, pendingPick, onClearPick, focusZoneId, creatableTags, allTagColors }: Props) {
  const [tab, setTab] = useState<ModalTab>("timeline");
  const [timelineRobot, setTimelineRobot] = useState(AGV_ROBOTS[0].ip);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center pointer-events-none">
          {/* Modal */}
          <motion.div
            className="pointer-events-auto relative w-[90vw] max-w-[1320px] h-[70vh] max-h-[720px] bg-[var(--app-color-surface-container)] rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] shadow-2xl flex flex-col overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-[var(--app-color-border-default)]">
              <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">
                AGV 行为分析
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab bar */}
            <div className="shrink-0 flex border-b border-[var(--app-color-border-default)] px-5">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                    tab === key
                      ? "text-[var(--app-color-accent)] border-[var(--app-color-accent)]"
                      : "text-[var(--app-color-text-tertiary)] border-transparent hover:text-[var(--app-color-text-secondary)]"
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            {/* Content — flex column so timeline can fill available height */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {tab === "timeline" && (
                <div className="flex flex-col flex-1 min-h-0 px-2 py-2">
                  <AgvTimelineTab
                    selectedRobot={timelineRobot}
                    onSelectRobot={setTimelineRobot}
                  />
                </div>
              )}
              {tab === "zones" && (
                <div className="flex-1 min-h-0 overflow-auto">
                  <AgvZonePanel
                    onRequestPick={onRequestPick}
                    onRequestRectPick={onRequestRectPick}
                    pendingPick={pendingPick}
                    onClearPick={onClearPick}
                    focusZoneId={focusZoneId}
                    creatableTags={creatableTags}
                    allTagColors={allTagColors}
                  />
                </div>
              )}
              {tab === "rules" && (
                <div className="flex-1 min-h-0 overflow-auto">
                  <AgvRulePanel />
                </div>
              )}
              {tab === "stats" && (
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <AgvStatsTab />
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
