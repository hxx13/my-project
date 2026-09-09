export interface GroupMatchCell {
  projectPiName?: string;
  piName?: string;
  cageBoxInfo?: Record<string, unknown>;
}

function nonEmptyText(v: unknown): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : "";
}

/**
 * 拆分多课题组字段 —— 与后端 PersonnelProjectGroupUtil.splitGroups 一致：
 * 按 `,，、;；` 拆分、去空白、去空、去重。
 */
export function splitGroups(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const out: string[] = [];
  for (const token of raw.split(/[,，、;；]/)) {
    const t = token.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * 从「XXX的课题组」提取 PI 前缀（XXX）——
 * 与后端 PersonnelProjectGroupUtil.extractPiPrefixFromGroupName 一致。
 * 注意：无法提取时返回空串，不是返回原串。
 */
export function extractPiPrefixFromGroupName(groupName: string | null | undefined): string {
  const g = (groupName ?? "").trim();
  if (!g) return "";
  if (g.endsWith("的课题组")) return g.slice(0, g.length - "的课题组".length).trim();
  if (g.endsWith("课题组") && g.length > 3) return g.slice(0, g.length - 3).trim();
  const idx = g.indexOf("的");
  if (idx > 0) return g.slice(0, idx).trim();
  return "";
}

/**
 * 单个组名 token 与目标名是否匹配 —— 移植自后端 PersonnelProjectGroupUtil.belongsToGroup 的循环体：
 * 精确 → 双向包含（两侧长度 ≥2）→ 组名提取 PI 前缀比对 → 目标名提取 PI 前缀比对。
 */
export function groupTokenMatches(token: string, target: string): boolean {
  const g = (token ?? "").trim();
  const tg = (target ?? "").trim();
  if (!g || !tg) return false;
  if (g === tg) return true;
  if (tg.length >= 2 && g.length >= 2 && (g.includes(tg) || tg.includes(g))) return true;
  const extracted = extractPiPrefixFromGroupName(g);
  if (extracted.length >= 2 && (extracted === tg || extracted.includes(tg) || tg.includes(extracted))) return true;
  const targetExtracted = extractPiPrefixFromGroupName(tg);
  if (targetExtracted.length >= 2 && (targetExtracted === g || g.includes(targetExtracted) || targetExtracted.includes(g))) return true;
  return false;
}

/**
 * 人的多课题组字段 ↔ 单个目标组名（通常是笼位上的 PI 名）。
 * 与后端 PersonnelProjectGroupUtil.belongsToGroup(field, target) 语义一致。
 */
export function belongsToGroup(personGroupField: string | null | undefined, targetGroup: string | null | undefined): boolean {
  const tg = (targetGroup ?? "").trim();
  if (!tg) return false;
  return splitGroups(personGroupField).some((g) => groupTokenMatches(g, tg));
}

/** 取笼位所属课题组名（对齐 CellButton 的主要 PI 回退链，不含其 detail 兜底）。 */
export function cellGroupName(cell: GroupMatchCell): string {
  const cbi = cell.cageBoxInfo;
  return (
    nonEmptyText(cell.projectPiName) ||
    nonEmptyText(cell.piName) ||
    nonEmptyText(cbi?.ProjectPiName) ||
    nonEmptyText(cbi?.projectPiName) ||
    nonEmptyText(cbi?.piName)
  );
}

/** 一个架子只要有 ≥1 个笼位命中该人的课题组即算命中。 */
export function rackMatchesGroup(cells: GroupMatchCell[], personGroupField: string | null | undefined): boolean {
  if (!(personGroupField ?? "").trim()) return false;
  return cells.some((c) => {
    const cellPi = cellGroupName(c);
    return cellPi !== "" && belongsToGroup(personGroupField, cellPi);
  });
}
