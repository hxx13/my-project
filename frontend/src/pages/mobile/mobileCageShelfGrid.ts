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

export function resolveAnimalCageType(cell: CageShelfCell): number | undefined {
  let ct = cell.animalCageType;
  if ((ct == null || ct === 0) && cell.cageBoxInfo) {
    const cbi = cell.cageBoxInfo as Record<string, unknown>;
    const raw = cbi.AnimalCageType ?? cbi.animalCageType;
    if (raw != null && raw !== '' && Number(raw) !== 0) ct = Number(raw);
  }
  // COHABITATION/SPECIAL_FEEDING → 饲养中(type 3)
  if ((ct == null || ct === 0 || isNaN(ct)) && Array.isArray(cell.specialStatuses)) {
    const codes = cell.specialStatuses.map((s: any) => s.code);
    if (codes.includes('COHABITATION') || codes.includes('SPECIAL_FEEDING')) ct = 3;
  }
  // 从 stateLabel 推断
  if ((ct == null || ct === 0 || isNaN(ct)) && cell.stateLabel) {
    const sl = String(cell.stateLabel);
    if (sl.includes('等待分配')) ct = 1;
    else if (sl.includes('空笼盒')) ct = 2;
    else if (sl.includes('饲养')) ct = 3;
    else if (sl.includes('异常')) ct = 4;
  }
  // 完全无法推断且非空位 → 有 PI 或 cageBoxCode 则至少是饲养中（对齐 admin/student 页面逻辑）
  if ((ct == null || ct === 0 || isNaN(ct)) && !cell.empty) {
    const cbi = cell.cageBoxInfo as Record<string, unknown> | undefined;
    if (cell.projectPiName || cbi?.cageBoxCode || cbi?.CageBoxQrCode) ct = 3;
    else ct = 1;
  }
  return (ct != null && ct !== 0 && !isNaN(ct)) ? ct : undefined;
}

export function normalizeMobileCageShelfDetail(raw: Record<string, unknown>): CageShelfDetail {
  const grid: CageShelfCell[] = Array.isArray(raw.grid)
    ? (raw.grid as CageShelfCell[]).map(c => ({ ...c, animalCageType: resolveAnimalCageType(c) }))
    : [];
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
