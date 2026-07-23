/** 拖拽 orb 外框尺寸（px）与贴边留白 */
export const DEFAULT_ORB_BOX = 84;
export const EDGE_MARGIN = 16;

export type ScanAssistantDockEdge = "top" | "bottom" | "left" | "right";

export type ScanAssistantDockPosition = {
  x: number;
  y: number;
  edge: ScanAssistantDockEdge;
};

export type SnapBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  midX: number;
  midY: number;
  vw: number;
  vh: number;
};

function roundPx(value: number): number {
  return Math.round(value);
}

export function readSafeInsets() {
  if (typeof window === "undefined") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:env(safe-area-inset-top);right:env(safe-area-inset-right);bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left);visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  document.body.removeChild(probe);
  return {
    top: rect.top,
    right: window.innerWidth - rect.right,
    bottom: window.innerHeight - rect.bottom,
    left: rect.left,
  };
}

/** 精确计算 orb 左上角可放置范围（px，不含 transform） */
export function getSnapBounds(orbBox: number): SnapBounds {
  const safe = readSafeInsets();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const minX = roundPx(safe.left + EDGE_MARGIN);
  const maxX = roundPx(vw - orbBox - safe.right - EDGE_MARGIN);
  const minY = roundPx(safe.top + EDGE_MARGIN);
  const maxY = roundPx(vh - orbBox - safe.bottom - EDGE_MARGIN);

  const safeMinX = Math.min(minX, maxX);
  const safeMaxX = Math.max(minX, maxX);
  const safeMinY = Math.min(minY, maxY);
  const safeMaxY = Math.max(minY, maxY);

  return {
    minX: safeMinX,
    maxX: safeMaxX,
    minY: safeMinY,
    maxY: safeMaxY,
    midX: roundPx(safeMinX + (safeMaxX - safeMinX) / 2),
    midY: roundPx(safeMinY + (safeMaxY - safeMinY) / 2),
    vw,
    vh,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type EdgeSnapCandidate = {
  edge: ScanAssistantDockEdge;
  dist: number;
  x: number;
  y: number;
};

/**
 * 贴最近边吸附：orb 中心到四条边的距离取最小，投影到该边并在平行轴上保留拖拽位置（clamp）。
 * 沿底边拖动时 x 连续变化、y 固定为 maxY，不再跳转到 8 个离散锚点。
 */
export function snapPosition(
  x: number,
  y: number,
  orbBox: number,
): ScanAssistantDockPosition {
  const bounds = getSnapBounds(orbBox);
  const half = orbBox / 2;
  const cx = x + half;
  const cy = y + half;

  const clampedX = clamp(x, bounds.minX, bounds.maxX);
  const clampedY = clamp(y, bounds.minY, bounds.maxY);

  const candidates: EdgeSnapCandidate[] = [
    {
      edge: "left",
      dist: Math.abs(cx - (bounds.minX + half)),
      x: bounds.minX,
      y: clamp(clampedY, bounds.minY, bounds.maxY),
    },
    {
      edge: "right",
      dist: Math.abs(cx - (bounds.maxX + half)),
      x: bounds.maxX,
      y: clamp(clampedY, bounds.minY, bounds.maxY),
    },
    {
      edge: "top",
      dist: Math.abs(cy - (bounds.minY + half)),
      x: clamp(clampedX, bounds.minX, bounds.maxX),
      y: bounds.minY,
    },
    {
      edge: "bottom",
      dist: Math.abs(cy - (bounds.maxY + half)),
      x: clamp(clampedX, bounds.minX, bounds.maxX),
      y: bounds.maxY,
    },
  ];

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].dist < best.dist) best = candidates[i];
  }

  return { x: best.x, y: best.y, edge: best.edge };
}

export function defaultBottomRight(orbBox: number): ScanAssistantDockPosition {
  const bounds = getSnapBounds(orbBox);
  return { x: bounds.maxX, y: bounds.maxY, edge: "bottom" };
}

/** 拖拽过程中限制在合法范围内，不做吸附 */
export function clampDragPosition(
  x: number,
  y: number,
  orbBox: number,
): Pick<ScanAssistantDockPosition, "x" | "y"> {
  const bounds = getSnapBounds(orbBox);
  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    y: clamp(y, bounds.minY, bounds.maxY),
  };
}

/** 视口变化后：先 clamp 再贴边，保持沿边连续位置 */
export function rebalancePosition(
  position: Pick<ScanAssistantDockPosition, "x" | "y">,
  orbBox: number,
): ScanAssistantDockPosition {
  const clamped = clampDragPosition(position.x, position.y, orbBox);
  return snapPosition(clamped.x, clamped.y, orbBox);
}

/** 旧版 localStorage 锚点 id → 精确坐标（仅迁移） */
const LEGACY_ANCHOR_COORDS: Record<
  string,
  (b: SnapBounds) => { x: number; y: number; edge: ScanAssistantDockEdge }
> = {
  "top-left": (b) => ({ x: b.minX, y: b.minY, edge: "top" }),
  "top-right": (b) => ({ x: b.maxX, y: b.minY, edge: "top" }),
  "bottom-left": (b) => ({ x: b.minX, y: b.maxY, edge: "bottom" }),
  "bottom-right": (b) => ({ x: b.maxX, y: b.maxY, edge: "bottom" }),
  top: (b) => ({ x: b.midX, y: b.minY, edge: "top" }),
  bottom: (b) => ({ x: b.midX, y: b.maxY, edge: "bottom" }),
  left: (b) => ({ x: b.minX, y: b.midY, edge: "left" }),
  right: (b) => ({ x: b.maxX, y: b.midY, edge: "right" }),
};

export function migrateLegacyAnchor(
  anchor: string,
  orbBox: number,
): ScanAssistantDockPosition | null {
  const resolver = LEGACY_ANCHOR_COORDS[anchor];
  if (!resolver) return null;
  const bounds = getSnapBounds(orbBox);
  return resolver(bounds);
}
