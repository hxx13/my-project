import { Fragment, useState } from "react";
import AgvCanvas from "./agvCanvas";
import type { AgvLayer } from "./agvCanvas/types";
import type { TrailPoint } from "./useAgvTrailRef";
import { Zap, Wifi, WifiOff, AlertTriangle, Crosshair, MoveRight, Gauge } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const FORK_MAX_M = 0.1; // 叉臂最大抬升高度（米），视觉条满量程

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
  coordOffsetX?: number;
  coordOffsetY?: number;
  coordScale?: number;
  currentActivity?: string;
}

interface Props {
  agvs: AgvInfo[];
  zoneOverlays?: { id: number; polygonJson: string; color: string; name: string }[];
  routeOverlays?: { id: number; pathJson: string; color: string; name: string; routeType: string }[];
  routeMode?: boolean;
  followMode?: boolean;
  /** Vehicle icon style */
  vehicleIcon?: 'arrow'|'forklift';
  /** 隐藏的 AGV IP 集合 */
  hiddenAgvs?: Set<string>;
  /** 地图选点模式 */
  pickMode?: boolean;
  /** 两点矩形模式（拖拽绘制） */
  pickTwoPoint?: boolean;
  /** 两点矩形模式下的第一个角点锚点 */
  pickAnchor?: { x: number; y: number } | null;
  onPointPick?: (x: number, y: number) => void;
  /** 拖拽绘制矩形完成 */
  onRectDrawn?: (x1: number, y1: number, x2: number, y2: number) => void;
  onZoneClick?: (zoneId: number, name: string, stationPattern?: string) => void;
  zoneEditMode?: boolean;
  /** 编辑模式 */
  coordEditMode?: boolean;
  selectedZoneId?: number | null;
  onZoneSelect?: (id: number | null) => void;
  onZoneReshape?: (id: number, polygonJson: string) => void;
  onCoordFrameMove?: (ip: string, offsetX: number, offsetY: number) => void;
  onCoordFrameScale?: (ip: string, scale: number, offsetX: number, offsetY: number) => void;
  onCoordFrameRotate?: (ip: string, newDeg: number, centerX: number, centerY: number) => void;
}

