import { EDGE_MARGIN, getSnapBounds, readSafeInsets, type ScanAssistantDockEdge } from "./snapGeometry";

/** 气泡相对 orb 的四向锚点（正上/正下/正左/正右） */
export type BubblePlacement = "top" | "bottom" | "left" | "right";

export type BubbleRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type BubbleLayout = {
  placement: BubblePlacement;
  crossAxisOffset: number;
};

export type BubbleSize = {
  width: number;
  height: number;
};

export const BUBBLE_GAP_PX = 14;

/** 与 scanAssistantDock.css 中 --scan-assistant-bubble-* 对齐 */
export const BUBBLE_LAYOUT_MAX_WIDTH_PX = 520;
export const BUBBLE_LAYOUT_MIN_WIDTH_PX = 360;
export const BUBBLE_LAYOUT_ESTIMATED_HEIGHT_PX = 240;

const MIN_VERTICAL_SPACE_PX = 120;
const MIN_HORIZONTAL_SPACE_PX = 180;

const OPPOSITE_PLACEMENT: Record<BubblePlacement, BubblePlacement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

const ALL_PLACEMENTS: BubblePlacement[] = ["top", "bottom", "left", "right"];

function pickBestPlacement(
  orbX: number,
  orbY: number,
  orbBox: number,
  bounds: ReturnType<typeof getSnapBounds>,
): BubblePlacement {
  const cy = orbY + orbBox / 2;
  const cx = orbX + orbBox / 2;

  const spaceAbove = orbY - bounds.minY;
  const spaceBelow = bounds.maxY - (orbY + orbBox);
  const spaceLeft = orbX - bounds.minX;
  const spaceRight = bounds.maxX - (orbX + orbBox);

  const primaryVertical: BubblePlacement = cy < bounds.midY ? "bottom" : "top";
  const primaryVerticalSpace = primaryVertical === "bottom" ? spaceBelow : spaceAbove;

  if (primaryVerticalSpace >= MIN_VERTICAL_SPACE_PX) {
    return primaryVertical;
  }

  const secondaryHorizontal: BubblePlacement = cx < bounds.midX ? "right" : "left";
  const secondaryHorizontalSpace = secondaryHorizontal === "right" ? spaceRight : spaceLeft;

  if (secondaryHorizontalSpace >= MIN_HORIZONTAL_SPACE_PX) {
    return secondaryHorizontal;
  }

  if (spaceAbove >= spaceBelow && spaceAbove >= spaceLeft && spaceAbove >= spaceRight) return "top";
  if (spaceBelow >= spaceAbove && spaceBelow >= spaceLeft && spaceBelow >= spaceRight) return "bottom";
  if (spaceLeft >= spaceRight) return "left";
  return "right";
}

function pickHorizontalPlacement(
  preferred: "left" | "right",
  orbX: number,
  orbY: number,
  orbBox: number,
  bounds: ReturnType<typeof getSnapBounds>,
): BubblePlacement {
  const spaceLeft = orbX - bounds.minX;
  const spaceRight = bounds.maxX - (orbX + orbBox);
  const preferredSpace = preferred === "right" ? spaceRight : spaceLeft;
  const fallback: BubblePlacement = preferred === "right" ? "left" : "right";
  const fallbackSpace = preferred === "right" ? spaceLeft : spaceRight;

  if (preferredSpace >= MIN_HORIZONTAL_SPACE_PX) {
    return preferred;
  }
  if (fallbackSpace >= MIN_HORIZONTAL_SPACE_PX) {
    return fallback;
  }

  return pickBestPlacement(orbX, orbY, orbBox, bounds);
}

/**
 * 根据 orb 贴边方向与视口空间决定气泡方向。
 * 左右贴边时气泡出现在 orb 对侧；上下贴边时优先垂直方向。
 */
export function computeBubblePlacement(
  orbX: number,
  orbY: number,
  orbBox: number,
  dockEdge?: ScanAssistantDockEdge,
): BubblePlacement {
  if (typeof window === "undefined") {
    return "bottom";
  }

  const bounds = getSnapBounds(orbBox);

  if (dockEdge === "left") {
    return pickHorizontalPlacement("right", orbX, orbY, orbBox, bounds);
  }
  if (dockEdge === "right") {
    return pickHorizontalPlacement("left", orbX, orbY, orbBox, bounds);
  }

  return pickBestPlacement(orbX, orbY, orbBox, bounds);
}

