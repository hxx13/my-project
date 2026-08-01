import { useRef, useState, useEffect } from "react";
import AgvQuadrantCanvas from "./AgvQuadrantCanvas";
import AgvPlaybackTimeline from "./AgvPlaybackTimeline";
import type { TrailPoint } from "./useAgvTrailRef";
import type { HistoryPlaybackResponse } from "@/api/domains/agv.api";
import { ACTIVITY_COLORS } from "@/api/domains/agv-analysis.api";
import { Zap, Wifi, WifiOff, AlertTriangle, Route, MoveRight, Circle, Play, Pause, ArrowUp, ArrowDown, Crosshair, RotateCw, Gauge, ArrowUpRight, ArrowLeft, Rewind, X, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { updateCoordConfig } from "@/api/domains/agv.api";

interface Props {
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
  coordOffsetX?: number;
  coordOffsetY?: number;
  coordScale?: number;
  /** Zone polygons to overlay on canvas */
  zoneOverlays?: { id: number; polygonJson: string; color: string; name: string }[];
  /** Route paths to overlay on canvas */
  routeOverlays?: { id: number; pathJson: string; color: string; name: string; routeType: string }[];
  /** Route mode: 30s fading trail */
  routeMode?: boolean;
  /** Vehicle-follow mode: camera locks to vehicle, heading = up */
  followMode?: boolean;
  /** Transition markers for canvas */
  transitionMarkers?: { x: number; y: number; label: string }[];
  /** Current activity type from analysis (e.g. "CHARGING"), overrides raw telemetry status */
  currentActivity?: string;
  /** Vehicle icon style */
  vehicleIcon?: 'arrow'|'forklift';
  /** 地图选点模式 */
  pickMode?: boolean;
  /** 两点矩形模式（拖拽绘制） */
  pickTwoPoint?: boolean;
  /** 两点式选点第一角点锚点（canvas 渲染锚点标记） */
  pickAnchor?: { x: number; y: number } | null;
  onPointPick?: (x: number, y: number) => void;
  /** 拖拽绘制矩形完成 */
  onRectDrawn?: (x1: number, y1: number, x2: number, y2: number) => void;
  onZoneClick?: (zoneId: number, name: string, stationPattern?: string) => void;
  /** 编辑模式开关：打开后才能拖拽调整 zone */
  /** 编辑模式 */
  coordEditMode?: boolean;
  zoneEditMode?: boolean;
  selectedZoneId?: number | null;
  onZoneSelect?: (id: number | null) => void;
  onZoneReshape?: (id: number, polygonJson: string) => void;
  // ── History playback props (single-quadrant only) ──
  playbackActive?: boolean;
  playbackData?: HistoryPlaybackResponse | null;
  playbackPlaying?: boolean;
  playbackProgress?: number;
  playbackSpeed?: number;
  playbackLoading?: boolean;
  playbackError?: string | null;
  onStartPlayback?: (ip: string, from: string, to: string) => void;
  onClearPlayback?: () => void;
  onStopPlayback?: () => void;
  onPlaybackPlay?: () => void;
  onPlaybackPause?: () => void;
  onPlaybackProgress?: (p: number) => void;
  onPlaybackSpeed?: (s: number) => void;
}

// ── Action state derivation ──
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
  if (!online) return { state: "idle", label: "已休眠", icon: <Circle size={16} className="text-gray-400" /> };
  if (currentActivity === "CHARGING") return { state: "charging", label: "充电中", icon: <Zap size={16} className="text-yellow-500" /> };
  if (currentActivity === "STATION_WORK") return { state: "lifting", label: "载货中", icon: <ArrowUp size={16} className="text-purple-400" /> };
  if (currentActivity === "TRANSPORT") return { state: "moving", label: "运输中", icon: <Play size={16} className="text-green-500" /> };
  if (currentActivity === "NAVIGATING") return { state: "moving", label: "寻路中", icon: <Play size={16} className="text-blue-400" /> };
  if (currentActivity === "REST_STATION") return { state: "idle", label: "休息中", icon: <Circle size={16} className="text-teal-400" fill="currentColor" /> };
  if (charging) return { state: "charging", label: "充电中", icon: <Zap size={16} className="text-yellow-500" /> };
  const spd = speed ?? 0;
  if (spd > 0.05) {
    if (reversing) return { state: "reversing", label: "倒车中", icon: <Rewind size={16} className="text-orange-500" /> };
    return { state: "moving", label: "移动中", icon: <Play size={16} className="text-green-500" /> };
  }
  if (spd > 0.01) return { state: "rotating", label: "旋转中", icon: <RotateCw size={16} className="text-blue-400" /> };
  return { state: "idle", label: "待命中", icon: <Circle size={16} className="text-[var(--app-color-accent)]" fill="currentColor" /> };
}