// ── Compact header row for one AGV ──
function AgvHeaderRow({ info }: { info: AgvInfo }) {
  const {
    ip, label, online, color,
    speed, angle, odo, battery, charging, blocked, emergency,
    confidence, rssi,
    errors, warnings,
  } = info;

  const qc = useQueryClient();
  const pct = battery != null ? Math.round(battery * 100) : null;
  const barColor = pct != null ? (pct <= 20 ? "#ef4444" : pct <= 50 ? "#f59e0b" : "#22c55e") : "#9ca3af";
  const hasAlerts = (errors && errors.length > 0) || (warnings && warnings.length > 0);

  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: online ? color : "#9ca3af" }} />
      <span className="text-[10px] font-semibold text-[var(--app-color-text-primary)] shrink-0">{label}</span>
      {online ? <Wifi size={10} className="text-green-500 shrink-0" /> : <WifiOff size={10} className="text-red-400 shrink-0" />}

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

      <span className="w-px h-3 bg-[var(--app-color-border-default)]" />

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
  const { agvs, zoneOverlays, routeOverlays, routeMode, followMode, vehicleIcon, hiddenAgvs, pickMode, pickTwoPoint, pickAnchor, onPointPick, onRectDrawn, onZoneClick, coordEditMode, zoneEditMode, selectedZoneId, onZoneSelect, onZoneReshape, onCoordFrameMove, onCoordFrameScale, onCoordFrameRotate } = props;
  const [followTargetIp, setFollowTargetIp] = useState<string | null>(agvs[0]?.ip ?? null);

  // ── Build AgvLayer[] for unified canvas ──
  const layers: AgvLayer[] = agvs.map(agv => ({
    ip: agv.ip,
    label: agv.label,
    color: agv.color,
    visible: !hiddenAgvs?.has(agv.ip),
    trail: agv.trail,
    currentX: agv.x, currentY: agv.y, currentAngle: agv.angle,
    online: agv.online,
    dwellSpots: agv.dwellSpots,
    forkHeight: agv.forkHeight, jackState: agv.jackState, jackIsFull: agv.jackIsFull,
    coordOffsetX: agv.coordOffsetX, coordOffsetY: agv.coordOffsetY,
    coordRotationDeg: agv.coordRotationDeg, coordScale: agv.coordScale,
    currentActivity: agv.currentActivity, charging: agv.charging, speed: agv.speed,
  }));

  return (
    <div className="flex flex-col h-full min-h-0 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] overflow-hidden"
      data-agv-dual-quadrant={agvs.map(a => a.ip).join("+")}>

      {/* ── Follow target selector (visible only in follow mode) ── */}
      {followMode && (
        <div className="shrink-0 flex items-center gap-1 px-3 py-0.5 bg-[var(--app-color-accent-soft)] border-b border-[var(--app-color-border-default)]">
          <span className="text-[9px] text-[var(--app-color-text-secondary)]">跟随:</span>
          {agvs.map(agv => (
            <button key={agv.ip} onClick={() => setFollowTargetIp(agv.ip)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${followTargetIp === agv.ip ? "bg-[var(--app-color-accent)] text-white" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}>
              {agv.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Header: N AGV info rows side by side ── */}
      <div className="shrink-0 flex items-stretch border-b border-[var(--app-color-border-default)]">
        {agvs.map((agv, i) => (
          <Fragment key={agv.ip}>
            {i > 0 && <div className="w-px bg-[var(--app-color-border-default)]" />}
            <div className={`flex-1 px-3 py-1 min-w-0 transition-opacity ${hiddenAgvs?.has(agv.ip) ? "opacity-20" : ""}`}>
              <AgvHeaderRow info={agv} />
            </div>
          </Fragment>
        ))}
      </div>

      {/* ── Canvas with per-car fork height indicators ── */}
      <div className="flex-1 min-h-0 relative">
        <AgvCanvas
          layers={layers}
          zoneOverlays={zoneOverlays}
          routeOverlays={routeOverlays}
          routeMode={routeMode}
          followMode={followMode}
          followTargetIp={followMode ? followTargetIp : null}
          vehicleIcon={vehicleIcon}
          hiddenAgvs={hiddenAgvs}
          pickMode={pickMode} pickTwoPoint={pickTwoPoint} pickAnchor={pickAnchor}
          onPointPick={onPointPick} onRectDrawn={onRectDrawn} onZoneClick={onZoneClick}
          coordEditMode={coordEditMode} zoneEditMode={zoneEditMode}
          selectedZoneId={selectedZoneId} onZoneSelect={onZoneSelect}
          onZoneReshape={onZoneReshape}
          onCoordFrameMove={onCoordFrameMove} onCoordFrameScale={onCoordFrameScale}
          onCoordFrameRotate={onCoordFrameRotate}
        />

        {/* 每车叉臂抬升指示器 — 横向排列，不遮挡 */}
        <div className="absolute top-2 left-2 flex items-start gap-2 pointer-events-none flex-wrap">
          {agvs.map(agv => {
            const fPct = agv.forkHeight != null ? Math.min(1, Math.max(0, agv.forkHeight / FORK_MAX_M)) * 100 : 0;
            return (
              <div key={agv.ip} className="flex items-center gap-1.5 bg-[var(--app-color-surface-container)]/80 rounded px-1.5 py-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: agv.color }} />
                <div className="relative w-2.5 h-24 rounded-full bg-[var(--app-color-border-default)]">
                  <div className="absolute left-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 border-white shadow-md"
                    style={{ bottom: `${fPct}%`, transform: `translate(-50%, 50%)`, backgroundColor: agv.color, transition: "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-semibold text-[var(--app-color-text-primary)]">{agv.label}</span>
                  <span className="text-[8px] text-[var(--app-color-text-secondary)] tabular-nums">{agv.forkHeight != null ? agv.forkHeight.toFixed(3) : "—"} m</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
