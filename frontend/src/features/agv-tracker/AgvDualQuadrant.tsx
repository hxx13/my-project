import { useRef, useState } from "react";
import AgvDualQuadrantCanvas, { type AgvCanvasData } from "./AgvDualQuadrantCanvas";
import type { TrailPoint } from "./useAgvTrailRef";
import { Zap, Wifi, WifiOff, AlertTriangle, Route, MoveRight, Circle, Play, Pause, ArrowUp, ArrowDown, Crosshair, RotateCw, Gauge, Rewind } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { updateCoordConfig } from "@/api/domains/agv.api";

// ── Per-AGV info ──
interface AgvInfo {
  ip: string; label: string; online: boolean; color: string;
  x: number | null; y: number | null; angle: number | null;
  trail: TrailPoint[];
  speed: number | null; avgSpeed: number | null; maxSpeed: number | null;
  dwellSpots?: { x: number; y: number; durationSec: number }[];
  battery: number | null; charging: boolean | null;
  taskStatus: number | null; blocked: boolean | null; emergency: boolean | null;
  station: string | null; mapName: string | null;
  confidence: number | null; relocStatus: number | null; loadmapStatus: number | null;
  odo: number | null; rssi: number | null; driverEmc: boolean | null;
  forkHeight: number | null; forkInPlace: boolean | null;
  jackEnable: boolean | null; jackState: number | null; jackIsFull: boolean | null;
  jackMode: boolean | null; jackErrorCode: number | null;
  errors: string[] | null; warnings: string[] | null;
  diChannels?: { id: number; source: string; status: boolean; valid: boolean }[] | null;
  coordRotationDeg?: number;
  currentActivity?: string;
}

interface Props {
  agvA: AgvInfo;
  agvB: AgvInfo;
  zoneOverlays?: { id: number; polygonJson: string; color: string; name: string }[];
  routeOverlaysA?: { id: number; pathJson: string; color: string; name: string; routeType: string }[];
  routeOverlaysB?: { id: number; pathJson: string; color: string; name: string; routeType: string }[];
  routeMode?: boolean;
  followMode?: boolean;
  /** Vehicle icon style */
  vehicleIcon?: 'arrow'|'forklift';
  /** 地图选点模式 */
  pickMode?: boolean;
  /** 两点矩形模式下的第一个角点锚点 */
  pickAnchor?: { x: number; y: number } | null;
  onPointPick?: (x: number, y: number) => void;
  onZoneClick?: (zoneId: number) => void;
}

// ── Action state (same logic as AgvQuadrant) ──
type ActionState = "idle" | "moving" | "reversing" | "rotating" | "lifting" | "lowering" | "paused" | "charging" | "error" | "blocked" | "emergency";

const ACTION_STYLE: Record<ActionState, string> = {
  idle: "bg-gray-100 text-gray-600 border-gray-200",
  moving: "bg-green-100 text-green-700 border-green-300",
  reversing: "bg-orange-100 text-orange-700 border-orange-300",
  rotating: "bg-blue-100 text-blue-700 border-blue-300",
  lifting: "bg-purple-100 text-purple-700 border-purple-300",
  lowering: "bg-purple-100 text-purple-700 border-purple-300",
  paused: "bg-yellow-100 text-yellow-700 border-yellow-300",
  charging: "bg-amber-100 text-amber-700 border-amber-300",
  error: "bg-red-100 text-red-700 border-red-300",
  blocked: "bg-orange-100 text-orange-700 border-orange-300",
  emergency: "bg-red-500 text-white border-red-600",
};