// ── Jack state icon ──
function JackIcon({ enable, state, isFull, mode }: { enable: boolean | null; state: number | null; isFull: boolean | null; mode: boolean | null }) {
  const sz = 12;
  if (!enable) return <ArrowDown size={sz} className="text-gray-400" />;
  // state: 0=down, 1=up, 2=moving
  return (
    <span className="inline-flex items-center gap-0.5" title={`顶升: enable state=${state} full=${isFull} mode=${mode}`}>
      {state === 1 ? <ArrowUp size={sz} className="text-green-500" />
        : state === 2 ? <ArrowUpRight size={sz} className="text-yellow-500" />
        : <ArrowDown size={sz} className="text-blue-400" />}
      {isFull && <span className="text-[8px] text-green-500">满</span>}
    </span>
  );
}

const FORK_MAX_M = 0.1; // max fork height in meters for visual bar

export default function AgvQuadrant(props: Props) {
  const {
    ip, label, online, color, x, y, angle, trail,
    speed, avgSpeed, maxSpeed, dwellSpots,
    battery, charging, taskStatus, blocked, emergency,
    station, mapName, confidence, relocStatus, loadmapStatus,
    odo, rssi, driverEmc, forkHeight, forkInPlace,
    jackEnable, jackState, jackIsFull, jackMode, jackErrorCode,
    errors, warnings, diChannels, coordRotationDeg,
    zoneOverlays, routeOverlays, routeMode, followMode, transitionMarkers, currentActivity,
    vehicleIcon, pickMode, pickTwoPoint, pickAnchor, onPointPick, onRectDrawn, onZoneClick, coordEditMode, zoneEditMode, selectedZoneId, onZoneSelect, onZoneReshape,
    playbackActive, playbackData, playbackPlaying, playbackProgress, playbackSpeed,
    playbackLoading, playbackError,
    onStartPlayback, onClearPlayback, onStopPlayback, onPlaybackPlay, onPlaybackPause, onPlaybackProgress, onPlaybackSpeed,
  } = props;

  const qc = useQueryClient();
  const [showTimeline, setShowTimeline] = useState(false);

  // 进入回放模式时自动收起时间轴，只保留紧凑播放条
  useEffect(() => {
    if (playbackActive) setShowTimeline(false);
  }, [playbackActive]);
  // 停止播放时回到时间轴选择器
  const wasPlayingRef = useRef(false);
  useEffect(() => { if (playbackActive) wasPlayingRef.current = true; }, [playbackActive]);
  useEffect(() => {
    if (!playbackActive && wasPlayingRef.current) {
      wasPlayingRef.current = false;
      setShowTimeline(true);
    }
  }, [playbackActive]);

  const pct = battery != null ? Math.round(battery * 100) : null;
  const barColor = pct != null
    ? (pct <= 20 ? "#ef4444" : pct <= 50 ? "#f59e0b" : "#22c55e") : "#9ca3af";

  const doRotate = async () => {
    const cur = coordRotationDeg ?? 0;
    const next = ((cur + 90) % 360 + 360) % 360;
    await updateCoordConfig(ip, next);
    qc.setQueryData(["agvCoordConfigs"], (old: Record<string, number> | undefined) => ({ ...old, [ip]: next }));
  };

  // 倒车检测：移动方向 vs 朝向 (dot product < 0 → 倒车)
  let reversing = false;
  if (trail.length >= 2 && speed != null && speed > 0.05) {
    const a = trail[trail.length - 2], b = trail[trail.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.01) {
      const moveDirX = dx / len, moveDirY = dy / len;
      const headingX = Math.cos(b.angle), headingY = Math.sin(b.angle);
      reversing = (moveDirX * headingX + moveDirY * headingY) < -0.3;
    }
  }
  // 叉臂运动检测：对比当前高度与上次记录
  const prevForkRef = useRef(forkHeight);
  const forkMoving = forkHeight != null && prevForkRef.current != null && Math.abs(forkHeight - prevForkRef.current!) > 0.0005;
  prevForkRef.current = forkHeight;
  const action = deriveAction(speed, taskStatus, charging, blocked, emergency, jackState, forkMoving, reversing, online, currentActivity);
  const hasAlerts = (errors && errors.length > 0) || (warnings && warnings.length > 0);
  const forkPct = forkHeight != null ? Math.min(1, Math.max(0, forkHeight / FORK_MAX_M)) * 100 : 0;

  return (
    <div className="flex flex-col h-full min-h-0 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] overflow-hidden"
      data-agv-quadrant={ip}>

      {/* ── Header: single row, clean ── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1 border-b border-[var(--app-color-border-default)]">
        {/* Left: label + status dot */}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: online ? color : "#9ca3af" }} />
        <span className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">{label}</span>
        {online ? <Wifi size={11} className="text-green-500 shrink-0" /> : <WifiOff size={11} className="text-red-400 shrink-0" />}
        {/* 回放时间线开关 */}
        <button onClick={() => setShowTimeline(v => !v)}
          className={`p-0.5 rounded hover:bg-[var(--app-color-surface-hover)] transition-colors ${
            showTimeline || playbackActive ? "text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)]"
          }`}
          title="历史回放">
          <Clock size={11} />
        </button>
        <button onClick={doRotate} className="p-0.5 rounded hover:bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]" title={`旋转坐标系: ${coordRotationDeg ?? 0}°`}>
          <RotateCw size={10} />
        </button>
        {(coordRotationDeg ?? 0) !== 0 && (
          <button onClick={async () => { await updateCoordConfig(ip, 0); qc.setQueryData(["agvCoordConfigs"], (old: Record<string, number> | undefined) => ({ ...old, [ip]: 0 })); }}
            className="p-0.5 rounded hover:bg-[var(--app-color-surface-hover)] text-red-400 hover:text-red-600" title="重置为0°">
            <RotateCw size={10} className="rotate-180" />
          </button>
        )}
        {blocked && <AlertTriangle size={11} className="text-red-500" />}
        {emergency && <AlertTriangle size={11} className="text-red-500" fill="currentColor" />}
        {hasAlerts && <AlertTriangle size={11} className="text-orange-500" />}
        {charging && <Zap size={11} className="text-yellow-500" />}

        {/* Confidence + RSSI */}
        <span className="text-[9px] text-[var(--app-color-text-tertiary)] inline-flex items-center gap-0.5 shrink-0">
          <Crosshair size={9} />{confidence != null ? (confidence * 100).toFixed(0) + "%" : "—"}
        </span>
        <span className={`text-[9px] shrink-0 ${rssi != null && rssi < -70 ? "text-red-400" : "text-[var(--app-color-text-tertiary)]"}`}>
          {rssi != null ? rssi + "dBm" : "—"}
        </span>

        {/* Center: speed + angle + odo — primary data */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-xl font-black tabular-nums tracking-tight" style={{ color }}>
            {speed != null ? (speed < 0.005 ? "0.00" : speed.toFixed(2)) : "0.00"}
          </span>
          <span className="text-[9px] text-[var(--app-color-text-tertiary)]">m/s</span>

          <span className="w-px h-4 bg-[var(--app-color-border-default)]" />

          <span className="inline-flex items-center gap-0.5">
            <MoveRight size={13} className="text-[var(--app-color-text-tertiary)]" />
            <span className="text-base font-bold tabular-nums text-[var(--app-color-text-primary)]">
              {angle != null ? (angle * 180 / Math.PI).toFixed(0) + "°" : "—°"}
            </span>
          </span>

          <span className="w-px h-4 bg-[var(--app-color-border-default)]" />

          <span className="inline-flex items-center gap-0.5 text-[9px] text-[var(--app-color-text-tertiary)]">
            <Gauge size={10} />
            <span className="tabular-nums">{odo != null ? (odo / 1000).toFixed(1) + "km" : "—"}</span>
          </span>
        </div>

        {/* Right: battery */}
        <span className="inline-flex items-center gap-0.5 shrink-0">
          <span className="relative w-2 h-4 border rounded-[1px] flex flex-col justify-end overflow-hidden" style={{ borderColor: barColor }}>
            <span className="w-full rounded-b-[1px] transition-all duration-500" style={{ height: `${pct ?? 0}%`, backgroundColor: barColor }} />
          </span>
          <span className="text-[9px] tabular-nums" style={{ color: barColor }}>{pct != null ? pct + "%" : "—"}</span>
        </span>
      </div>

      {/* ── Canvas with overlays ── */}
      <div className="flex-1 min-h-0 relative">
        <AgvQuadrantCanvas ip={ip} trail={trail}
          currentX={x} currentY={y} currentAngle={angle}
          online={online} color={color} dwellSpots={dwellSpots} coordRotationDeg={coordRotationDeg}
          coordOffsetX={props.coordOffsetX} coordOffsetY={props.coordOffsetY} coordScale={props.coordScale}
          activitySegments={playbackActive && playbackData ? playbackData.segments : undefined}
          zoneOverlays={zoneOverlays} routeOverlays={routeOverlays} routeMode={routeMode} followMode={followMode} transitionMarkers={transitionMarkers}
          forkHeight={forkHeight} jackState={jackState} jackIsFull={jackIsFull}
          vehicleIcon={vehicleIcon}
          currentActivity={currentActivity} charging={charging} speed={speed}
          pickMode={pickMode} pickTwoPoint={pickTwoPoint} pickAnchor={pickAnchor} onPointPick={onPointPick} onRectDrawn={onRectDrawn} onZoneClick={onZoneClick} coordEditMode={coordEditMode} zoneEditMode={zoneEditMode} selectedZoneId={selectedZoneId} onZoneSelect={onZoneSelect} onZoneReshape={onZoneReshape}
          playbackActive={playbackActive}
          playbackData={playbackData ?? null}
          playbackTrail={playbackActive && playbackData ? playbackData.trail : null}
          playbackProgress={playbackProgress}
        />

        {/* Top-left: fork height dot indicator */}
        <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none bg-[var(--app-color-surface-container)]/80 rounded px-2 py-1.5">
          {/* Vertical track + dot */}
          <div className="relative w-4 h-40 rounded-full bg-[var(--app-color-border-default)]">
            <div className="absolute left-1/2 -translate-x-1/2 w-8 h-8 rounded-full border-4 border-white shadow-md"
              style={{ bottom: `${forkPct}%`, transform: `translate(-50%, 50%)`, backgroundColor: "#f59e0b", transition: "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[var(--app-color-text-primary)] tabular-nums">{forkHeight != null ? forkHeight.toFixed(4) : "—.——"}</span>
            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">m</span>
          </div>
        </div>

        {/* Top-left (next to fork): jack icon + secondary status */}
        <div className="absolute top-2 left-20 flex flex-col gap-0.5 text-[9px] text-[var(--app-color-text-secondary)] pointer-events-none bg-[var(--app-color-surface-container)]/80 rounded px-1.5 py-1">
          <JackIcon enable={jackEnable} state={jackState} isFull={jackIsFull} mode={jackMode} />
          {jackErrorCode != null && jackErrorCode !== 0 && (
            <span className="text-red-500 font-medium">E{jackErrorCode}</span>
          )}
          {driverEmc && <span className="text-yellow-500 font-medium">EMC</span>}
          {(relocStatus != null && relocStatus !== 1) && <span className="text-yellow-500 font-medium">reloc!</span>}
          {(loadmapStatus != null && loadmapStatus !== 1) && <span className="text-yellow-500 font-medium">map!</span>}
        </div>

        {/* Top-right: ACTION STATE — prominent pill */}
        <div className={`absolute top-2 right-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 border pointer-events-none shadow-sm ${ACTION_STYLE[action.state]}`}>
          {action.icon}
          <span className="text-[12px] font-bold">{action.label}</span>
        </div>

        {/* Bottom-right: station — shift up when timeline shown */}
        {station && (
          <div className="absolute text-[10px] text-[var(--app-color-accent)] font-semibold bg-[var(--app-color-accent-soft)] px-1.5 py-0.5 rounded pointer-events-none"
            style={{ bottom: showTimeline ? 100 : playbackActive ? 30 : 4, right: 8 }}>
            {station}
          </div>
        )}

        {/* Bottom-center: DI channels */}
        {diChannels && diChannels.length > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none bg-[var(--app-color-surface-container)]/80 rounded px-1.5 py-0.5">
            {diChannels.map((ch) => (
              <span key={ch.id}
                className={`inline-flex items-center gap-0.5 text-[8px] ${
                  ch.status ? "text-green-600 font-medium" : "text-gray-400"
                }`}
                title={`DI${ch.id}: ${ch.status ? "闭合" : "断开"} (${ch.source})`}>
                <span className={`w-1.5 h-1.5 rounded-full ${ch.status ? "bg-green-500" : "bg-gray-300"}`} />
                {ch.id}
              </span>
            ))}
          </div>
        )}

        {/* Bottom-left: coordinates + trail count */}
        <div className="absolute bottom-1 left-2 text-[10px] text-[var(--app-color-text-primary)] tabular-nums pointer-events-none bg-[var(--app-color-surface-container)]/80 rounded px-1.5 py-0.5">
          {playbackActive && playbackData
            ? `${playbackData.totalPoints}点 · 回放`
            : (x != null && y != null ? `(${x.toFixed(2)}, ${y.toFixed(2)})` : "—") + ` · ${trail.length}点`
          }
          {!playbackActive && avgSpeed != null && ` · 均${avgSpeed.toFixed(2)}m/s`}
          {!playbackActive && maxSpeed != null && ` · 峰${maxSpeed.toFixed(2)}m/s`}
        </div>

        {/* Alerts panel (bottom-right, below station) */}
        {hasAlerts && (
          <div className="absolute bottom-8 right-2 flex flex-col gap-0.5 pointer-events-none">
            {errors && errors.length > 0 && errors.map((e, i) => (
              <span key={"e" + i} className="text-[8px] text-red-500 bg-red-50 px-1 rounded">{e}</span>
            ))}
            {warnings && warnings.length > 0 && warnings.map((w, i) => (
              <span key={"w" + i} className="text-[8px] text-orange-500 bg-orange-50 px-1 rounded">{w}</span>
            ))}
          </div>
        )}

        {/* ── History playback: loading overlay ── */}
        {playbackLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--app-color-surface-container)]/60 backdrop-blur-sm pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg">
              <span className="text-xs text-[var(--app-color-text-secondary)]">加载回放数据...</span>
            </div>
          </div>
        )}

        {/* ── History playback: error banner ── */}
        {playbackError && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500 text-white text-[10px] font-medium shadow-lg">
            <AlertTriangle size={12} />
            <span>{playbackError}</span>
            <button onClick={onClearPlayback} className="text-white/80 hover:text-white"><X size={11} /></button>
          </div>
        )}

        {/* ── Timeline overlay: peek (clock toggle) or playback scrubber ── */}
        {(showTimeline || playbackActive) && (
        <div className="absolute bottom-1 left-2 right-2 z-20">
          <AgvPlaybackTimeline
            ip={ip}
            playbackActive={!!playbackActive}
            playbackData={playbackData ?? null}
            playbackPlaying={!!playbackPlaying}
            playbackProgress={playbackProgress ?? 1}
            playbackSpeed={playbackSpeed ?? 1}
            playbackLoading={!!playbackLoading}
            onStartPlayback={onStartPlayback ?? (() => {})}
            onClearPlayback={onClearPlayback ?? (() => {})}
            onStopPlayback={onStopPlayback ?? (() => {})}
            onPlaybackPlay={onPlaybackPlay ?? (() => {})}
            onPlaybackPause={onPlaybackPause ?? (() => {})}
            onPlaybackProgress={onPlaybackProgress ?? (() => {})}
            onPlaybackSpeed={onPlaybackSpeed ?? (() => {})}
          />
        </div>
        )}
      </div>
    </div>
  );
}
