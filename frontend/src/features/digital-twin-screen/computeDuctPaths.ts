import type { AcZoneId, DuctChannelModel } from "@/features/digital-twin-screen/types";

/** 场景内几何（相对同一坐标系，通常为 scene 容器的 client 像素） */
export type DuctSceneLayout = {
  width: number;
  height: number;
  /** 左半区空调外框 */
  leftAc: { x: number; y: number; w: number; h: number };
  rightAc: { x: number; y: number; w: number; h: number };
  /** 房间网格外框 */
  grid: { x: number; y: number; w: number; h: number };
  columns: number;
};

/** 左右区各自负责的列（含端点）；未传时与历史默认一致 */
export type DuctZoneColumnBinding = {
  left: { from: number; to: number };
  right: { from: number; to: number };
};

function acBottomCenter(ac: { x: number; y: number; w: number; h: number }) {
  return { x: ac.x + ac.w / 2, y: ac.y + ac.h };
}

export function lineToShellQuad(ax: number, ay: number, bx: number, by: number, hw: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * hw;
  const ny = (dx / len) * hw;
  return `M ${ax + nx} ${ay + ny} L ${bx + nx} ${by + ny} L ${bx - nx} ${by - ny} L ${ax - nx} ${ay - ny} Z`;
}

export function lineToSpine(ax: number, ay: number, bx: number, by: number): string {
  return `M ${ax} ${ay} L ${bx} ${by}`;
}

export function ductSegmentToChannel(
  id: string,
  zone: AcZoneId,
  columnIndex: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  hw: number
): DuctChannelModel {
  return {
    id,
    zone,
    columnIndex,
    shellD: lineToShellQuad(ax, ay, bx, by, hw),
    spineD: lineToSpine(ax, ay, bx, by),
  };
}

type Seg = { id: string; zone: AcZoneId; columnIndex: number; ax: number; ay: number; bx: number; by: number };

function mergeColumnIndices(from: number, to: number, columns: number): number[] {
  if (columns <= 0) return [];
  const lo = Math.max(0, Math.min(columns - 1, Math.min(from, to)));
  const hi = Math.max(0, Math.min(columns - 1, Math.max(from, to)));
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

/** 与旧版硬编码一致：左 0–1（columns≥2），右 2–3（columns≥4）否则仅垂落 */
function defaultLegacyColumnIndices(columns: number): { left: number[]; right: number[] } {
  const left: number[] = [];
  if (columns >= 2) {
    left.push(0, 1);
  }
  const right: number[] = [];
  if (columns >= 4) {
    right.push(2, 3);
  }
  return { left, right };
}

function buildSideSegments(
  zone: AcZoneId,
  prefix: string,
  acBottom: { x: number; y: number },
  colIndices: number[],
  colCenters: number[],
  yMain: number,
  yBottom: number
): Seg[] {
  const segs: Seg[] = [];
  segs.push({
    id: `${prefix}-drop`,
    zone,
    columnIndex: colIndices[0] ?? 0,
    ax: acBottom.x,
    ay: acBottom.y,
    bx: acBottom.x,
    by: yMain,
  });
  if (colIndices.length === 0) {
    return segs;
  }
  const x0 = colCenters[colIndices[0]!]!;
  const x1 = colCenters[colIndices[colIndices.length - 1]!]!;
  if (colIndices.length >= 2) {
    segs.push({
      id: `${prefix}-branch`,
      zone,
      columnIndex: colIndices[0]!,
      ax: x0,
      ay: yMain,
      bx: x1,
      by: yMain,
    });
  } else if (Math.abs(acBottom.x - x0) > 0.5) {
    segs.push({
      id: `${prefix}-jog`,
      zone,
      columnIndex: colIndices[0]!,
      ax: acBottom.x,
      ay: yMain,
      bx: x0,
      by: yMain,
    });
  }
  for (const c of colIndices) {
    const x = colCenters[c]!;
    segs.push({
      id: `${prefix}-col-${c}-main`,
      zone,
      columnIndex: c,
      ax: x,
      ay: yMain,
      bx: x,
      by: yBottom,
    });
  }
  return segs;
}

/** 由 DOM 测量生成风管槽体 + 中心脊线；列范围可由 acZones 绑定覆盖 */
export function computeDuctChannels(
  layout: DuctSceneLayout,
  channelHalfWidth: number,
  zoneColumnBinding?: DuctZoneColumnBinding | null
): DuctChannelModel[] {
  const { grid, columns } = layout;
  const colW = grid.w / Math.max(1, columns);
  const hw = Math.max(2.5, Math.min(channelHalfWidth, colW * 0.34));

  const colCenters: number[] = [];
  for (let i = 0; i < columns; i++) {
    colCenters.push(grid.x + (i + 0.5) * colW);
  }

  const yMain = Math.max(grid.y - 10, acBottomCenter(layout.leftAc).y + 8);
  const lb = acBottomCenter(layout.leftAc);
  const rb = acBottomCenter(layout.rightAc);
  const yBottom = grid.y + grid.h;

  const legacy = defaultLegacyColumnIndices(columns);
  const leftCols = zoneColumnBinding
    ? mergeColumnIndices(zoneColumnBinding.left.from, zoneColumnBinding.left.to, columns)
    : legacy.left;
  const rightCols = zoneColumnBinding
    ? mergeColumnIndices(zoneColumnBinding.right.from, zoneColumnBinding.right.to, columns)
    : legacy.right;

  const segs: Seg[] = [];
  segs.push(...buildSideSegments("left", "left", lb, leftCols, colCenters, yMain, yBottom));
  segs.push(...buildSideSegments("right", "right", rb, rightCols, colCenters, yMain, yBottom));

  return segs.map((s) => ductSegmentToChannel(s.id, s.zone, s.columnIndex, s.ax, s.ay, s.bx, s.by, hw));
}

export function zoneForColumn(columnIndex: number): AcZoneId {
  return columnIndex < 2 ? "left" : "right";
}