function deriveAction(
  speed: number | null, taskStatus: number | null,
  charging: boolean | null, blocked: boolean | null, emergency: boolean | null,
  jackState: number | null, forkMoving: boolean,
  reversing: boolean, online: boolean,
  currentActivity?: string,
): { state: ActionState; label: string; icon: React.ReactNode } {
  if (!online) return { state: "idle", label: "已休眠", icon: <Circle size={14} className="text-gray-400" /> };
  if (emergency) return { state: "emergency", label: "急停!", icon: <AlertTriangle size={14} className="text-red-500" /> };
  if (blocked) return { state: "blocked", label: "阻挡", icon: <AlertTriangle size={14} className="text-red-500" /> };
  if (currentActivity === "CHARGING") return { state: "charging", label: "充电中", icon: <Zap size={14} className="text-yellow-500" /> };
  if (currentActivity === "STATION_DWELL") return { state: "paused", label: "站点停靠", icon: <Circle size={14} className="text-amber-400" fill="currentColor" /> };
  if (currentActivity === "STATION_WORK") return { state: "lifting", label: "站点作业", icon: <ArrowUp size={14} className="text-purple-400" /> };
  if (currentActivity === "TRANSPORT") return { state: "moving", label: "运输中", icon: <Play size={14} className="text-green-500" /> };
  if (currentActivity === "NAVIGATING") return { state: "moving", label: "寻路中", icon: <Play size={14} className="text-blue-400" /> };
  if (currentActivity === "REST_STATION") return { state: "idle", label: "休息站", icon: <Circle size={14} className="text-teal-400" fill="currentColor" /> };
  if (currentActivity === "PATH_WAIT") return { state: "paused", label: "路径等待", icon: <Pause size={14} className="text-gray-400" /> };
  if (currentActivity === "REVERSE_MANEUVER") return { state: "reversing", label: "倒车调头", icon: <Rewind size={14} className="text-orange-500" /> };
  if (charging) return { state: "charging", label: "充电中", icon: <Zap size={14} className="text-yellow-500" /> };
  if (taskStatus === 3) return { state: "paused", label: "暂停中", icon: <Pause size={14} className="text-yellow-500" /> };
  if (taskStatus === 6) return { state: "error", label: "错误", icon: <AlertTriangle size={14} className="text-red-500" /> };
  if (forkMoving) return { state: jackState === 1 ? "lifting" : "lowering", label: jackState === 1 ? "抬升中" : "放下中", icon: jackState === 1 ? <ArrowUp size={14} className="text-blue-400" /> : <ArrowDown size={14} className="text-blue-400" /> };
  const spd = speed ?? 0;
  if (spd > 0.05) {
    if (reversing) return { state: "reversing", label: "倒车中", icon: <Rewind size={14} className="text-orange-500" /> };
    return { state: "moving", label: "移动中", icon: <Play size={14} className="text-green-500" /> };
  }
  if (spd > 0.01) return { state: "rotating", label: "旋转中", icon: <RotateCw size={14} className="text-blue-400" /> };
  return { state: "idle", label: "待命中", icon: <Circle size={14} className="text-[var(--app-color-accent)]" fill="currentColor" /> };
}

function JackIcon({ enable, state, isFull, mode }: { enable: boolean | null; state: number | null; isFull: boolean | null; mode: boolean | null }) {
  const sz = 10;
  if (!enable) return <ArrowDown size={sz} className="text-gray-400" />;
  return (
    <span className="inline-flex items-center gap-0.5" title={`顶升: enable state=${state} full=${isFull} mode=${mode}`}>
      {state === 1 ? <ArrowUp size={sz} className="text-green-500" />
        : state === 2 ? <ArrowUp size={sz} className="text-yellow-500" />
        : <ArrowDown size={sz} className="text-blue-400" />}
      {isFull && <span className="text-[8px] text-green-500">满</span>}
    </span>
  );
}

const FORK_MAX_M = 0.1;

