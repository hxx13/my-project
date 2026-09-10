import type { FmTemplateItem } from "@/api/domains/facilityMaintenance.api";

export function todayStr(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** 兼容网关/旧后端：JSON 字段名大小写或 snake_case 与前端不一致 */
export function pickCi(o: Record<string, unknown> | null | undefined, logical: string): unknown {
  if (!o) return undefined;
  const t = logical.toLowerCase();
  for (const [k, v] of Object.entries(o)) {
    if (k.toLowerCase() === t) return v;
  }
  return undefined;
}

export function sheetRowId(sheet: Record<string, unknown> | null | undefined): string {
  if (!sheet) return "";
  const v = pickCi(sheet, "id") ?? sheet.id;
  return v == null ? "" : String(v);
}

function normalizeTemplateItemRow(it: unknown): FmTemplateItem | null {
  if (!it || typeof it !== "object") return null;
  const o = it as Record<string, unknown>;
  const id = String(pickCi(o, "id") ?? o.id ?? "");
  const label = String(pickCi(o, "label") ?? o.label ?? "").trim();
  const fieldType = String(
    pickCi(o, "fieldType") ?? o.fieldType ?? pickCi(o, "field_type") ?? o.field_type ?? "TEXT"
  )
    .trim()
    .toUpperCase() || "TEXT";
  const optionSetId = pickCi(o, "optionSetId") ?? o.optionSetId ?? pickCi(o, "option_set_id");
  const optionItemsRaw = pickCi(o, "optionItems") ?? o.optionItems ?? pickCi(o, "option_items");
  type OptionRow = NonNullable<FmTemplateItem["optionItems"]>[number];
  let optionItems: FmTemplateItem["optionItems"] = undefined;
  if (Array.isArray(optionItemsRaw)) {
    const out: OptionRow[] = [];
    for (const x of optionItemsRaw as unknown[]) {
      if (!x || typeof x !== "object") continue;
      const ox = x as Record<string, unknown>;
      const oidRaw = pickCi(ox, "id") ?? ox.id;
      const lab = String(pickCi(ox, "label") ?? ox.label ?? "").trim();
      if (!lab && oidRaw == null) continue;
      const row: OptionRow = { label: lab || String(oidRaw) };
      if (oidRaw != null) row.id = String(oidRaw);
      const so = pickCi(ox, "sortOrder") ?? ox.sortOrder;
      if (typeof so === "number" && !Number.isNaN(so)) row.sortOrder = so;
      else if (so != null && String(so).trim() !== "") {
        const n = Number(so);
        if (!Number.isNaN(n)) row.sortOrder = n;
      }
      out.push(row);
    }
    if (out.length > 0) optionItems = out;
  }
  if (!label && !id) return null;
  return {
    id: id || undefined,
    label: label || id || "项",
    fieldType,
    optionSetId: optionSetId == null ? undefined : String(optionSetId),
    optionItems,
  };
}

/** 兼容嵌套 template 被序列化为字符串、或 items 键名差异；逐项规范化字段名 */
export function resolveDailySheetTemplateItems(
  sheet: Record<string, unknown> | null | undefined
): FmTemplateItem[] {
  if (!sheet) return [];
  let tpl: unknown = pickCi(sheet, "template") ?? sheet.template;
  if (tpl == null) return [];
  if (typeof tpl === "string") {
    try {
      tpl = JSON.parse(tpl) as Record<string, unknown>;
    } catch {
      return [];
    }
  }
  if (typeof tpl !== "object" || tpl === null) return [];
  const o = tpl as Record<string, unknown>;
  const raw = pickCi(o, "items") ?? o.items ?? o.Items;
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(normalizeTemplateItemRow).filter((x): x is FmTemplateItem => x != null);
}

export function normalizeSites(raw: unknown): { id: string; name: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const id = String(pickCi(o, "id") ?? o.id ?? "");
      const name = String(pickCi(o, "name") ?? o.name ?? id);
      if (!id) return null;
      return { id, name };
    })
    .filter((x): x is { id: string; name: string } => x != null);
}

export function normalizeCells(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

/** 将协作表 DTO 规范为稳定 camelCase，便于渲染与保存 */
export function normalizeDailyInspectionSheet(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const id = pickCi(raw, "id") ?? raw.id;
  const templateId = pickCi(raw, "templateId") ?? raw.template_id;
  const version = pickCi(raw, "version") ?? raw.version;
  const status = pickCi(raw, "status") ?? raw.status;
  const sheetDate = pickCi(raw, "sheetDate") ?? raw.sheet_date;
  const submittedAt = pickCi(raw, "submittedAt") ?? raw.submitted_at;
  const submittedByName = pickCi(raw, "submittedByName") ?? raw.submitted_by_name;
  let tpl: unknown = pickCi(raw, "template") ?? raw.template;
  if (typeof tpl === "string") {
    try {
      tpl = JSON.parse(tpl) as Record<string, unknown>;
    } catch {
      tpl = {};
    }
  }
  const templateObj =
    tpl && typeof tpl === "object" && tpl !== null ? ({ ...(tpl as Record<string, unknown>) } as Record<string, unknown>) : {};
  const itemsRaw = pickCi(templateObj, "items") ?? templateObj.items ?? templateObj.Items;
  const arr = Array.isArray(itemsRaw) ? itemsRaw : [];
  templateObj.items = arr.map(normalizeTemplateItemRow).filter((x): x is FmTemplateItem => x != null);
  const sites = normalizeSites(pickCi(raw, "sites") ?? raw.sites);
  const cells = normalizeCells(pickCi(raw, "cells") ?? raw.cells);
  return {
    ...raw,
    id: id == null ? undefined : id,
    templateId: templateId == null ? undefined : String(templateId),
    version: typeof version === "number" ? version : Number(version ?? 0),
    status: status == null ? "" : String(status),
    sheetDate: sheetDate == null ? undefined : String(sheetDate),
    submittedAt: submittedAt ?? null,
    submittedByName: submittedByName == null ? undefined : String(submittedByName),
    template: templateObj,
    sites,
    cells,
  };
}

/** 矩阵单元格键：siteId|itemId，供读写统一拼接 */
export function cellKey(siteId: string, itemId: string): string {
  return `${siteId}|${itemId}`;
}

/** 单元格局部合并（乐观更新用），只覆盖传入的键、保留其余 */
export function mergeCells(prev: Record<string, string>, patch: Record<string, string>): Record<string, string> {
  return { ...prev, ...patch };
}
