/**
 * 导出小计配置 —— 纯函数 + localStorage 读写。
 *
 * 采用「排除法」存储：state 里存的是被关掉的层级 / 被排除的板块，
 * 这样后端新增层级 / 板块时默认仍是「保留」，用户不必重新勾一遍。
 *
 * 后端契约（本单元只按契约折算，不改后端）：
 * - levels：要保留的小计层级，逗号子集；缺省/空 = 全保留；哨兵 `none` = 一个都不保留
 * - excludeBlocks：不要小计的板块 key，逗号分隔
 */

export type SubtotalConfigState = {
  /** 被关掉的小计层级（排除法） */
  offLevels: string[];
  /** 被排除的板块 key（排除法） */
  excludeBlocks: string[];
};

export type SubtotalBlock = {
  key: string;
  label: string;
  detailCount: number;
  subtotalCounts: { lv1: number; lv2: number; lv3: number };
};

/** `…/export/summary` 兄弟端点的返回结构（字段名固定）。 */
export type SubtotalSummary = {
  /** 该导出实际存在的层级，如 ["total","lv1","lv2","lv3"] */
  levels: string[];
  levelLabels: Record<string, string>;
  blocks: SubtotalBlock[];
  totals: {
    detailRows: number;
    blocks: number;
    subtotals: { lv1: number; lv2: number; lv3: number; total: number };
  };
};

export function emptyConfig(): SubtotalConfigState {
  return { offLevels: [], excludeBlocks: [] };
}

/** localStorage 在 node / 隐私模式下可能不存在，读不到就当空配置，绝不抛错。 */
function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function loadConfig(storageKey: string): SubtotalConfigState {
  const s = storage();
  if (!s) return emptyConfig();

  let raw: string | null;
  try {
    raw = s.getItem(storageKey);
  } catch {
    return emptyConfig();
  }
  if (raw == null) return emptyConfig();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyConfig();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyConfig();

  const { offLevels, excludeBlocks } = parsed as Record<string, unknown>;
  if (!isStringArray(offLevels) || !isStringArray(excludeBlocks)) return emptyConfig();

  return { offLevels: [...offLevels], excludeBlocks: [...excludeBlocks] };
}

export function saveConfig(storageKey: string, state: SubtotalConfigState): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(storageKey, JSON.stringify(state));
  } catch {
    // 配额 / 隐私模式：配置只是便利项，写失败不影响主流程
  }
}

/**
 * 折算成后端 query。
 * - 只保留 allLevels（摘要）里真实存在的层级，用户存了不存在的层级也不写出去
 * - 全关时后端把空 levels 当「全保留」，故必须传哨兵 `none`
 */
export function toQuery(
  state: SubtotalConfigState,
  allLevels: string[],
): { levels: string; excludeBlocks: string } {
  const off = new Set(state.offLevels);
  const kept = allLevels.filter((l) => !off.has(l));
  return {
    levels: kept.length === 0 ? "none" : kept.join(","),
    excludeBlocks: state.excludeBlocks.join(","),
  };
}

export function blockIncluded(state: SubtotalConfigState, key: string): boolean {
  return !state.excludeBlocks.includes(key);
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function toggleBlock(state: SubtotalConfigState, key: string): SubtotalConfigState {
  return { ...state, excludeBlocks: toggle(state.excludeBlocks, key) };
}

export function toggleLevel(state: SubtotalConfigState, level: string): SubtotalConfigState {
  return { ...state, offLevels: toggle(state.offLevels, level) };
}

export function resetConfig(): SubtotalConfigState {
  return emptyConfig();
}