// ── Compact header row for one AGV ──
function AgvHeaderRow({ info }: { info: AgvInfo }) {
  const {
    ip, label, online, color,
    speed, angle, odo, battery, charging, blocked, emergency,
    confidence, rssi,
    coordRotationDeg, errors, warnings,
  } = info;

  const qc = useQueryClient();
  const pct = battery != null ? Math.round(battery * 100) : null;
  const barColor = pct != null ? (pct <= 20 ? "#ef4444" : pct <= 50 ? "#f59e0b" : "#22c55e") : "#9ca3af";
  const hasAlerts = (errors && errors.length > 0) || (warnings && warnings.length > 0);

  const doRotate = async () => {
    const cur = coordRotationDeg ?? 0;
    const next = ((cur + 90) % 360 + 360) % 360;
    await updateCoordConfig(ip, next);
    qc.setQueryData(["agvCoordConfigs"], (old: Record<string, number> | undefined) => ({ ...old, [ip]: next }));
  };

  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: online ? color : "#9ca3af" }} />
      <span className="text-[10px] font-semibold text-[var(--app-color-text-primary)] shrink-0">{label}</span>
      {online ? <Wifi size={10} className="text-green-500 shrink-0" /> : <WifiOff size={10} className="text-red-400 shrink-0" />}

      <button onClick={doRotate} className="p-0.5 rounded hover:bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] shrink-0" title={`旋转: ${coordRotationDeg ?? 0}°`}>
        <RotateCw size={9} />
      </button>

      {blocked && <AlertTriangle size={10} className="text-red-500 shrink-0" />}
      {emergency && <AlertTriangle size={10} className="text-red-500 shrink-0" fill="currentColor" />}
      {hasAlerts && <AlertTriangle size={10} className="text-orange-500 shrink-0" />}
      {charging && <Zap size={10} className="text-yellow-500 shrink-0" />}

      {/* Confidence + RSSI */}
      <span className="text-[8px] text-[var(--app-color-text-tertiary)] inline-flex items-center gap-0.5 shrink-0">
        <Crosshair size={8} />{confidence != null ? (confidence * 100).toFixed(0) + "%" : "—"}
      </span>

      {/* Speed + angle + odo */}
      <span className="text-base font-black tabular-nums tracking-tight shrink-0" style={{ color }}>
        {speed != null ? (speed < 0.005 ? "0.00" : speed.toFixed(2)) : "0.00"}
      </span>
      <span className="text-[8px] text-[var(--app-color-text-tertiary)]">m/s</span>

      <span className="w-px h-3 bg-[var(--app-color-border-default)]" />

      <span className="inline-flex items-center gap-0.5 shrink-0">
        <MoveRight size={11} className="text-[var(--app-color-text-tertiary)]" />
        <span className="text-sm font-bold tabular-nums text-[var(--app-color-text-primary)]">
          {angle != null ? (angle * 180 / Math.PI).toFixed(0) + "°" : "—°"}
        </span>
      </span>

      <span className="w-px h-3 bg-[var(--app-color-border-default)]" />

      <span className="inline-flex items-center gap-0.5 text-[8px] text-[var(--app-color-text-tertiary)] shrink-0">
        <Gauge size={9} />
        <span className="tabular-nums">{odo != null ? (odo / 1000).toFixed(1) + "km" : "—"}</span>
      </span>

      {/* Battery */}
      <span className="inline-flex items-center gap-0.5 shrink-0 ml-auto">
        <span className="relative w-1.5 h-3 border rounded-[1px] flex flex-col justify-end overflow-hidden" style={{ borderColor: barColor }}>
          <span className="w-full rounded-b-[1px] transition-all duration-500" style={{ height: `${pct ?? 0}%`, backgroundColor: barColor }} />
        </span>
        <span className="text-[8px] tabular-nums" style={{ color: barColor }}>{pct != null ? pct + "%" : "—"}</span>
      </span>
    </div>
  );
}

