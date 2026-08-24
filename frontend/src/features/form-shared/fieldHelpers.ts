/** 选项条目（与 AUP/NHP formTemplate 对齐） */
export interface OptionItem {
  value: string;
  label: string;
  fixed?: boolean;
  group?: string;
}

export function normalizeOptions(options?: Array<OptionItem | string>): OptionItem[] {
  if (!options) return [];
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

/** 级联值：对象 keyed by level 名或单字符串（旧数据） */
export function parseCascadeValue(value: unknown): Record<string, string> {
  if (value == null) return {};
  if (typeof value === "string") {
    const s = value.trim();
    return s ? { _legacy: s } : {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v != null && String(v).trim() !== "") out[k] = String(v);
    }
    return out;
  }
  return {};
}

/** 级联某层可选选项：首层全量；后续层按 group 匹配上一层取值 */
export function cascadeOptionsForLevel(
  all: OptionItem[],
  levels: string[],
  levelIndex: number,
  current: Record<string, string>,
): OptionItem[] {
  if (levelIndex <= 0) return all;
  const prevKey = levels[levelIndex - 1];
  const prevVal = current[prevKey] ?? current[String(levelIndex - 1)] ?? "";
  if (!prevVal) return [];
  const grouped = all.filter((o) => o.group === prevVal);
  return grouped.length > 0 ? grouped : all;
}

export function cascadePatch(
  levels: string[],
  current: Record<string, string>,
  levelKey: string,
  levelIndex: number,
  newVal: string,
): Record<string, string> {
  const next = { ...current, [levelKey]: newVal };
  for (let i = levelIndex + 1; i < levels.length; i++) {
    delete next[levels[i]];
  }
  return next;
}

/** 上传前校验 maxCount / maxSize */
export function validateFileUpload(
  file: File,
  currentCount: number,
  config?: { maxCount?: number; maxSize?: number },
): string | null {
  const maxCount = config?.maxCount ?? 10;
  if (currentCount >= maxCount) return `最多上传 ${maxCount} 个文件`;
  const maxSize = config?.maxSize ?? 20 * 1024 * 1024;
  if (file.size > maxSize) return `文件大小超过上限（${(maxSize / 1024 / 1024).toFixed(1)} MB）`;
  return null;
}

export function defaultImageAccept(): string {
  return "image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp";
}

export function fileIdsFromValue(value: unknown): number[] {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }
  if (value != null && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? [n] : [];
  }
  return [];
}

export function multiSelectValues(value: unknown): string[] {
  if (Array.isArray(value)) return (value as unknown[]).map(String);
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}
