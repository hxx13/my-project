import type { DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";

/**
 * 风管布局：仅 SVG 展示。命中、拖拽、双击加点的交互由 SceneEditSurface 统一处理。
 */
export function DuctLayoutEditor({
  width,
  height,
  ducts,
  snapGridStep,
  heightLiftPx,
  selectedPolyId,
  selectedPointIndex,
  highlightPolyIds,
}: {
  width: number;
  height: number;
  ducts: DuctPlanPolyline[];
  snapGridStep: number;
  heightLiftPx: number;
  selectedPolyId: string | null;
  selectedPointIndex: number | null;
  /** Shift 多选：额外高亮的折线 id（与 selectedPolyId 合并） */
  highlightPolyIds?: ReadonlySet<string> | null;
}) {
  if (width <= 0 || height <= 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex min-h-0 flex-col">
      <svg
        role="img"
        aria-label="管道布局"
        className="min-h-0 flex-1 touch-none"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        {snapGridStep > 0 ? (
          <g opacity={0.12} pointerEvents="none">
            {Array.from({ length: Math.min(96, Math.ceil(1 / snapGridStep) + 1) }, (_, i) => {
              const v = i * snapGridStep;
              if (v > 1.001) return null;
              return <line key={`gv-${i}`} x1={v * width} y1={0} x2={v * width} y2={height} stroke="rgba(148,163,184,0.5)" strokeWidth={1} />;
            })}
            {Array.from({ length: Math.min(96, Math.ceil(1 / snapGridStep) + 1) }, (_, i) => {
              const v = i * snapGridStep;
              if (v > 1.001) return null;
              return <line key={`gh-${i}`} x1={0} y1={v * height} x2={width} y2={v * height} stroke="rgba(148,163,184,0.5)" strokeWidth={1} />;
            })}
          </g>
        ) : null}

        {ducts.map((pl) => {
          const d = pl.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * width} ${p.y * height}`).join(" ");
          const sel =
            pl.id === selectedPolyId || (highlightPolyIds != null && highlightPolyIds.size > 0 && highlightPolyIds.has(pl.id));
          return (
            <g key={pl.id}>
              <path
                d={d}
                fill="none"
                stroke={sel ? "rgba(34,211,238,0.55)" : "rgba(148,163,184,0.35)"}
                strokeWidth={sel ? 10 : 7}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
              <path
                d={d}
                fill="none"
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            </g>
          );
        })}

        {ducts.map((pl) =>
          pl.points.map((p, i) => {
            const px = p.x * width;
            const py = p.y * height;
            const lift = (p.h ?? 0) * heightLiftPx;
            const cx = px - lift * 0.5;
            const cy = py - lift * 0.42;
            const vsel = pl.id === selectedPolyId && i === selectedPointIndex;
            return (
              <circle
                key={p.id}
                cx={cx}
                cy={cy}
                r={vsel ? 9 : 7}
                fill={vsel ? "rgba(34,211,238,0.95)" : "rgba(226,232,240,0.9)"}
                stroke="rgba(15,23,42,0.9)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            );
          })
        )}
      </svg>
    </div>
  );
}
