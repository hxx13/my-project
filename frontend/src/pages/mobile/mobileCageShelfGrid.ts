import type { CageShelfCell, CageShelfDetail } from "@/features/student/api/student.api";

/** 与 Web 学生端一致：8×10 空位占位 */
export function buildPlaceholderGridCells(): CageShelfCell[] {
  const cells: CageShelfCell[] = [];
  for (let i = 0; i < 80; i++) {
    const y = Math.floor(i / 8) + 1;
    const x = (i % 8) + 1;
    const position = `${String.fromCharCode(64 + x)}-${y}`;
    cells.push({
      x,
      y,
      position,
      empty: true,
      visible: true,
      stateLabel: "空位",
    });
  }
  return cells;
}

export function normalizeMobileCageShelfDetail(raw: Record<string, unknown>): CageShelfDetail {
  const grid = Array.isArray(raw.grid) ? (raw.grid as CageShelfCell[]) : [];
  const shelfMetaRaw = (raw.shelfMeta ?? {}) as Record<string, string>;
  return {
    shelfMeta: {
      campusName: shelfMetaRaw.campusName ?? "",
      areaName: shelfMetaRaw.areaName ?? "",
      floorName: shelfMetaRaw.floorName ?? "",
      roomName: shelfMetaRaw.roomName ?? "",
      shelveId: shelfMetaRaw.shelveId ?? "",
      shelveName: shelfMetaRaw.shelveName ?? "",
    },
    grid,
    totalCells: typeof raw.totalCells === "number" ? raw.totalCells : 80,
    filledCells: typeof raw.filledCells === "number" ? raw.filledCells : 0,
    latestBatchId: raw.latestBatchId as string | null | undefined,
  };
}
