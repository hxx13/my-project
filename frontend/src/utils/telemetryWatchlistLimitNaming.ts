/**
 * WinCC 限值变量后缀（管理端表格分组/分级展示用；与现场命名约定一致）。
 * 报警上下限数据逻辑见后端手填缓存列，此处仅做前端名称识别。
 */

export type WinccLimitParsed = {
  base: string;
  metricKindCode: string;
  /** true = Floor（下限侧），false = Top（上限侧） */
  minSlot: boolean;
};

const SPEC = [
  { suffix: "_PT_Floor", metricCode: "PRESSURE", minSlot: true },
  { suffix: "_PT_Top", metricCode: "PRESSURE", minSlot: false },
  { suffix: "_TT_Floor", metricCode: "TEMP", minSlot: true },
  { suffix: "_TT_Top", metricCode: "TEMP", minSlot: false },
  { suffix: "_RH_Floor", metricCode: "HUM", minSlot: true },
  { suffix: "_RH_Top", metricCode: "HUM", minSlot: false },
] as const;

/** 最长后缀优先 */
const SPECS_SORTED = [...SPEC].sort((a, b) => b.suffix.length - a.suffix.length);

export function parseWinccLimitSuffix(rawName: string | null | undefined): WinccLimitParsed | null {
  const vn = (rawName ?? "").trim();
  if (!vn) return null;
  const lower = vn.toLowerCase();
  for (const sp of SPECS_SORTED) {
    const suf = sp.suffix.toLowerCase();
    if (lower.endsWith(suf)) {
      const base = vn.slice(0, vn.length - sp.suffix.length).trim();
      if (!base) return null;
      return { base, metricKindCode: sp.metricCode, minSlot: sp.minSlot };
    }
  }
  return null;
}

export function isWinccLimitSuffixVariable(rawName: string | null | undefined): boolean {
  return parseWinccLimitSuffix(rawName) != null;
}

/** 管理端子行排序：PT_Floor → PT_Top → TT_Floor → … */
export function limitSuffixSortRank(variableName: string | null | undefined): number {
  const p = parseWinccLimitSuffix(variableName);
  if (!p) return 9999;
  const phys =
    p.metricKindCode.toUpperCase() === "PRESSURE" ? 0 : p.metricKindCode.toUpperCase() === "TEMP" ? 10 : 20;
  return phys + (p.minSlot ? 0 : 1);
}
