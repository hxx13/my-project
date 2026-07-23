/** 平面图几何：吸附、投影、距离 */

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function snapGrid(x: number, y: number, step: number): { x: number; y: number } {
  if (step <= 0) return { x: clamp01(x), y: clamp01(y) };
  return {
    x: clamp01(Math.round(x / step) * step),
    y: clamp01(Math.round(y / step) * step),
  };
}

/** 将当前点相对 prev 的向量吸附到 45° 步进，保持长度 */
export function snapAngle45(prev: { x: number; y: number }, cur: { x: number; y: number }): { x: number; y: number } {
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-8) return { x: prev.x, y: prev.y };
  const ang = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(ang / step) * step;
  return {
    x: clamp01(prev.x + len * Math.cos(snapped)),
    y: clamp01(prev.y + len * Math.sin(snapped)),
  };
}

export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1e-12;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

export function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { x: number; y: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1e-12;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * abx, y: ay + t * aby, t };
}

/** 与 CSS `transform: rotate(deg); transform-origin: center` 一致：绕盒子中心旋转后的四角在 plate 归一化坐标下的轴对齐包围盒 */
export function rotatedRoomAABBBounds(
  nx: number,
  ny: number,
  nw: number,
  nh: number,
  rotationDeg: number | undefined
): { minX: number; maxX: number; minY: number; maxY: number } {
  const cx = nx + nw / 2;
  const cy = ny + nh / 2;
  const rad = ((rotationDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const corners: [number, number][] = [
    [-nw / 2, -nh / 2],
    [nw / 2, -nh / 2],
    [nw / 2, nh / 2],
    [-nw / 2, nh / 2],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of corners) {
    const rx = lx * c - ly * s;
    const ry = lx * s + ly * c;
    const wx = cx + rx;
    const wy = cy + ry;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minY = Math.min(minY, wy);
    maxY = Math.max(maxY, wy);
  }
  return { minX, maxX, minY, maxY };
}

/** 平移 (nx,ny) 使旋转后 AABB 落在 [0,1]²（迭代处理 x/y 耦合） */
export function clampRoomTopLeftToPlate(
  nx: number,
  ny: number,
  nw: number,
  nh: number,
  rotationDeg: number | undefined
): { nx: number; ny: number } {
  let x = nx;
  let y = ny;
  for (let k = 0; k < 8; k++) {
    const b = rotatedRoomAABBBounds(x, y, nw, nh, rotationDeg);
    let dx = 0;
    let dy = 0;
    if (b.minX < 0) dx -= b.minX;
    if (b.maxX > 1) dx += 1 - b.maxX;
    if (b.minY < 0) dy -= b.minY;
    if (b.maxY > 1) dy += 1 - b.maxY;
    if (dx === 0 && dy === 0) break;
    x += dx;
    y += dy;
  }
  return { nx: x, ny: y };
}
