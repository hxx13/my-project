/**
 * NHP 编辑器纯工具函数（从 AUP 编辑器模式抽取，可单测）。
 * 见《数据库字段档案》15-编辑器子组件设计.md
 */
import type { FieldType, FormField, FormSection, ShowWhen } from "../schema/formTemplate";

export function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function nextSectionCode(existing: string[]): string {
  const used = new Set(existing.map((c) => c.toUpperCase()));
  for (let i = 1; i <= 20; i++) {
    const c = `D${i}`;
    if (!used.has(c)) return c;
  }
  let n = 21;
  while (used.has(`D${n}`)) n++;
  return `D${n}`;
}

export function nextSubsectionNumber(codes: string[], sectionCode: string): number {
  const prefix = sectionCode + ".";
  const nums = codes
    .map((c) => {
      if (c.toUpperCase().startsWith(prefix.toUpperCase())) {
        const n = parseInt(c.slice(prefix.length), 10);
        return Number.isNaN(n) ? -1 : n;
      }
      return -1;
    })
    .filter((n) => n > 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

export function slugify(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, "_").replace(/^_+|_+$/g, "");
}

export function nextFieldKey(parentCode: string, existing: string[], label?: string): string {
  const base = parentCode + ".";
  const used = new Set(existing);
  const slug = slugify(label ?? "");
  if (slug) {
    const cand = base + slug;
    if (!used.has(cand)) return cand;
    let i = 2;
    while (used.has(`${cand}${i}`)) i++;
    return `${cand}${i}`;
  }
  let i = 1;
  while (used.has(`${base}field${i}`)) i++;
  return `${base}field${i}`;
}

export function collectFieldKeys(sec: FormSection): string[] {
  const keys = (sec.fields ?? []).map((f) => f.fieldKey);
  (sec.subsections ?? []).forEach((u) => u.fields.forEach((f) => keys.push(f.fieldKey)));
  return keys;
}

export function collectAllFields(tree: FormSection[]): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  tree.forEach((s) => {
    (s.fields ?? []).forEach((f) => out.push({ key: f.fieldKey, label: f.label }));
    (s.subsections ?? []).forEach((u) => u.fields.forEach((f) => out.push({ key: f.fieldKey, label: f.label })));
  });
  return out;
}

export interface FieldCatalogEntry {
  key: string;
  label: string;
  containerCode: string;
  containerLabel: string;
  type?: FieldType;
  optionValues: string[];
}

export function normalizeOptions(
  options: FormField["options"],
): { value: string; label: string; fixed?: boolean; group?: string }[] {
  return (options ?? []).map((o) =>
    typeof o === "string" ? { value: o, label: o } : { value: o.value, label: o.label, fixed: o.fixed, group: o.group },
  );
}

export function buildFieldCatalog(tree: FormSection[]): FieldCatalogEntry[] {
  const out: FieldCatalogEntry[] = [];
  const push = (f: FormField, containerCode: string, containerLabel: string) => {
    out.push({
      key: f.fieldKey,
      label: f.label || f.fieldKey,
      containerCode,
      containerLabel,
      type: f.type,
      optionValues: normalizeOptions(f.options)
        .map((o) => o.value)
        .filter(Boolean),
    });
  };
  tree.forEach((s) => {
    const secLabel = [s.code, s.label].filter(Boolean).join(" · ") || `板块 ${s.code}`;
    (s.fields ?? []).forEach((f) => push(f, s.code, secLabel));
    (s.subsections ?? []).forEach((u) => {
      const subLabel = [u.code, u.label].filter(Boolean).join(" · ") || `小节 ${u.code}`;
      u.fields.forEach((f) => push(f, u.code, subLabel));
    });
  });
  return out;
}

export function describeShowWhen(sw: ShowWhen, fieldOptions: { key: string; label: string }[]): string {
  const field = fieldOptions.find((o) => o.key === sw.field);
  const fieldLabel = field?.label || sw.field;
  const v = String(sw.value ?? "");
  switch (sw.op) {
    case "equals":
      return `当「${fieldLabel}」为「${v}」时显示`;
    case "notEquals":
      return `当「${fieldLabel}」不为「${v}」时显示`;
    case "contains":
      return `当「${fieldLabel}」选择「${v}」时显示`;
    case "notContains":
      return `当「${fieldLabel}」未选择「${v}」时显示`;
    case "notEmpty":
      return `当「${fieldLabel}」已填写时显示`;
    case "empty":
      return `当「${fieldLabel}」未填写时显示`;
    default:
      return "";
  }
}

export function findField(sections: FormSection[], fieldKey: string | null): FormField | null {
  if (!fieldKey) return null;
  for (const sec of sections) {
    for (const sub of sec.subsections ?? []) {
      const hit = sub.fields.find((f) => f.fieldKey === fieldKey);
      if (hit) return hit;
    }
    const hit = (sec.fields ?? []).find((f) => f.fieldKey === fieldKey);
    if (hit) return hit;
  }
  return null;
}

export type FieldPath = { si: number; ui?: number; fi: number };

export function getFieldAt(tree: FormSection[], path: FieldPath): FormField | undefined {
  const s = tree[path.si];
  if (!s) return undefined;
  if (path.ui == null) return (s.fields ?? [])[path.fi];
  return (s.subsections ?? [])[path.ui]?.fields[path.fi];
}

export function statusLabel(s: string): string {
  return s === "DRAFT" ? "草稿" : s === "PUBLISHED" || s === "FROZEN" ? "已发布" : s === "ARCHIVED" ? "已归档" : s;
}
