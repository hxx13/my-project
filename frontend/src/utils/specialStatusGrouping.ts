import type { SpecialStatusCage, SpecialStatusGroup } from "@/api/domains/cageShelf.api";

/** 笼架分组键：同一 shelveId 下的笼位归为一组 */
export function shelfGroupKey(cage: SpecialStatusCage): string {
  return String(cage.shelveId || `${cage.roomName}-${cage.campusName}`);
}

/** 分组标题：房间 · 笼架名称（例：210 · 210A架） */
export function formatShelfGroupTitle(cage: SpecialStatusCage): string {
  const room = (cage.roomName || "").trim() || "—";
  const shelf = (cage.shelveName || "").trim() || cage.shelveId || "—";
  return `${room} · ${shelf}`;
}

/** 分组副标题：校区 + 楼层（例：浦东 2F） */
export function formatShelfGroupMeta(cage: SpecialStatusCage): string {
  const parts: string[] = [];
  if (cage.campusName?.trim()) parts.push(cage.campusName.trim());
  if (cage.floorName?.trim()) parts.push(cage.floorName.trim());
  return parts.join(" ");
}

export interface SpecialStatusShelfGroup {
  key: string;
  title: string;
  meta: string;
  cages: SpecialStatusCage[];
}

export interface SpecialStatusGroupEnriched extends SpecialStatusGroup {
  shelfGroups: SpecialStatusShelfGroup[];
}

/** 将状态组内的笼位按房间+笼架二级分组 */
export function groupCagesByShelf(cages: SpecialStatusCage[]): SpecialStatusShelfGroup[] {
  const map = new Map<string, SpecialStatusShelfGroup>();
  for (const cage of cages) {
    const key = shelfGroupKey(cage);
    const existing = map.get(key);
    if (existing) {
      existing.cages.push(cage);
    } else {
      map.set(key, {
        key,
        title: formatShelfGroupTitle(cage),
        meta: formatShelfGroupMeta(cage),
        cages: [cage],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const metaCmp = a.meta.localeCompare(b.meta, "zh-CN");
    if (metaCmp !== 0) return metaCmp;
    return a.title.localeCompare(b.title, "zh-CN");
  });
}

/** 为总览数据附加二级笼架分组 */
export function enrichSpecialStatusGroups(groups: SpecialStatusGroup[]): SpecialStatusGroupEnriched[] {
  return groups.map((group) => ({
    ...group,
    shelfGroups: groupCagesByShelf(group.cages),
  }));
}
