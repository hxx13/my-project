import { Wind } from "lucide-react";
import type { DtAcZoneDoc } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

/** 空调区纯展示（命中与拖拽由 SceneEditSurface 处理） */
export function DtAcZoneLayer({
  acZones,
  sceneWidth,
  sceneHeight,
  selectedId,
  highlightZoneIds,
}: {
  acZones: DtAcZoneDoc[];
  sceneWidth: number;
  sceneHeight: number;
  selectedId?: string | null;
  highlightZoneIds?: ReadonlySet<string> | null;
}) {
  if (sceneWidth <= 0 || sceneHeight <= 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[2]">
      {acZones.map((z) => {
        const isLeft = z.zone === "left";
        const title = z.labelShort?.trim() || (isLeft ? "空调机组 A" : "空调机组 B");
        const sub = `列 ${z.columnFrom + 1}–${z.columnTo + 1} 送风`;
        const sel =
          highlightZoneIds != null && highlightZoneIds.size > 0 ? highlightZoneIds.has(z.id) : z.id === selectedId;
        return (
          <div
            key={z.id}
            className={`absolute flex flex-col justify-center rounded-lg border px-2 py-1 shadow-inner ring-1 sm:px-3 sm:py-2 ${
              isLeft
                ? "border-cyan-500/40 bg-[var(--dt-panel-bg)] shadow-[0_0_24px_rgba(34,211,238,0.12)] ring-cyan-400/20"
                : "border-emerald-500/35 bg-[var(--dt-panel-bg)] shadow-[0_0_24px_rgba(74,222,128,0.1)] ring-emerald-400/15"
            } ${sel ? "ring-2 ring-amber-400/90" : ""}`}
            style={{
              left: z.nx * sceneWidth,
              top: z.ny * sceneHeight,
              width: z.nw * sceneWidth,
              height: z.nh * sceneHeight,
            }}
          >
            <div className={`flex min-h-0 min-w-0 items-center gap-1.5 sm:gap-2 ${isLeft ? "text-cyan-200" : "text-emerald-100"}`}>
              <Wind className={`h-4 w-4 shrink-0 sm:h-5 sm:w-5 ${isLeft ? "text-cyan-400" : "text-emerald-400"}`} />
              <div className="min-w-0">
                <div className="truncate text-[10px] font-semibold tracking-wide sm:text-xs">{title}</div>
                <div className="truncate text-[9px] text-slate-500 sm:text-[10px]">{sub}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
