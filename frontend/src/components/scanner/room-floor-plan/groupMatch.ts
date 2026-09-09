export interface GroupMatchCell {
  projectPiName?: string;
  piName?: string;
  cageBoxInfo?: Record<string, unknown>;
}

/** 归一化课题组名：去空白、去「的课题组」/「课题组」后缀。 */
export function normalizeGroupName(s: string): string {
  return s.trim().replace(/\s+/g, "").replace(/的课题组$/, "").replace(/课题组$/, "");
}

function nonEmptyText(v: unknown): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : "";
}

/** 取笼位所属课题组名（与 CellButton 的 PI 回退链一致）。 */
export function cellGroupName(cell: GroupMatchCell): string {
  if (nonEmptyText(cell.projectPiName)) return cell.projectPiName!.trim();
  if (nonEmptyText(cell.piName)) return cell.piName!.trim();
  const cbi = cell.cageBoxInfo;
  if (cbi) {
    const fromBi =
      nonEmptyText(cbi.ProjectPiName) ||
      nonEmptyText(cbi.projectPiName) ||
      nonEmptyText(cbi.piName);
    if (fromBi) return fromBi;
  }
  return "";
}

/** 一个架子只要有 ≥1 个笼位命中该课题组即算命中。 */
export function rackMatchesGroup(cells: GroupMatchCell[], groupName: string): boolean {
  const target = normalizeGroupName(groupName);
  if (!target) return false;
  return cells.some((c) => {
    const g = normalizeGroupName(cellGroupName(c));
    return g !== "" && g === target;
  });
}
