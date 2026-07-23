import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/useTypewriterText";
import {
  computeBubblePlacement,
  computeBubblePositionStyle,
  resolveBubbleLayout,
  type BubblePlacement,
  type BubbleSize,
} from "./computeBubblePlacement";
import {
  clampDragPosition,
  DEFAULT_ORB_BOX,
  defaultBottomRight,
  migrateLegacyAnchor,
  rebalancePosition,
  snapPosition,
  type ScanAssistantDockEdge,
  type ScanAssistantDockPosition,
} from "./snapGeometry";

const STORAGE_KEY = "scan-assistant-dock-v2";

type DragSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
};

type UseScanAssistantDragOptions = {
  orbBox?: number;
  enabled?: boolean;
  /** 指针抬起且位移低于阈值时视为点击（非拖拽） */
  onOrbClick?: () => void;
  /** 气泡展开时传入实测尺寸，提升贴边时的锚点判断精度 */
  bubbleSize?: BubbleSize | null;
  /** 为 false 时始终使用原始锚点逻辑（不启用视口钳制） */
  constrainBubbleViewport?: boolean;
};

const CLICK_DRAG_THRESHOLD_PX = 6;

type StoredDockPosition = {
  x?: number;
  y?: number;
  /** 旧版 8 锚点 id，读取后迁移为 x/y */
  anchor?: string;
};

function loadStoredPosition(orbBox: number): ScanAssistantDockPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDockPosition;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return snapPosition(parsed.x, parsed.y, orbBox);
    }
    if (typeof parsed.anchor === "string") {
      const migrated = migrateLegacyAnchor(parsed.anchor, orbBox);
      if (migrated) return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

function persistPosition(position: ScanAssistantDockPosition) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        x: position.x,
        y: position.y,
      }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function useScanAssistantDrag(options: UseScanAssistantDragOptions = {}) {
  const orbBox = options.orbBox ?? DEFAULT_ORB_BOX;
  const enabled = options.enabled ?? true;
  const onOrbClick = options.onOrbClick;
  const bubbleSize = options.bubbleSize ?? null;
  const constrainBubbleViewport = options.constrainBubbleViewport ?? true;
  const reducedMotion = usePrefersReducedMotion();
  const dragSessionRef = useRef<DragSession | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<ScanAssistantDockPosition>(() =>
    loadStoredPosition(orbBox) ?? defaultBottomRight(orbBox),
  );

  const rebalanceOnResize = useCallback(() => {
    setPosition((prev) => {
      const next = rebalancePosition(prev, orbBox);
      persistPosition(next);
      return next;
    });
  }, [orbBox]);

  useEffect(() => {
    window.addEventListener("resize", rebalanceOnResize);
    return () => window.removeEventListener("resize", rebalanceOnResize);
  }, [rebalanceOnResize]);

  const onOrbPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || event.button !== 0) return;
      event.preventDefault();
      dragSessionRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: position.x,
        originY: position.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    },
    [enabled, position.x, position.y],
  );

  const onOrbPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const dx = event.clientX - session.startClientX;
      const dy = event.clientY - session.startClientY;
      const clamped = clampDragPosition(session.originX + dx, session.originY + dy, orbBox);
      setPosition((prev) => ({
        ...clamped,
        edge: prev.edge,
      }));
    },
    [orbBox],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      const dx = event.clientX - session.startClientX;
      const dy = event.clientY - session.startClientY;
      const moved = Math.hypot(dx, dy);
      const wasClick = moved < CLICK_DRAG_THRESHOLD_PX;

      dragSessionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setIsDragging(false);
      setPosition((prev) => {
        const snapped = snapPosition(prev.x, prev.y, orbBox);
        persistPosition(snapped);
        return snapped;
      });

      if (wasClick) {
        onOrbClick?.();
      }
    },
    [onOrbClick, orbBox],
  );

  const dockEdge: ScanAssistantDockEdge = useMemo(
    () => snapPosition(position.x, position.y, orbBox).edge,
    [position.x, position.y, orbBox],
  );

  const bubbleLayout = useMemo(() => {
    if (!constrainBubbleViewport) {
      return {
        placement: computeBubblePlacement(position.x, position.y, orbBox, dockEdge),
        crossAxisOffset: 0,
      };
    }
    return resolveBubbleLayout(position.x, position.y, orbBox, dockEdge, bubbleSize);
  }, [
    bubbleSize,
    constrainBubbleViewport,
    dockEdge,
    orbBox,
    position.x,
    position.y,
  ]);

  const bubblePlacement: BubblePlacement = bubbleLayout.placement;

  const bubblePositionStyle = useMemo(
    () =>
      computeBubblePositionStyle(
        bubblePlacement,
        orbBox,
        undefined,
        bubbleLayout.crossAxisOffset,
      ),
    [bubbleLayout.crossAxisOffset, bubblePlacement, orbBox],
  );

  const dockStyle = useMemo(
    () =>
      ({
        left: `${position.x}px`,
        top: `${position.y}px`,
        ["--scan-assistant-orb-box" as string]: `${orbBox}px`,
        transition:
          isDragging || reducedMotion
            ? "none"
            : "left 220ms cubic-bezier(0.25, 1, 0.5, 1), top 220ms cubic-bezier(0.25, 1, 0.5, 1)",
      }) as const,
    [isDragging, orbBox, position.x, position.y, reducedMotion],
  );

  return {
    orbBox,
    position,
    isDragging,
    dockStyle,
    bubblePlacement,
    bubblePositionStyle,
    orbDragHandlers: {
      onPointerDown: onOrbPointerDown,
      onPointerMove: onOrbPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}

export type { ScanAssistantDockPosition };
