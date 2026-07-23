/** FILE 字段存值：文件模板库 id + 展示名 */
export type FileFieldValue = {
  id: string;
  name: string;
};

export function parseFileFieldValue(value: unknown): FileFieldValue | null {
  if (value == null || value === '' || value === 'null') return null;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const v = value as FileFieldValue;
    if (typeof v.id === 'string' && v.id) return v;
    if (typeof v.name === 'string' && v.name) return { id: '', name: v.name };
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as FileFieldValue;
        if (parsed?.id) return parsed;
        if (parsed?.name) return { id: '', name: parsed.name };
      } catch {
        /* legacy plain string */
      }
    }
    return { id: '', name: trimmed };
  }
  return null;
}

export function serializeFileFieldValue(v: FileFieldValue): string {
  return JSON.stringify(v);
}
