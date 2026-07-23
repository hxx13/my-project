import { useMemo } from "react";
import type { DigitalTwinScreenConfig, RoomCellModel } from "@/features/digital-twin-screen/types";
import type { RoomLayoutEntry, RoomVisualPresetId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { placeholderRoomCell, RoomTileVisual } from "@/features/digital-twin-screen/layout/RoomTileVisual";

export function DtRoomGrid({
  mode,
  rooms,
  config,
  roomLayout,
  roomVisualPreset = "isoSoft",
  gridGapPx,
}: {
  mode: "grid" | "freeform";
  rooms: RoomCellModel[];
  config: DigitalTwinScreenConfig;
  /** freeform：与 sceneDoc.rooms 顺序一致，按 roomId 绑定遥测 */
  roomLayout?: RoomLayoutEntry[];
  roomVisualPreset?: RoomVisualPresetId;
  /** 覆盖 CSS grid 物理间距（px）；未传则用主题 --dt-room-gap */
  gridGapPx?: number;
}) {
  const { columns, rows } = config.grid;
  const byId = useMemo(() => new Map(rooms.map((r) => [r.roomId, r])), [rooms]);

  if (mode === "grid") {
    return (
      <div
        className="relative z-[2] grid min-h-0 flex-1 gap-[var(--dt-room-gap)]"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gap: gridGapPx !== undefined && gridGapPx !== null ? `${gridGapPx}px` : undefined,
        }}
      >
        {rooms.map((room) => (
          <div key={room.roomId} className="dt-room-scan-wrap">
            <RoomTileVisual room={room} config={config} variant="default" visualPreset={roomVisualPreset} />
          </div>
        ))}
      </div>
    );
  }

  const layout = roomLayout ?? [];
  return (
    <div className="relative z-[2] min-h-0 flex-1">
      {layout.map((entry) => {
        const room = byId.get(entry.roomId) ?? placeholderRoomCell(entry.roomId);
        const rot = entry.rotationDeg ?? 0;
        return (
          <div
            key={entry.roomId}
            className="dt-room-scan-wrap absolute"
            style={{
              left: `${entry.nx * 100}%`,
              top: `${entry.ny * 100}%`,
              width: `${entry.nw * 100}%`,
              height: `${entry.nh * 100}%`,
            }}
          >
            <div className="dt-room-plate-rot h-full" style={{ transform: `rotate(${rot}deg)` }}>
              <RoomTileVisual
                room={room}
                config={config}
                variant="default"
                visualPreset={roomVisualPreset}
                className="dt-room-slot h-full min-h-0 min-w-0"
                placeholder={!byId.get(entry.roomId)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
