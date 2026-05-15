import type { DuctSceneLayout } from "@/features/digital-twin-screen/computeDuctPaths";
import type { DtAcZoneDoc } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

/** 由首次 measure 的像素几何写入文档（scene 归一化 0–1） */
export function seedAcZonesFromDuctScene(layout: DuctSceneLayout): DtAcZoneDoc[] {
  const { width: W, height: H, leftAc, rightAc } = layout;
  if (W <= 0 || H <= 0) return [];
  const toNorm = (r: { x: number; y: number; w: number; h: number }) => ({
    nx: r.x / W,
    ny: r.y / H,
    nw: r.w / W,
    nh: r.h / H,
  });
  const l = toNorm(leftAc);
  const r = toNorm(rightAc);
  return [
    {
      id: "ac-left",
      zone: "left",
      ...l,
      columnFrom: 0,
      columnTo: 1,
      labelShort: "A",
    },
    {
      id: "ac-right",
      zone: "right",
      ...r,
      columnFrom: 2,
      columnTo: 3,
      labelShort: "B",
    },
  ];
}
