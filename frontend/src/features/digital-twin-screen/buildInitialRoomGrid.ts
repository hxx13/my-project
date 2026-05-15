import type { DigitalTwinScreenConfig, RoomCellModel } from "@/features/digital-twin-screen/types";

/** 伪随机 0..1（可复现 Mock） */
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildInitialRoomGrid(config: DigitalTwinScreenConfig): RoomCellModel[] {
  const { columns, rows } = config.grid;
  const rnd = mulberry32(config.mock.seed);
  const cells: RoomCellModel[] = [];
  /** 行优先，与 CSS `grid` 默认 auto-flow 一致 */
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const tJitter = (rnd() - 0.5) * 2 * config.mock.tempSpread;
      const hJitter = (rnd() - 0.5) * 2 * config.mock.humiditySpread;
      cells.push({
        roomId: `R-${c + 1}-${r + 1}`,
        columnIndex: c,
        rowIndex: r,
        displayName: `${c + 1}-${r + 1}`,
        temperatureC: Math.round((config.mock.tempCenter + tJitter) * 10) / 10,
        humidityPct: Math.round(config.mock.humidityCenter + hJitter),
      });
    }
  }
  return cells;
}