export default function AgvDualQuadrant(props: Props) {
  const { agvA, agvB, zoneOverlays, routeOverlaysA, routeOverlaysB, routeMode, followMode, vehicleIcon, pickMode, pickAnchor, onPointPick, onZoneClick } = props;
  const [followTarget, setFollowTarget] = useState<"A" | "B">("A");

  // ── Build canvas data for both AGVs ──
  const canvasA: AgvCanvasData = {
    ip: agvA.ip, trail: agvA.trail,
    currentX: agvA.x, currentY: agvA.y, currentAngle: agvA.angle,
    online: agvA.online, color: agvA.color,
    dwellSpots: agvA.dwellSpots,
    forkHeight: agvA.forkHeight, jackState: agvA.jackState, jackIsFull: agvA.jackIsFull,
  };
  const canvasB: AgvCanvasData = {
    ip: agvB.ip, trail: agvB.trail,
    currentX: agvB.x, currentY: agvB.y, currentAngle: agvB.angle,
    online: agvB.online, color: agvB.color,
    dwellSpots: agvB.dwellSpots,
    forkHeight: agvB.forkHeight, jackState: agvB.jackState, jackIsFull: agvB.jackIsFull,
  };

  // ── Derive actions ──
  const prevForkARef = useRef(agvA.forkHeight);
  const forkMovingA = agvA.forkHeight != null && prevForkARef.current != null && Math.abs(agvA.forkHeight - prevForkARef.current!) > 0.0005;
  prevForkARef.current = agvA.forkHeight;
  let reversingA = false;
  if (agvA.trail.length >= 2 && agvA.speed != null && agvA.speed > 0.05) {
    const a = agvA.trail[agvA.trail.length - 2], b = agvA.trail[agvA.trail.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.01) { const hx = Math.cos(b.angle), hy = Math.sin(b.angle); reversingA = (dx / len * hx + dy / len * hy) < -0.3; }
  }
  const actionA = deriveAction(agvA.speed, agvA.taskStatus, agvA.charging, agvA.blocked, agvA.emergency, agvA.jackState, forkMovingA, reversingA, agvA.online, agvA.currentActivity);

  const prevForkBRef = useRef(agvB.forkHeight);
  const forkMovingB = agvB.forkHeight != null && prevForkBRef.current != null && Math.abs(agvB.forkHeight - prevForkBRef.current!) > 0.0005;
  prevForkBRef.current = agvB.forkHeight;
  let reversingB = false;
  if (agvB.trail.length >= 2 && agvB.speed != null && agvB.speed > 0.05) {
    const a = agvB.trail[agvB.trail.length - 2], b = agvB.trail[agvB.trail.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.01) { const hx = Math.cos(b.angle), hy = Math.sin(b.angle); reversingB = (dx / len * hx + dy / len * hy) < -0.3; }
  }
  const actionB = deriveAction(agvB.speed, agvB.taskStatus, agvB.charging, agvB.blocked, agvB.emergency, agvB.jackState, forkMovingB, reversingB, agvB.online, agvB.currentActivity);

  const forkPctA = agvA.forkHeight != null ? Math.min(1, Math.max(0, agvA.forkHeight / FORK_MAX_M)) * 100 : 0;
  const forkPctB = agvB.forkHeight != null ? Math.min(1, Math.max(0, agvB.forkHeight / FORK_MAX_M)) * 100 : 0;
  const hasAlertsA = (agvA.errors && agvA.errors.length > 0) || (agvA.warnings && agvA.warnings.length > 0);
  const hasAlertsB = (agvB.errors && agvB.errors.length > 0) || (agvB.warnings && agvB.warnings.length > 0);

  return (
    <div className="flex flex-col h-full min-h-0 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] overflow-hidden"
      data-agv-dual-quadrant={`${agvA.ip}+${agvB.ip}`}>

      {/* ── Follow target selector (visible only in follow mode) ── */}
      {followMode && (
        <div className="shrink-0 flex items-center gap-1 px-3 py-0.5 bg-[var(--app-color-accent-soft)] border-b border-[var(--app-color-border-default)]">
          <span className="text-[9px] text-[var(--app-color-text-secondary)]">跟随:</span>
          <button onClick={() => setFollowTarget("A")}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${followTarget === "A" ? "bg-[var(--app-color-accent)] text-white" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}>
            {agvA.label}
          </button>
          <button onClick={() => setFollowTarget("B")}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${followTarget === "B" ? "bg-[var(--app-color-accent)] text-white" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}>
            {agvB.label}
          </button>
        </div>
      )}

      {/* ── Header: two AGV info rows side by side ── */}
      <div className="shrink-0 flex items-stretch border-b border-[var(--app-color-border-default)]">
        <div className="flex-1 px-3 py-1 min-w-0"><AgvHeaderRow info={agvA} /></div>
        <div className="w-px bg-[var(--app-color-border-default)]" />
        <div className="flex-1 px-3 py-1 min-w-0"><AgvHeaderRow info={agvB} /></div>
      </div>

      {/* ── Canvas with overlays ── */}
      <div className="flex-1 min-h-0 relative">
        <AgvDualQuadrantCanvas agvA={canvasA} agvB={canvasB}
          coordRotationDeg={agvA.coordRotationDeg}
          zoneOverlays={zoneOverlays}
          routeOverlaysA={routeOverlaysA} routeOverlaysB={routeOverlaysB} routeMode={routeMode}
          followMode={followMode} followTarget={followMode ? followTarget : null}
          vehicleIcon={vehicleIcon}
          pickMode={pickMode} pickAnchor={pickAnchor} onPointPick={onPointPick} onZoneClick={onZoneClick} />

        {/* ── AGV-A overlays (left side) ── */}
        <div className="absolute top-2 left-2 flex items-start gap-2 pointer-events-none">
          <div className="flex items-center gap-1.5 bg-[var(--app-color-surface-container)]/80 rounded px-1.5 py-1">
            <div className="relative w-3 h-28 rounded-full bg-[var(--app-color-border-default)]">
              <div className="absolute left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-4 border-white shadow-md"
                style={{ bottom: `${forkPctA}%`, transform: `translate(-50%, 50%)`, backgroundColor: "#f59e0b", transition: "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-[var(--app-color-text-primary)] tabular-nums">{agvA.forkHeight != null ? agvA.forkHeight.toFixed(4) : "—.——"}</span>
              <span className="text-[8px] text-[var(--app-color-text-tertiary)]">m</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[8px] text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-container)]/80 rounded px-1 py-0.5">
            <JackIcon enable={agvA.jackEnable} state={agvA.jackState} isFull={agvA.jackIsFull} mode={agvA.jackMode} />
            {agvA.jackErrorCode != null && agvA.jackErrorCode !== 0 && <span className="text-red-500 font-medium">E{agvA.jackErrorCode}</span>}
            {agvA.driverEmc && <span className="text-yellow-500 font-medium">EMC</span>}
            {(agvA.relocStatus != null && agvA.relocStatus !== 1) && <span className="text-yellow-500 font-medium">reloc!</span>}
            {(agvA.loadmapStatus != null && agvA.loadmapStatus !== 1) && <span className="text-yellow-500 font-medium">map!</span>}
          </div>
        </div>

        {/* AGV-A action state pill (top-left area) */}
        <div className={`absolute top-2 left-[140px] flex items-center gap-1 rounded-full px-2 py-1 border pointer-events-none shadow-sm text-[10px] ${ACTION_STYLE[actionA.state]}`}>
          {actionA.icon}
          <span className="font-bold">{actionA.label}</span>
        </div>

        {/* ── AGV-B overlays (right side) ── */}
        <div className="absolute top-2 right-2 flex items-start gap-2 pointer-events-none flex-row-reverse">
          <div className="flex items-center gap-1.5 bg-[var(--app-color-surface-container)]/80 rounded px-1.5 py-1">
            <div className="relative w-3 h-28 rounded-full bg-[var(--app-color-border-default)]">
              <div className="absolute left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-4 border-white shadow-md"
                style={{ bottom: `${forkPctB}%`, transform: `translate(-50%, 50%)`, backgroundColor: "#8b5cf6", transition: "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-[var(--app-color-text-primary)] tabular-nums">{agvB.forkHeight != null ? agvB.forkHeight.toFixed(4) : "—.——"}</span>
              <span className="text-[8px] text-[var(--app-color-text-tertiary)]">m</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[8px] text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-container)]/80 rounded px-1 py-0.5">
            <JackIcon enable={agvB.jackEnable} state={agvB.jackState} isFull={agvB.jackIsFull} mode={agvB.jackMode} />
            {agvB.jackErrorCode != null && agvB.jackErrorCode !== 0 && <span className="text-red-500 font-medium">E{agvB.jackErrorCode}</span>}
            {agvB.driverEmc && <span className="text-yellow-500 font-medium">EMC</span>}
            {(agvB.relocStatus != null && agvB.relocStatus !== 1) && <span className="text-yellow-500 font-medium">reloc!</span>}
            {(agvB.loadmapStatus != null && agvB.loadmapStatus !== 1) && <span className="text-yellow-500 font-medium">map!</span>}
          </div>
        </div>

        {/* AGV-B action state pill (top-right area) */}
        <div className={`absolute top-2 right-[140px] flex items-center gap-1 rounded-full px-2 py-1 border pointer-events-none shadow-sm text-[10px] ${ACTION_STYLE[actionB.state]}`}>
          {actionB.icon}
          <span className="font-bold">{actionB.label}</span>
        </div>

        {/* ── Bottom-left: AGV-A coords ── */}
        <div className="absolute bottom-1 left-2 text-[9px] text-[var(--app-color-text-primary)] tabular-nums pointer-events-none bg-[var(--app-color-surface-container)]/80 rounded px-1.5 py-0.5">
          {agvA.x != null && agvA.y != null ? `(${agvA.x.toFixed(2)}, ${agvA.y.toFixed(2)})` : "—"} · {agvA.trail.length}点
          {agvA.avgSpeed != null && ` · 均${agvA.avgSpeed.toFixed(2)}m/s`}
          {agvA.maxSpeed != null && ` · 峰${agvA.maxSpeed.toFixed(2)}m/s`}
        </div>

        {/* ── Bottom-right: AGV-B coords ── */}
        <div className="absolute bottom-1 right-2 text-[9px] text-[var(--app-color-text-primary)] tabular-nums pointer-events-none bg-[var(--app-color-surface-container)]/80 rounded px-1.5 py-0.5 text-right">
          {agvB.x != null && agvB.y != null ? `(${agvB.x.toFixed(2)}, ${agvB.y.toFixed(2)})` : "—"} · {agvB.trail.length}点
          {agvB.avgSpeed != null && ` · 均${agvB.avgSpeed.toFixed(2)}m/s`}
          {agvB.maxSpeed != null && ` · 峰${agvB.maxSpeed.toFixed(2)}m/s`}
        </div>

        {/* ── Station labels ── */}
        {agvA.station && (
          <div className="absolute bottom-5 left-2 text-[9px] text-[var(--app-color-accent)] font-semibold bg-[var(--app-color-accent-soft)] px-1.5 py-0.5 rounded pointer-events-none">
            {agvA.station}
          </div>
        )}
        {agvB.station && (
          <div className="absolute bottom-5 right-2 text-[9px] text-[var(--app-color-accent)] font-semibold bg-[var(--app-color-accent-soft)] px-1.5 py-0.5 rounded pointer-events-none">
            {agvB.station}
          </div>
        )}

        {/* ── DI channels ── */}
        {agvA.diChannels && agvA.diChannels.length > 0 && (
          <div className="absolute bottom-10 left-1/4 -translate-x-1/2 flex items-center gap-1 pointer-events-none bg-[var(--app-color-surface-container)]/80 rounded px-1 py-0.5">
            {agvA.diChannels.map((ch) => (
              <span key={ch.id} className={`inline-flex items-center gap-0.5 text-[7px] ${ch.status ? "text-green-600 font-medium" : "text-gray-400"}`} title={`${agvA.label} DI${ch.id}: ${ch.status ? "闭合" : "断开"}`}>
                <span className={`w-1 h-1 rounded-full ${ch.status ? "bg-green-500" : "bg-gray-300"}`} />{ch.id}
              </span>
            ))}
          </div>
        )}
        {agvB.diChannels && agvB.diChannels.length > 0 && (
          <div className="absolute bottom-10 right-1/4 translate-x-1/2 flex items-center gap-1 pointer-events-none bg-[var(--app-color-surface-container)]/80 rounded px-1 py-0.5">
            {agvB.diChannels.map((ch) => (
              <span key={ch.id} className={`inline-flex items-center gap-0.5 text-[7px] ${ch.status ? "text-green-600 font-medium" : "text-gray-400"}`} title={`${agvB.label} DI${ch.id}: ${ch.status ? "闭合" : "断开"}`}>
                <span className={`w-1 h-1 rounded-full ${ch.status ? "bg-green-500" : "bg-gray-300"}`} />{ch.id}
              </span>
            ))}
          </div>
        )}

        {/* ── Alerts ── */}
        {hasAlertsA && (
          <div className="absolute bottom-14 left-2 flex flex-col gap-0.5 pointer-events-none">
            {agvA.errors && agvA.errors.length > 0 && agvA.errors.map((e, i) => (
              <span key={"ae" + i} className="text-[7px] text-red-500 bg-red-50 px-1 rounded">{e}</span>
            ))}
            {agvA.warnings && agvA.warnings.length > 0 && agvA.warnings.map((w, i) => (
              <span key={"aw" + i} className="text-[7px] text-orange-500 bg-orange-50 px-1 rounded">{w}</span>
            ))}
          </div>
        )}
        {hasAlertsB && (
          <div className="absolute bottom-14 right-2 flex flex-col gap-0.5 pointer-events-none items-end">
            {agvB.errors && agvB.errors.length > 0 && agvB.errors.map((e, i) => (
              <span key={"be" + i} className="text-[7px] text-red-500 bg-red-50 px-1 rounded">{e}</span>
            ))}
            {agvB.warnings && agvB.warnings.length > 0 && agvB.warnings.map((w, i) => (
              <span key={"bw" + i} className="text-[7px] text-orange-500 bg-orange-50 px-1 rounded">{w}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
