import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { DigitalTwinScreenConfig, RoomCellModel } from "@/features/digital-twin-screen/types";
import type { RoomLayoutEntry, RoomVisualPresetId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { clampRoomTopLeftToPlate, clamp01, snapGrid } from "@/features/digital-twin-screen/layout/planGeometry";
import { placeholderRoomCell, RoomTileVisual } from "@/features/digital-twin-screen/layout/RoomTileVisual";

const ROOM_RESIZE_MIN = 0.04;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

type ActiveDrag =
  | { kind: "none" }
  | {
      kind: "move";
      roomId: string;
      startPointerNorm: { x: number; y: number };
      startRect: RoomLayoutEntry;
      snapshotRooms: RoomLayoutEntry[];
    }
  | {
      kind: "resize";
      roomId: string;
      handle: ResizeHandle;
      startPointerNorm: { x: number; y: number };
      startRect: RoomLayoutEntry;
      snapshotRooms: RoomLayoutEntry[];
    };

function cloneRooms(rooms: RoomLayoutEntry[]): RoomLayoutEntry[] {
  return rooms.map((r) => ({ ...r }));
}

function clientToNorm(e: React.PointerEvent | PointerEvent, el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return {
    x: clamp01((e.clientX - r.left) / Math.max(1, r.width)),
    y: clamp01((e.clientY - r.top) / Math.max(1, r.height)),
  };
}

function applyResize(handle: ResizeHandle, start: RoomLayoutEntry, dx: number, dy: number): RoomLayoutEntry {
  let { nx, ny, nw, nh } = start;
  switch (handle) {
    case "se":
      nw = start.nw + dx;
      nh = start.nh + dy;
      break;
    case "sw":
      nx = start.nx + dx;
      nw = start.nw - dx;
      nh = start.nh + dy;
      break;
    case "ne":
      ny = start.ny + dy;
      nw = start.nw + dx;
      nh = start.nh - dy;
      break;
    case "nw":
      nx = start.nx + dx;
      ny = start.ny + dy;
      nw = start.nw - dx;
      nh = start.nh - dy;
      break;
    default:
      break;
  }
  nw = Math.max(ROOM_RESIZE_MIN, nw);
  nh = Math.max(ROOM_RESIZE_MIN, nh);
  const clamped = clampRoomTopLeftToPlate(nx, ny, nw, nh, start.rotationDeg);
  return { ...start, nx: clamped.nx, ny: clamped.ny, nw, nh };
}

export function RoomLayoutEditor({
  plateRef,
  roomsLayout,
  onRoomsChange,
  telemetryByRoomId,
  config,
  roomSnapGrid,
  selectedRoomId,
  onSelectRoom,
  onLayoutGestureStart,
  onLayoutGestureEnd,
  /** 仅展示：命中与拖拽由 SceneEditSurface 统一处理（见 post-save-no-full-refresh / 图层架构） */
  presentationOnly = false,
  roomVisualPreset = "isoSoft",
  /** 可选：挂到房间区 flex-1 容器，供父级 DEV 校验 offsetHeight（编辑态 ductScene 对齐） */
  roomsAreaMetricsRef,
  /** 多选高亮：存在时用于描边，否则仅用 selectedRoomId */
  highlightRoomIds = null,
}: {
  plateRef: React.RefObject<HTMLElement | null>;
  roomsLayout: RoomLayoutEntry[];
  onRoomsChange: (next: RoomLayoutEntry[]) => void;
  telemetryByRoomId: Map<string, RoomCellModel>;
  config: DigitalTwinScreenConfig;
  roomSnapGrid: number;
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  /** 一次拖拽/resize 开始时由页面记录 undo 基线 */
  onLayoutGestureStart?: () => void;
  /** pointerup 且发生过位移时调用，由页面决定是否入 undo 栈 */
  onLayoutGestureEnd?: () => void;
  presentationOnly?: boolean;
  roomVisualPreset?: RoomVisualPresetId;
  roomsAreaMetricsRef?: RefObject<HTMLDivElement | null>;
  highlightRoomIds?: ReadonlySet<string> | null;
}) {
  const dragRef = useRef<ActiveDrag>({ kind: "none" });
  const plateRefStable = plateRef;
  const roomSnapGridRef = useRef(roomSnapGrid);
  const onRoomsChangeRef = useRef(onRoomsChange);
  const onLayoutGestureStartRef = useRef(onLayoutGestureStart);
  const onLayoutGestureEndRef = useRef(onLayoutGestureEnd);
  const onSelectRoomRef = useRef(onSelectRoom);
  const pendingRoomsRef = useRef<RoomLayoutEntry[] | null>(null);
  const rafIdRef = useRef(0);

  useLayoutEffect(() => {
    roomSnapGridRef.current = roomSnapGrid;
  }, [roomSnapGrid]);
  useLayoutEffect(() => {
    onRoomsChangeRef.current = onRoomsChange;
  }, [onRoomsChange]);
  useLayoutEffect(() => {
    onLayoutGestureStartRef.current = onLayoutGestureStart;
  }, [onLayoutGestureStart]);
  useLayoutEffect(() => {
    onLayoutGestureEndRef.current = onLayoutGestureEnd;
  }, [onLayoutGestureEnd]);
  useLayoutEffect(() => {
    onSelectRoomRef.current = onSelectRoom;
  }, [onSelectRoom]);

  const flushPendingRooms = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
    const v = pendingRoomsRef.current;
    pendingRoomsRef.current = null;
    if (v) {
      // 保存后仅合并 rooms，禁止整表 load — post-save-no-full-refresh.mdc
      onRoomsChangeRef.current(v);
    }
  }, []);

  const scheduleRoomsCommit = useCallback((next: RoomLayoutEntry[]) => {
    pendingRoomsRef.current = next;
    if (rafIdRef.current) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = 0;
      const v = pendingRoomsRef.current;
      pendingRoomsRef.current = null;
      if (v) onRoomsChangeRef.current(v);
    });
  }, []);

  const applyMoveOrResize = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    const plate = plateRefStable.current;
    if (d.kind === "none" || !plate) return;
    const cur = clientToNorm(e, plate);
    const dx = cur.x - d.startPointerNorm.x;
    const dy = cur.y - d.startPointerNorm.y;
    const snap = roomSnapGridRef.current;
    const next = cloneRooms(d.snapshotRooms);
    const idx = next.findIndex((r) => r.roomId === d.roomId);
    if (idx < 0) return;

    if (d.kind === "move") {
      let nx = d.startRect.nx + dx;
      let ny = d.startRect.ny + dy;
      if (snap > 0) {
        const s = snapGrid(nx, ny, snap);
        nx = s.x;
        ny = s.y;
      }
      const c = clampRoomTopLeftToPlate(nx, ny, d.startRect.nw, d.startRect.nh, d.startRect.rotationDeg);
      next[idx] = { ...d.startRect, nx: c.nx, ny: c.ny };
    } else {
      next[idx] = applyResize(d.handle, d.startRect, dx, dy);
    }
    scheduleRoomsCommit(next);
  }, [plateRefStable, scheduleRoomsCommit]);

  useEffect(() => {
    if (presentationOnly) return;
    const onMove = (e: PointerEvent) => applyMoveOrResize(e);
    const onUp = () => {
      flushPendingRooms();
      const had = dragRef.current.kind !== "none";
      dragRef.current = { kind: "none" };
      if (had) window.setTimeout(() => onLayoutGestureEndRef.current?.(), 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyMoveOrResize, flushPendingRooms, presentationOnly]);

  const beginDragRoom = useCallback(
    (e: React.PointerEvent, roomId: string) => {
      if (presentationOnly) return;
      const plate = plateRefStable.current;
      if (!plate) return;
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const entry = roomsLayout.find((r) => r.roomId === roomId);
      if (!entry) return;
      onLayoutGestureStartRef.current?.();
      onSelectRoomRef.current(roomId);
      const p = clientToNorm(e, plate);
      dragRef.current = {
        kind: "move",
        roomId,
        startPointerNorm: p,
        startRect: { ...entry },
        snapshotRooms: cloneRooms(roomsLayout),
      };
    },
    [plateRefStable, presentationOnly, roomsLayout]
  );

  const beginResize = useCallback(
    (e: React.PointerEvent, roomId: string, handle: ResizeHandle) => {
      if (presentationOnly) return;
      const plate = plateRefStable.current;
      if (!plate) return;
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const entry = roomsLayout.find((r) => r.roomId === roomId);
      if (!entry) return;
      onLayoutGestureStartRef.current?.();
      onSelectRoomRef.current(roomId);
      const p = clientToNorm(e, plate);
      dragRef.current = {
        kind: "resize",
        roomId,
        handle,
        startPointerNorm: p,
        startRect: { ...entry },
        snapshotRooms: cloneRooms(roomsLayout),
      };
    },
    [plateRefStable, presentationOnly, roomsLayout]
  );

  const rootPe = presentationOnly ? "pointer-events-none" : "pointer-events-auto";
  const tileCursor = presentationOnly ? "" : "cursor-grab select-none active:cursor-grabbing";

  return (
    <div className={`${rootPe} absolute inset-0 z-0 flex min-h-0 flex-col`}>
      {!presentationOnly ? (
        <div className="pointer-events-auto mb-1 flex flex-wrap items-center gap-1 rounded-md border border-emerald-500/30 bg-black/55 px-2 py-1 text-[10px] text-emerald-100 shadow-lg backdrop-blur-sm sm:text-[11px]">
          <span className="font-semibold text-emerald-300/90">房间布局</span>
          <span className="text-slate-400">拖拽 · 角点缩放（方向键在页面焦点下微移）</span>
        </div>
      ) : null}
      <div ref={roomsAreaMetricsRef} className="relative min-h-0 flex-1">
        {roomsLayout.map((layout) => {
          const room = telemetryByRoomId.get(layout.roomId);
          const cell = room ?? placeholderRoomCell(layout.roomId);
          const sel = highlightRoomIds ? highlightRoomIds.has(layout.roomId) : layout.roomId === selectedRoomId;
          const rot = layout.rotationDeg ?? 0;
          return (
            <div
              key={layout.roomId}
              role={presentationOnly ? "presentation" : "button"}
              tabIndex={presentationOnly ? -1 : 0}
              className={`absolute ${sel ? "z-[2]" : "z-[1]"}`}
              style={{
                left: `${layout.nx * 100}%`,
                top: `${layout.ny * 100}%`,
                width: `${layout.nw * 100}%`,
                height: `${layout.nh * 100}%`,
              }}
              onPointerDown={presentationOnly ? undefined : (e) => beginDragRoom(e, layout.roomId)}
            >
              <div
                className={`dt-room-scan-wrap dt-room-plate-rot relative h-full min-h-0 ${sel ? "ring-2 ring-cyan-400/80" : "ring-1 ring-white/10"} ${tileCursor} rounded-sm`}
                style={{ transform: `rotate(${rot}deg)` }}
              >
                <RoomTileVisual
                  room={cell}
                  config={config}
                  variant="compact"
                  visualPreset={roomVisualPreset}
                  className="dt-room-slot h-full min-h-0"
                  placeholder={!room}
                />
                {sel && !presentationOnly ? (
                  <>
                    <button
                      type="button"
                      aria-label="resize-nw"
                      className="pointer-events-auto absolute -left-1 -top-1 z-[5] h-2.5 w-2.5 cursor-nwse-resize rounded-sm border border-cyan-400/80 bg-slate-900/90"
                      onPointerDown={(e) => beginResize(e, layout.roomId, "nw")}
                    />
                    <button
                      type="button"
                      aria-label="resize-ne"
                      className="pointer-events-auto absolute -right-1 -top-1 z-[5] h-2.5 w-2.5 cursor-nesw-resize rounded-sm border border-cyan-400/80 bg-slate-900/90"
                      onPointerDown={(e) => beginResize(e, layout.roomId, "ne")}
                    />
                    <button
                      type="button"
                      aria-label="resize-sw"
                      className="pointer-events-auto absolute -bottom-1 -left-1 z-[5] h-2.5 w-2.5 cursor-nesw-resize rounded-sm border border-cyan-400/80 bg-slate-900/90"
                      onPointerDown={(e) => beginResize(e, layout.roomId, "sw")}
                    />
                    <button
                      type="button"
                      aria-label="resize-se"
                      className="pointer-events-auto absolute -bottom-1 -right-1 z-[5] h-2.5 w-2.5 cursor-nwse-resize rounded-sm border border-cyan-400/80 bg-slate-900/90"
                      onPointerDown={(e) => beginResize(e, layout.roomId, "se")}
                    />
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
