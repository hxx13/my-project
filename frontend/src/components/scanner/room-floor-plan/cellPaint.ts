import type { CageColorConfig } from "@/api/domains/cageShelf.api";

export interface StatusEntry {
  code: string;
}

/**
 * 多状态底色 —— 与 CellButton 同规则：收集所有非 NORMAL 状态色，
 * 2 个及以上时竖向平分（每个色带 1/n），1 个时返回该色，0 个返回 null。
 */
export function resolveMultiStatusBackground(
  statuses: StatusEntry[] | undefined,
  colors: CageColorConfig,
): string | null {
  const bgs: string[] = [];
  (statuses ?? [])
    .filter((s) => s.code !== "NORMAL")
    .forEach((s) => {
      const c = colors[s.code];
      if (c) bgs.push(c.bg);
    });

  if (bgs.length === 0) return null;
  if (bgs.length === 1) return bgs[0];

  const stops = bgs
    .map((bg, i) => {
      const pct = Math.round((i / bgs.length) * 100);
      const pctNext = Math.round(((i + 1) / bgs.length) * 100);
      return `${bg} ${pct}%, ${bg} ${pctNext}%`;
    })
    .join(", ");
  return `linear-gradient(to bottom, ${stops})`;
}
