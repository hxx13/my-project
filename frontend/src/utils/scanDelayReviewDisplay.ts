/** 延迟免冻结审核列表：选项分组与展示文案（Web / 小程序共用逻辑） */

export type ScanDelayReviewItem = {
  optionId?: number;
  optionLabel?: string;
};

export function scanDelayOptionDisplayLabel(item: ScanDelayReviewItem): string {
  return item.optionLabel?.trim() || "延迟免冻结";
}

/** 分组键：优先 optionLabel，其次 optionId，最后兜底文案 */
export function scanDelayOptionGroupKey(item: ScanDelayReviewItem): string {
  const label = item.optionLabel?.trim();
  if (label) return label;
  if (item.optionId) return `option:${item.optionId}`;
  return "__default__";
}

export type ScanDelayOptionGroup<T extends ScanDelayReviewItem> = {
  groupKey: string;
  optionLabel: string;
  count: number;
  items: T[];
};

/** Web 语义色：按选项稳定映射，不同选项不同颜色 */
export const SCAN_DELAY_OPTION_COLOR_VARS = [
  "var(--app-color-accent)",
  "var(--app-color-accent-secondary)",
  "var(--app-color-feedback-success)",
  "var(--app-color-feedback-warning)",
  "var(--app-color-feedback-danger)",
  "var(--app-color-feedback-info)",
  "var(--app-color-notice-announcement-text)",
  "var(--app-color-notice-unbound-text)",
] as const;

/** 小程序对应色（与 Web 调色板顺序一致） */
export const SCAN_DELAY_OPTION_COLOR_HEX = [
  "#d97706",
  "#4a7cac",
  "#16a34a",
  "#ca8a04",
  "#dc2626",
  "#2563eb",
  "#0e7490",
  "#b45309",
] as const;

function hashGroupKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function scanDelayOptionColorIndex(item: ScanDelayReviewItem): number {
  return hashGroupKey(scanDelayOptionGroupKey(item)) % SCAN_DELAY_OPTION_COLOR_VARS.length;
}

export function scanDelayOptionWebColor(item: ScanDelayReviewItem): string {
  return SCAN_DELAY_OPTION_COLOR_VARS[scanDelayOptionColorIndex(item)];
}

export function scanDelayOptionMpColor(item: ScanDelayReviewItem): string {
  return SCAN_DELAY_OPTION_COLOR_HEX[scanDelayOptionColorIndex(item)];
}

export function groupScanDelayByOption<T extends ScanDelayReviewItem>(items: T[]): ScanDelayOptionGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = scanDelayOptionGroupKey(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([groupKey, groupItems]) => ({
      groupKey,
      optionLabel: scanDelayOptionDisplayLabel(groupItems[0]),
      count: groupItems.length,
      items: groupItems,
    }))
    .sort((a, b) => a.optionLabel.localeCompare(b.optionLabel, "zh-CN"));
}
