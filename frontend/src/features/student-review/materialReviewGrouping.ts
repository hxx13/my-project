import type { MaterialRequest } from "@/api/domains/material.api";

/** 无规格快照时的分组键 */
export const NO_SPEC_KEY = "__no_spec__";

/** 与后端状态枚举对齐：PENDING=待审核、FIRST_OK=初审通过（仍待复审） */
export function isMaterialPendingStatus(status: string): boolean {
  return status === "PENDING" || status === "FIRST_OK";
}

export function primaryItemName(req: MaterialRequest): string {
  return req.lines?.[0]?.snapshotName || "未命名物品";
}

export function groupByItemName(reqs: MaterialRequest[]): Map<string, MaterialRequest[]> {
  const map = new Map<string, MaterialRequest[]>();
  for (const r of reqs) {
    const k = primaryItemName(r);
    const list = map.get(k) || [];
    list.push(r);
    map.set(k, list);
  }
  return map;
}

export function groupBySpec(reqs: MaterialRequest[]): Map<string, MaterialRequest[]> {
  const map = new Map<string, MaterialRequest[]>();
  for (const r of reqs) {
    const k = r.lines?.[0]?.specSnapshot || NO_SPEC_KEY;
    const list = map.get(k) || [];
    list.push(r);
    map.set(k, list);
  }
  return map;
}

/** 物品层初始折叠集：无待审请求的物品折叠，含待审的保持展开。 */
export function initiallyCollapsedItems(reqs: MaterialRequest[]): Set<string> {
  const collapsed = new Set<string>();
  for (const [itemName, itemReqs] of groupByItemName(reqs)) {
    if (!itemReqs.some((r) => isMaterialPendingStatus(r.status))) collapsed.add(itemName);
  }
  return collapsed;
}

/**
 * 规格层初始折叠集：只折叠「不含待审请求」的规格。
 * 待审规格必须保持展开，否则多规格物品下审核人看不出哪一层需要处理。
 * 单品规物品不折叠（物品层展开即直接看到卡片）。
 */
export function initiallyCollapsedSpecs(reqs: MaterialRequest[]): Set<string> {
  const collapsed = new Set<string>();
  for (const [itemName, itemReqs] of groupByItemName(reqs)) {
    const specs = groupBySpec(itemReqs);
    if (specs.size <= 1) continue;
    for (const [specKey, specReqs] of specs) {
      if (!specReqs.some((r) => isMaterialPendingStatus(r.status))) {
        collapsed.add(`${itemName}::${specKey}`);
      }
    }
  }
  return collapsed;
}
