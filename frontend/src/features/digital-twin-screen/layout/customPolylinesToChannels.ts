import { ductSegmentToChannel, zoneForColumn } from "@/features/digital-twin-screen/computeDuctPaths";
import type { DuctChannelModel } from "@/features/digital-twin-screen/types";
import type { DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";

/** 伪高度：在屏幕左上方向抬升，模拟等距立管（仍属 2D 平面图） */
function liftPixel(x: number, y: number, h: number | undefined, liftMax: number): { x: number; y: number } {
  const t = Math.max(0, Math.min(1, h ?? 0));
  return {
    x: x - t * liftMax * 0.5,
    y: y - t * liftMax * 0.42,
  };
}

/** 将自定义折线转为槽体通道（任意斜向、多拐点） */
export function customPolylinesToChannels(
  polylines: DuctPlanPolyline[],
  sceneW: number,
  sceneH: number,
  channelHalfWidth: number,
  heightLiftPx: number
): DuctChannelModel[] {
  const hw = Math.max(2, channelHalfWidth);
  const out: DuctChannelModel[] = [];

  for (const pl of polylines) {
    const pts = pl.points;
    if (pts.length < 2) continue;
    const col = pl.columnIndex % 4;
    const zone = zoneForColumn(col);

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const ax0 = a.x * sceneW;
      const ay0 = a.y * sceneH;
      const bx0 = b.x * sceneW;
      const by0 = b.y * sceneH;
      const A = liftPixel(ax0, ay0, a.h, heightLiftPx);
      const B = liftPixel(bx0, by0, b.h, heightLiftPx);
      out.push(ductSegmentToChannel(`${pl.id}-s${i}`, zone, col, A.x, A.y, B.x, B.y, hw));
    }
  }

  return out;
}
