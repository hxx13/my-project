import type { TrailPoint } from "../useAgvTrailRef";
import type { AgvTrajectoryRow, HistoryPlaybackResponse } from "@/api/domains/agv.api";

export interface AgvLayer {
  ip: string;
  label: string;
  color: string;
  visible: boolean;
  trail: TrailPoint[];
  currentX: number | null;
  currentY: number | null;
  currentAngle: number | null;
  online: boolean;
  dwellSpots?: { x: number; y: number; durationSec: number }[];
  forkHeight?: number | null;
  jackState?: number | null;
  jackIsFull?: boolean | null;
  coordOffsetX?: number;
  coordOffsetY?: number;
  coordRotationDeg?: number;
  coordScale?: number;
  currentActivity?: string;
  charging?: boolean | null;
  speed?: number | null;
}

export interface ZoneOverlay {
  id: number;
  polygonJson: string;
  color: string;
  name: string;
  robotIp?: string;
  source?: string;
  stationPattern?: string;
}

export interface RouteOverlay {
  id: number;
  pathJson: string;
  color: string;
  name: string;
  routeType: string;
  robotIp?: string;
}

export interface AgvCanvasProps {
  layers: AgvLayer[];
  zoneOverlays?: ZoneOverlay[];
  routeOverlays?: RouteOverlay[];
  routeMode?: boolean;
  followMode?: boolean;
  followTargetIp?: string | null;
  vehicleIcon?: "arrow" | "forklift";
  hiddenAgvs?: Set<string>;
  pickMode?: boolean;
  pickTwoPoint?: boolean;
  pickAnchor?: { x: number; y: number } | null;
  onPointPick?: (x: number, y: number) => void;
  onRectDrawn?: (x1: number, y1: number, x2: number, y2: number) => void;
  onZoneClick?: (zoneId: number, name: string, stationPattern?: string) => void;
  coordEditMode?: boolean;
  zoneEditMode?: boolean;
  selectedZoneId?: number | null;
  onZoneSelect?: (id: number | null) => void;
  onZoneReshape?: (id: number, polygonJson: string) => void;
  onCoordFrameMove?: (ip: string, offsetX: number, offsetY: number) => void;
  onCoordFrameScale?: (ip: string, scale: number, offsetX: number, offsetY: number) => void;
  onCoordFrameRotate?: (ip: string, newDeg: number, centerX: number, centerY: number) => void;
  playbackActive?: boolean;
  playbackData?: HistoryPlaybackResponse | null;
  playbackTrail?: AgvTrajectoryRow[] | null;
  playbackProgress?: number;
  playbackProgressRef?: React.MutableRefObject<number>;
}