export function estimateBubbleSize(viewportWidth?: number): BubbleSize {
  const vw = viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1280);
  return {
    width: Math.min(BUBBLE_LAYOUT_MAX_WIDTH_PX, Math.max(BUBBLE_LAYOUT_MIN_WIDTH_PX, vw - 48)),
    height: BUBBLE_LAYOUT_ESTIMATED_HEIGHT_PX,
  };
}

/** 气泡内容区允许贴边的视口范围（含 safe-area） */
export function getBubbleViewportBounds() {
  if (typeof window === "undefined") {
    return {
      minX: EDGE_MARGIN,
      minY: EDGE_MARGIN,
      maxX: 1280 - EDGE_MARGIN,
      maxY: 720 - EDGE_MARGIN,
      vw: 1280,
      vh: 720,
    };
  }

  const safe = readSafeInsets();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return {
    minX: safe.left + EDGE_MARGIN,
    minY: safe.top + EDGE_MARGIN,
    maxX: vw - safe.right - EDGE_MARGIN,
    maxY: vh - safe.bottom - EDGE_MARGIN,
    vw,
    vh,
  };
}

export function computeBubbleRect(
  placement: BubblePlacement,
  orbX: number,
  orbY: number,
  orbBox: number,
  bubbleSize: BubbleSize,
  crossAxisOffset = 0,
  gap = BUBBLE_GAP_PX,
): BubbleRect {
  const { width, height } = bubbleSize;
  const orbCenterX = orbX + orbBox / 2;
  const orbCenterY = orbY + orbBox / 2;

  switch (placement) {
    case "bottom": {
      const left = orbCenterX - width / 2 + crossAxisOffset;
      const top = orbY + orbBox + gap;
      return { left, top, right: left + width, bottom: top + height };
    }
    case "top": {
      const left = orbCenterX - width / 2 + crossAxisOffset;
      const bottom = orbY - gap;
      return { left, top: bottom - height, right: left + width, bottom };
    }
    case "right": {
      const left = orbX + orbBox + gap;
      const top = orbCenterY - height / 2 + crossAxisOffset;
      return { left, top, right: left + width, bottom: top + height };
    }
    case "left": {
      const right = orbX - gap;
      const top = orbCenterY - height / 2 + crossAxisOffset;
      return { left: right - width, top, right, bottom: top + height };
    }
  }
}

export function bubbleFitsViewport(rect: BubbleRect, viewport = getBubbleViewportBounds()): boolean {
  return (
    rect.left >= viewport.minX &&
    rect.right <= viewport.maxX &&
    rect.top >= viewport.minY &&
    rect.bottom <= viewport.maxY
  );
}

function measureViewportOverflow(rect: BubbleRect, viewport: ReturnType<typeof getBubbleViewportBounds>) {
  const left = Math.max(0, viewport.minX - rect.left);
  const top = Math.max(0, viewport.minY - rect.top);
  const right = Math.max(0, rect.right - viewport.maxX);
  const bottom = Math.max(0, rect.bottom - viewport.maxY);
  return left + top + right + bottom;
}

function rankPlacementCandidates(
  preferred: BubblePlacement,
  dockEdge?: ScanAssistantDockEdge,
): BubblePlacement[] {
  const ordered: BubblePlacement[] = [preferred, OPPOSITE_PLACEMENT[preferred]];

  if (dockEdge === "left" || dockEdge === "right") {
    ordered.push("top", "bottom");
  } else if (dockEdge === "top" || dockEdge === "bottom") {
    ordered.push("left", "right");
  }

  for (const placement of ALL_PLACEMENTS) {
    if (!ordered.includes(placement)) {
      ordered.push(placement);
    }
  }

  return ordered;
}

