import type { RoomLayoutEntry } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

/**
 * 按列×行在 plate 上生成与 CSS grid+gap 等价的归一化房间矩形（行优先 roomId 与 buildInitialRoomGrid 一致）。
 */
export function buildDefaultRoomLayout(
  plateW: number,
  plateH: number,
  columns: number,
  rows: number,
  gapPx: number
): RoomLayoutEntry[] {
  if (columns < 1 || rows < 1 || plateW <= 0 || plateH <= 0) return [];
  const gapXn = Math.min(0.2, Math.max(0, gapPx / plateW));
  const gapYn = Math.min(0.2, Math.max(0, gapPx / plateH));
  const cw = (1 - gapXn * Math.max(0, columns - 1)) / columns;
  const ch = (1 - gapYn * Math.max(0, rows - 1)) / rows;
  const out: RoomLayoutEntry[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const nx = c * (cw + gapXn);
      const ny = r * (ch + gapYn);
      out.push({
        roomId: `R-${c + 1}-${r + 1}`,
        nx,
        ny,
        nw: cw,
        nh: ch,
        rotationDeg: 0,
      });
    }
  }
  return out;
}
