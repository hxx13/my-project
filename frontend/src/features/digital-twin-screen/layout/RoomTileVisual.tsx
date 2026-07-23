import type { DigitalTwinScreenConfig, RoomCellModel } from "@/features/digital-twin-screen/types";
import { roomVisualState } from "@/features/digital-twin-screen/roomVisualState";
import type { RoomVisualPresetId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

export type RoomTileVisualVariant = "default" | "compact";

export function RoomTileVisual({
  room,
  config,
  className,
  variant = "default",
  visualPreset = "isoSoft",
  placeholder,
}: {
  room: RoomCellModel;
  config: DigitalTwinScreenConfig;
  className?: string;
  variant?: RoomTileVisualVariant;
  /** 文档级房间块视觉：轻伪透视 vs 平面 */
  visualPreset?: RoomVisualPresetId;
  /** 无遥测时的占位：灰显但仍可拖 */
  placeholder?: boolean;
}) {
  const vs = roomVisualState(room, config);
  const compact = variant === "compact";
  const flat = visualPreset === "flat";
  return (
    <div className={`${className ?? "dt-room-slot min-h-0 min-w-0"} ${flat ? "dt-room-visual-flat" : ""}`}>
      <div className={`dt-room-25d h-full ${placeholder ? "opacity-60" : ""}`}>
        <div className="dt-room-roof" aria-hidden />
        <div
          className="dt-room-side"
          aria-hidden
          style={{
            boxShadow: `inset -1px 0 0 color-mix(in srgb, ${vs.accentColor} 35%, transparent)`,
          }}
        />
        <article
          className={
            compact
              ? "dt-room-face flex h-full min-h-0 min-w-0 flex-col justify-between rounded-md border bg-[var(--dt-panel-bg)] px-1 py-0.5 shadow-inner ring-1 ring-white/5 sm:px-1.5 sm:py-1"
              : "dt-room-face flex min-h-0 min-w-0 flex-col justify-between rounded-md border bg-[var(--dt-panel-bg)] px-1.5 py-1 shadow-inner ring-1 ring-white/5 sm:px-2 sm:py-1.5"
          }
          style={{
            borderColor: vs.borderColor,
            boxShadow: `
                    inset 0 1px 0 rgba(255,255,255,0.06),
                    0 0 0 1px color-mix(in srgb, ${vs.accentColor} 20%, transparent),
                    0 10px 24px color-mix(in srgb, ${vs.accentColor} 14%, transparent)
                  `,
          }}
        >
          <div className={`flex items-start justify-between ${compact ? "gap-0.5" : "gap-1"}`}>
            <span
              className={`truncate font-mono font-semibold text-[var(--dt-text-muted)] ${compact ? "text-[8px] sm:text-[9px]" : "text-[9px] sm:text-[10px]"}`}
            >
              {room.displayName}
            </span>
            <span
              className={`shrink-0 rounded font-medium uppercase ${compact ? "px-0.5 py-px text-[7px] sm:text-[8px]" : "px-1 py-px text-[8px] tracking-tighter sm:text-[9px]"}`}
              style={{
                backgroundColor: `color-mix(in srgb, ${vs.accentColor} 22%, transparent)`,
                color: vs.accentColor,
              }}
            >
              {placeholder ? "—" : vs.band === "normal" ? "OK" : vs.band === "warn" ? "!" : "!!"}
            </span>
          </div>
          <div className={`mt-0.5 space-y-0.5 font-mono tabular-nums ${compact ? "space-y-0.5" : ""}`}>
            <div className={`flex items-baseline justify-between ${compact ? "gap-0.5 text-[8px] sm:text-[9px]" : "gap-1 text-[10px] sm:text-xs"}`}>
              <span className="text-[var(--dt-text-muted)]">T</span>
              <span className="font-semibold text-[var(--dt-text)]">{room.temperatureC.toFixed(1)}°C</span>
            </div>
            <div className={`flex items-baseline justify-between ${compact ? "gap-0.5 text-[8px] sm:text-[9px]" : "gap-1 text-[10px] sm:text-xs"}`}>
              <span className="text-[var(--dt-text-muted)]">RH</span>
              <span className="font-semibold text-[var(--dt-text)]">{room.humidityPct}%</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

export function placeholderRoomCell(roomId: string): RoomCellModel {
  const m = /^R-(\d+)-(\d+)$/.exec(roomId);
  const c = m ? Number(m[1]) - 1 : 0;
  const r = m ? Number(m[2]) - 1 : 0;
  return {
    roomId,
    columnIndex: c,
    rowIndex: r,
    displayName: m ? `${m[1]}-${m[2]}` : roomId,
    temperatureC: 0,
    humidityPct: 0,
    sourceStatus: "no-telemetry",
  };
}