function clampCrossAxisOffset(
  placement: BubblePlacement,
  orbX: number,
  orbY: number,
  orbBox: number,
  bubbleSize: BubbleSize,
  gap = BUBBLE_GAP_PX,
): number {
  const viewport = getBubbleViewportBounds();
  const rect = computeBubbleRect(placement, orbX, orbY, orbBox, bubbleSize, 0, gap);

  if (placement === "top" || placement === "bottom") {
    let offset = 0;
    if (rect.left < viewport.minX) {
      offset += viewport.minX - rect.left;
    }
    if (rect.right > viewport.maxX) {
      offset -= rect.right - viewport.maxX;
    }
    return offset;
  }

  let offset = 0;
  if (rect.top < viewport.minY) {
    offset += viewport.minY - rect.top;
  }
  if (rect.bottom > viewport.maxY) {
    offset -= rect.bottom - viewport.maxY;
  }
  return offset;
}

/**
 * 默认锚点完全落在视口内时沿用 {@link computeBubblePlacement}；
 * 否则按候选顺序切换锚点；仍溢出时对当前方向做正交轴平移钳制。
 */
export function resolveBubbleLayout(
  orbX: number,
  orbY: number,
  orbBox: number,
  dockEdge?: ScanAssistantDockEdge,
  bubbleSize?: BubbleSize | null,
): BubbleLayout {
  const defaultPlacement = computeBubblePlacement(orbX, orbY, orbBox, dockEdge);
  const viewport = getBubbleViewportBounds();
  const resolvedSize = bubbleSize ?? estimateBubbleSize(viewport.vw);

  const defaultRect = computeBubbleRect(
    defaultPlacement,
    orbX,
    orbY,
    orbBox,
    resolvedSize,
  );
  if (bubbleFitsViewport(defaultRect, viewport)) {
    return { placement: defaultPlacement, crossAxisOffset: 0 };
  }

  const candidates = rankPlacementCandidates(defaultPlacement, dockEdge);
  for (let i = 1; i < candidates.length; i += 1) {
    const placement = candidates[i];
    const rect = computeBubbleRect(placement, orbX, orbY, orbBox, resolvedSize);
    if (bubbleFitsViewport(rect, viewport)) {
      return { placement, crossAxisOffset: 0 };
    }
  }

  let bestPlacement = defaultPlacement;
  let bestOverflow = measureViewportOverflow(defaultRect, viewport);

  for (let i = 1; i < candidates.length; i += 1) {
    const placement = candidates[i];
    const rect = computeBubbleRect(placement, orbX, orbY, orbBox, resolvedSize);
    const overflow = measureViewportOverflow(rect, viewport);
    if (overflow < bestOverflow) {
      bestOverflow = overflow;
      bestPlacement = placement;
    }
  }

  const crossAxisOffset = clampCrossAxisOffset(
    bestPlacement,
    orbX,
    orbY,
    orbBox,
    resolvedSize,
  );

  return { placement: bestPlacement, crossAxisOffset };
}

function placementTransform(placement: BubblePlacement, crossAxisOffset: number): string {
  if (placement === "top" || placement === "bottom") {
    if (crossAxisOffset === 0) return "translateX(-50%)";
    return `translateX(calc(-50% + ${crossAxisOffset}px))`;
  }
  if (crossAxisOffset === 0) return "translateY(-50%)";
  return `translateY(calc(-50% + ${crossAxisOffset}px))`;
}

/**
 * 由 orb 外接矩形与方向计算气泡锚点（px，相对 dock 左上角）。
 * 正交轴上与 orb 中心对齐；主轴上留出 gap。
 */
export function computeBubblePositionStyle(
  placement: BubblePlacement,
  orbBox: number,
  gap = BUBBLE_GAP_PX,
  crossAxisOffset = 0,
): Record<string, string> {
  const half = orbBox / 2;
  const transform = placementTransform(placement, crossAxisOffset);

  switch (placement) {
    case "top":
      return {
        left: `${half}px`,
        bottom: `${orbBox + gap}px`,
        transform,
      };
    case "bottom":
      return {
        left: `${half}px`,
        top: `${orbBox + gap}px`,
        transform,
      };
    case "left":
      return {
        top: `${half}px`,
        right: `${orbBox + gap}px`,
        transform,
      };
    case "right":
      return {
        top: `${half}px`,
        left: `${orbBox + gap}px`,
        transform,
      };
  }
}
