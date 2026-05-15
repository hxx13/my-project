import type { TelemetryWatchlistTag } from "@/api/domains/telemetryWatchlistAdmin.api";
import {
  isWinccLimitSuffixVariable,
  limitSuffixSortRank,
  parseWinccLimitSuffix,
} from "@/utils/telemetryWatchlistLimitNaming";

export type WatchlistMgmtGroup = {
  parentKey: string;
  parent: TelemetryWatchlistTag;
  children: TelemetryWatchlistTag[];
};

function trim(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** 与后端 findParentMetricVariable 对齐（管理端无 kind_role，仅用指标码 + 变量名）。 */
export function findParentMetricTagForLimit(
  limitRow: TelemetryWatchlistTag,
  candidates: TelemetryWatchlistTag[]
): TelemetryWatchlistTag | null {
  const pl = parseWinccLimitSuffix(limitRow.winccVariableName);
  if (!pl) return null;
  const base = pl.base.trim();
  const mk = pl.metricKindCode.toUpperCase();
  const pool = candidates.filter((c) => !isWinccLimitSuffixVariable(c.winccVariableName));

  const matchMk = (c: TelemetryWatchlistTag) =>
    trim(c.metricKindCode).toUpperCase() === mk && trim(c.metricKindCode).length > 0;

  for (const c of pool) {
    if (!matchMk(c)) continue;
    const vn = trim(c.winccVariableName);
    if (vn === base) return c;
  }
  for (const c of pool) {
    if (!matchMk(c)) continue;
    const vn = trim(c.winccVariableName);
    if (vn.toLowerCase() === base.toLowerCase()) return c;
  }
  const prefixed = pool
    .filter((c) => {
      if (!matchMk(c)) return false;
      const vn = trim(c.winccVariableName);
      if (vn.length < base.length || !vn.startsWith(base)) return false;
      if (vn.length === base.length) return false;
      const next = vn.charAt(base.length);
      return next === "_" || next === ".";
    })
    .sort((a, b) => trim(a.winccVariableName).length - trim(b.winccVariableName).length);
  return prefixed[0] ?? null;
}

function compareMgmtParentOrder(a: TelemetryWatchlistTag, b: TelemetryWatchlistTag): number {
  const fa = trim(a.floorCode).localeCompare(trim(b.floorCode), "zh-Hans-CN", { numeric: true });
  if (fa !== 0) return fa;
  const ra = trim(a.roomCanonical).localeCompare(trim(b.roomCanonical), "zh-Hans-CN", { numeric: true });
  if (ra !== 0) return ra;
  return trim(a.winccVariableName).localeCompare(trim(b.winccVariableName), "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortLimitChildren(children: TelemetryWatchlistTag[]): TelemetryWatchlistTag[] {
  return [...children].sort(
    (a, b) =>
      limitSuffixSortRank(a.winccVariableName) - limitSuffixSortRank(b.winccVariableName) ||
      trim(a.winccVariableName).localeCompare(trim(b.winccVariableName), "zh-Hans-CN", {
        numeric: true,
        sensitivity: "base",
      })
  );
}

export function buildWatchlistManagementGroups(
  tags: TelemetryWatchlistTag[],
  tagRowKeyFn: (r: TelemetryWatchlistTag) => string
): { groups: WatchlistMgmtGroup[]; orphanLimits: TelemetryWatchlistTag[] } {
  const nonLimits = tags.filter((t) => !isWinccLimitSuffixVariable(t.winccVariableName));
  const limits = tags.filter((t) => isWinccLimitSuffixVariable(t.winccVariableName));
  const childrenByParentKey = new Map<string, TelemetryWatchlistTag[]>();
  const orphanLimits: TelemetryWatchlistTag[] = [];

  for (const lim of limits) {
    const parent = findParentMetricTagForLimit(lim, nonLimits);
    if (!parent) {
      orphanLimits.push(lim);
      continue;
    }
    const pk = tagRowKeyFn(parent);
    const arr = childrenByParentKey.get(pk) ?? [];
    arr.push(lim);
    childrenByParentKey.set(pk, arr);
  }

  const groups: WatchlistMgmtGroup[] = nonLimits
    .slice()
    .sort(compareMgmtParentOrder)
    .map((parent) => {
      const pk = tagRowKeyFn(parent);
      return {
        parentKey: pk,
        parent,
        children: sortLimitChildren(childrenByParentKey.get(pk) ?? []),
      };
    });

  orphanLimits.sort((a, b) =>
    trim(a.winccVariableName).localeCompare(trim(b.winccVariableName), "zh-Hans-CN", {
      numeric: true,
      sensitivity: "base",
    })
  );

  return { groups, orphanLimits };
}

/**
 * 编辑映射表时保持 {@code tags} 数组顺序，避免父行楼层/房间被推断改写后整表按结构化键重排导致「跳行」。
 * 分组与限值挂载逻辑同 {@link buildWatchlistManagementGroups}，仅父组顺序按各主行在 {@code tags} 中首次出现下标排序。
 */
export function buildWatchlistManagementGroupsStable(
  tags: TelemetryWatchlistTag[],
  tagRowKeyFn: (r: TelemetryWatchlistTag) => string
): { groups: WatchlistMgmtGroup[]; orphanLimits: TelemetryWatchlistTag[] } {
  const base = buildWatchlistManagementGroups(tags, tagRowKeyFn);
  const firstIndex = new Map<string, number>();
  tags.forEach((t, i) => {
    const k = tagRowKeyFn(t);
    if (!firstIndex.has(k)) firstIndex.set(k, i);
  });
  const groups = [...base.groups].sort((a, b) => {
    const ia = firstIndex.get(a.parentKey) ?? Number.MAX_SAFE_INTEGER;
    const ib = firstIndex.get(b.parentKey) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });
  const orphanLimits = [...base.orphanLimits].sort((a, b) => {
    const ia = firstIndex.get(tagRowKeyFn(a)) ?? Number.MAX_SAFE_INTEGER;
    const ib = firstIndex.get(tagRowKeyFn(b)) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });
  return { groups, orphanLimits };
}

/** 保存后或手动「重排」：按楼层→房间→变量名的管理树顺序扁平化为稳定列表。 */
export function sortTagsByManagementTreeOrder(
  tags: TelemetryWatchlistTag[],
  tagRowKeyFn: (r: TelemetryWatchlistTag) => string
): TelemetryWatchlistTag[] {
  const { groups, orphanLimits } = buildWatchlistManagementGroups(tags, tagRowKeyFn);
  const out: TelemetryWatchlistTag[] = [];
  for (const g of groups) {
    out.push(g.parent);
    out.push(...g.children);
  }
  out.push(...orphanLimits);
  return out;
}

/**
 * 与 {@link sortTagsByManagementTreeOrder} 相反：管理树从末组到首组；每组内限值子行倒序；未匹配限值倒序接尾。
 * WinCC 变量导入页默认用此顺序，使 CSV 语义上「靠后的行」更接近表头展示。
 */
export function sortTagsByManagementTreeOrderDesc(
  tags: TelemetryWatchlistTag[],
  tagRowKeyFn: (r: TelemetryWatchlistTag) => string
): TelemetryWatchlistTag[] {
  const { groups, orphanLimits } = buildWatchlistManagementGroups(tags, tagRowKeyFn);
  const out: TelemetryWatchlistTag[] = [];
  for (const g of [...groups].reverse()) {
    out.push(g.parent);
    out.push(...[...g.children].reverse());
  }
  out.push(...[...orphanLimits].reverse());
  return out;
}

/** 将限值行的楼层/房间/类别从匹配到的主测量复制（不修改展示映射）。 */
export function syncLimitStructuredFieldsFromParents(tags: TelemetryWatchlistTag[]): TelemetryWatchlistTag[] {
  const nonLimits = tags.filter((t) => !isWinccLimitSuffixVariable(t.winccVariableName));
  return tags.map((row) => {
    if (!isWinccLimitSuffixVariable(row.winccVariableName)) return row;
    const parent = findParentMetricTagForLimit(row, nonLimits);
    if (!parent) return row;
    return {
      ...row,
      floorCode: trim(parent.floorCode) ? parent.floorCode : row.floorCode,
      roomCanonical: trim(parent.roomCanonical) ? parent.roomCanonical : row.roomCanonical,
      metricKindCode: trim(parent.metricKindCode) ? parent.metricKindCode : row.metricKindCode,
    };
  });
}

export function hasStructuredFieldsForPoll(row: TelemetryWatchlistTag): boolean {
  return Boolean(trim(row.floorCode) && trim(row.roomCanonical) && trim(row.metricKindCode));
}

/** 与 Admin「展示映射有效」一致：非空且非字面量「无」。 */
export function hasValidWatchlistDisplayMapping(displayLabel: string | null | undefined): boolean {
  const t = (displayLabel ?? "").trim();
  return t.length > 0 && t !== "无";
}

/** 限值行可无展示映射启用：须具备楼层/房间/类别 */
export function canEnableWithoutDisplayMapping(row: TelemetryWatchlistTag): boolean {
  return isWinccLimitSuffixVariable(row.winccVariableName) && hasStructuredFieldsForPoll(row);
}

/**
 * 先 {@link syncLimitStructuredFieldsFromParents}，再将<strong>已匹配主测量且三列齐备</strong>的限值行设为启用；
 * 主测量行仍仅在有展示映射时启用。
 */
export function applyMatchedLimitsAutoEnable(tags: TelemetryWatchlistTag[]): TelemetryWatchlistTag[] {
  const synced = syncLimitStructuredFieldsFromParents(tags);
  const nonLimits = synced.filter((t) => !isWinccLimitSuffixVariable(t.winccVariableName));
  return synced.map((r) => {
    if (!isWinccLimitSuffixVariable(r.winccVariableName)) {
      return { ...r, enabled: hasValidWatchlistDisplayMapping(r.displayLabel) };
    }
    const matched = findParentMetricTagForLimit(r, nonLimits) != null;
    const structuredOk = hasStructuredFieldsForPoll(r);
    const en = hasValidWatchlistDisplayMapping(r.displayLabel) || (matched && structuredOk);
    return { ...r, enabled: en };
  });
}
