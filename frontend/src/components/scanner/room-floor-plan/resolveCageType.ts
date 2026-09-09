import type { CageShelfCell } from "@/api/domains/cageShelf.api";

/**
 * 解析笼位类型 —— 移植自 CellButton.tsx:44-70 的回退链：
 * cageTypeCode → cageBoxInfo.AnimalCageType → COHABITATION/SPECIAL_FEEDING→3
 * → stateLabel 文本 → 有 PI/笼盒即视为 3，否则 1。
 * 平面图走的是快照路径（snapshotCellToShelfCell 不解析 cageBoxInfo 里的类型），
 * 所以这里必须自己回退，否则类型圆点/徽标会空。
 */
export function resolveCageType(cell: CageShelfCell): number | undefined {
  const cbi = cell.cageBoxInfo as Record<string, unknown> | undefined;
  let ct = (cell as unknown as { cageTypeCode?: number }).cageTypeCode ?? cell.animalCageType;
  if ((ct == null || ct === 0) && cbi) {
    const raw = cbi.AnimalCageType ?? cbi.animalCageType;
    if (raw != null && raw !== "" && Number(raw) !== 0) ct = Number(raw);
  }
  if ((ct == null || ct === 0 || Number.isNaN(ct)) && Array.isArray(cell.specialStatuses)) {
    const codes = cell.specialStatuses.map((s) => s.code);
    if (codes.includes("COHABITATION") || codes.includes("SPECIAL_FEEDING")) ct = 3;
  }
  if ((ct == null || ct === 0 || Number.isNaN(ct)) && cell.stateLabel) {
    const sl = String(cell.stateLabel);
    if (sl.includes("等待分配")) ct = 1;
    else if (sl.includes("空笼盒")) ct = 2;
    else if (sl.includes("饲养")) ct = 3;
    else if (sl.includes("异常")) ct = 4;
  }
  if ((ct == null || ct === 0 || Number.isNaN(ct)) && !cell.empty) {
    if (cell.projectPiName || cell.piName || cbi?.ProjectPiName || cbi?.cageBoxCode || cbi?.CageBoxQrCode) ct = 3;
    else ct = 1;
  }
  return ct != null && ct !== 0 && !Number.isNaN(ct) ? ct : undefined;
}
