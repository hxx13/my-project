/**
 * 笼位分配：把「本规格要买的总数」按选中顺序铺到多个笼位上。
 *
 * 规则（用户 2026-09-11 定）：
 *  - 按选中顺序填满，每笼上限 `maxPerCage`（全局配置 animal_order.cage_capacity_per_cage，默认 5）
 *  - 最后一个笼位拿余数（12 只 / 3 笼 / 上限 5 → 5、5、2）
 *  - 手动改过某笼数量时，它作为**起点**先占位，其余笼位按顺序吸收差额；
 *    若还有剩，回头给尚有空位的笼位补上——**容量够就一定让 Σ===总数**，保证「数量匹配」
 *  - 容量不够（笼位数 × 上限 < 总数）时把能放的都放满，多余量走 `overflow` 交给 UI 拦住
 */
export interface AllocationResult {
  /** cageId → 分配数量（顺序与入参一致） */
  alloc: Record<string, number>;
  /** 没能分配出去的多余数量；0 = 刚好放得下 */
  overflow: number;
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.floor(Number.isFinite(v) ? v : 0);
  return Math.max(lo, Math.min(hi, n));
}

/**
 * @param total     本规格要买的总数（规格弹窗填的那个数）
 * @param cageIds   已选笼位，**顺序即分配顺序**
 * @param maxPerCage 单笼上限
 * @param pinned    手动改过的笼位：cageId → 数量（只作为起点，不够放时会被自动加回）
 */
export function allocateInOrder(
  total: number,
  cageIds: string[],
  maxPerCage: number,
  pinned: Record<string, number> = {},
): AllocationResult {
  const cap = Math.max(0, Math.floor(maxPerCage));
  const want = Math.max(0, Math.floor(total));
  const alloc: Record<string, number> = {};
  for (const id of cageIds) alloc[id] = 0;

  if (cageIds.length === 0 || cap === 0) {
    return { alloc, overflow: want };
  }

  let remaining = want;

  // 1) 手动改过的先占位（不超过上限，也不超过总数）
  for (const id of cageIds) {
    if (!(id in pinned)) continue;
    const v = clampInt(pinned[id], 0, Math.min(cap, remaining));
    alloc[id] = v;
    remaining -= v;
  }

  // 2) 其余按顺序铺满
  for (const id of cageIds) {
    if (id in pinned) continue;
    const v = Math.min(cap, remaining);
    alloc[id] = v;
    remaining -= v;
  }

  // 3) 还有剩就回头给尚有空位的笼位补上（容量够 ⇒ Σ 一定等于总数）
  if (remaining > 0) {
    for (const id of cageIds) {
      if (remaining <= 0) break;
      const spare = cap - alloc[id];
      if (spare <= 0) continue;
      const v = Math.min(spare, remaining);
      alloc[id] += v;
      remaining -= v;
    }
  }

  return { alloc, overflow: remaining };
}

/** Σ分配量。 */
export function allocatedTotal(alloc: Record<string, number>): number {
  return Object.values(alloc).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
}

/**
 * 只保留分配量 > 0 的笼位，并保持原顺序。
 * 提交时用：多选的盒子最后没分到老鼠的，要自动取消掉。
 */
export function keepAllocated<T extends { animalCageId: string }>(
  cages: T[],
  alloc: Record<string, number>,
): T[] {
  return cages.filter((c) => (alloc[c.animalCageId] || 0) > 0);
}
