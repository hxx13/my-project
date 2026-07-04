/** 物资规格解析（Web / H5 / 快捷业务共用，对齐小程序 specSchemaUtil） */

export interface SpecDimension {
  name: string;
  options: string[];
}

export interface SpecCombo {
  key: string;
  label: string;
  dims: Record<string, string>;
}

/** 每个规格维度可多选：{ 颜色: ['红','蓝'], 尺码: ['大'] } */
export type MultiSpecSelections = Record<string, string[]>;

export interface MaterialSpecPickerItem {
  id: number;
  name: string;
  subtitle?: string | null;
  specSchema?: string | null;
  specRequired?: number;
  stockMode?: string;
  stockQty?: number;
  showStockQty?: number;
  coverUrl?: string | null;
}

export function parseSpecDimensions(specSchema?: string | null): SpecDimension[] {
  if (!specSchema) return [];
  try {
    const obj = typeof specSchema === "string" ? JSON.parse(specSchema) : specSchema;
    if (!obj || typeof obj !== "object") return [];
    if (Array.isArray(obj.dimensions) && obj.dimensions.length) {
      return obj.dimensions
        .map((d: { name?: string; options?: string[] }) => ({
          name: d?.name != null ? String(d.name).trim() : "",
          options: Array.isArray(d?.options)
            ? d.options.map((o) => String(o).trim()).filter(Boolean)
            : [],
        }))
        .filter((d: SpecDimension) => d.name && d.options.length > 0);
    }
    return Object.keys(obj)
      .filter((k) => k !== "dimensions" && Array.isArray((obj as Record<string, unknown>)[k]))
      .map((k) => ({
        name: String(k).trim(),
        options: ((obj as Record<string, string[]>)[k] || [])
          .map((o) => String(o).trim())
          .filter(Boolean),
      }))
      .filter((d) => d.name && d.options.length > 0);
  } catch {
    return [];
  }
}

export function hasSpecSchema(specSchema?: string | null): boolean {
  return parseSpecDimensions(specSchema).length > 0;
}

export function generateSpecCombos(dimensions: SpecDimension[]): SpecCombo[] {
  if (!dimensions.length) return [];
  let combos: Record<string, string>[] = [{}];
  for (const dim of dimensions) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const opt of dim.options) {
        next.push({ ...combo, [dim.name]: opt });
      }
    }
    combos = next;
  }
  return combos.map((dims) => {
    const entries = Object.keys(dims).map((k) => `${k}=${dims[k]}`);
    return {
      key: entries.join("|"),
      label: Object.values(dims).join("·"),
      dims,
    };
  });
}

export function buildSpecCartKey(itemId: number, comboKey: string): string {
  return `${itemId}::${comboKey}`;
}

export function itemIdFromCartKey(key: string): number {
  if (!key) return 0;
  if (key.includes("::")) return Number(key.split("::")[0]);
  return Number(key);
}

export function sumCartQtyForItem(cart: Record<string, number>, itemId: number): number {
  return Object.entries(cart || {}).reduce((sum, [k, qty]) => {
    if (itemIdFromCartKey(k) !== itemId) return sum;
    return sum + (Number(qty) || 0);
  }, 0);
}

export function filterCombosBySelections(
  combos: SpecCombo[],
  selections?: Record<string, string> | MultiSpecSelections | null,
): SpecCombo[] {
  if (!selections || !Object.keys(selections).length) return [];
  if (isMultiSpecSelections(selections)) {
    return filterCombosByMultiSelections(combos, selections);
  }
  return combos.filter((combo) =>
    Object.keys(selections).every((dimName) => {
      const sel = (selections as Record<string, string>)[dimName];
      if (sel == null || sel === "") return true;
      return combo.dims[dimName] === sel;
    }),
  );
}

export function isMultiSpecSelections(
  selections: Record<string, string> | MultiSpecSelections,
): selections is MultiSpecSelections {
  return Object.values(selections).some((v) => Array.isArray(v));
}

export function isSpecOptionSelected(
  selections: MultiSpecSelections,
  dimName: string,
  opt: string,
): boolean {
  return (selections[dimName] || []).includes(opt);
}

export function toggleMultiSpecOption(
  selections: MultiSpecSelections,
  dimName: string,
  opt: string,
): MultiSpecSelections {
  const cur = selections[dimName] || [];
  const next = { ...selections };
  if (cur.includes(opt)) {
    const filtered = cur.filter((x) => x !== opt);
    if (filtered.length) next[dimName] = filtered;
    else delete next[dimName];
  } else {
    next[dimName] = [...cur, opt];
  }
  return next;
}

export function hasAnyMultiSpecSelection(selections?: MultiSpecSelections | null): boolean {
  if (!selections) return false;
  return Object.values(selections).some((arr) => arr.length > 0);
}

/** 每个规格维度至少选中一项时可展示数量行 */
export function isMultiSpecSelectionReady(
  dimensions: SpecDimension[],
  selections?: MultiSpecSelections | null,
): boolean {
  if (!dimensions.length) return false;
  if (!selections) return false;
  return dimensions.every((d) => (selections[d.name] || []).length > 0);
}

export function filterCombosByMultiSelections(
  combos: SpecCombo[],
  selections?: MultiSpecSelections | null,
): SpecCombo[] {
  if (!selections || !hasAnyMultiSpecSelection(selections)) return [];
  return combos.filter((combo) =>
    Object.keys(selections).every((dimName) => {
      const opts = selections[dimName];
      if (!opts || !opts.length) return true;
      return opts.includes(combo.dims[dimName]);
    }),
  );
}

/** @deprecated 使用 isMultiSpecSelectionReady */
export function isSpecSelectionComplete(
  dimensions: SpecDimension[],
  selections?: Record<string, string> | MultiSpecSelections | null,
): boolean {
  if (!selections) return false;
  if (isMultiSpecSelections(selections as MultiSpecSelections)) {
    return isMultiSpecSelectionReady(dimensions, selections as MultiSpecSelections);
  }
  if (!dimensions.length) return false;
  return dimensions.every((d) => {
    const v = (selections as Record<string, string>)[d.name];
    return v != null && v !== "";
  });
}

export function materialStockLineText(item: MaterialSpecPickerItem | null | undefined): string {
  if (!item) return "";
  if (item.stockMode === "UNLIMITED") return "无限";
  if (item.stockMode === "FLAG") return Number(item.stockQty) >= 1 ? "有货" : "缺货";
  if (item.showStockQty === 0) return "有货";
  return `库存 ${item.stockQty != null ? item.stockQty : 0}`;
}

export function maxQtyForMaterialItem(item: MaterialSpecPickerItem | null | undefined): number {
  if (!item) return 0;
  if (item.stockMode === "UNLIMITED") return 999;
  if (item.stockMode === "QUANTIFIED") return Math.max(0, Number(item.stockQty) || 0);
  return Number(item.stockQty) >= 1 ? 99 : 0;
}

export function isMaterialOutOfStock(item: MaterialSpecPickerItem | null | undefined): boolean {
  return maxQtyForMaterialItem(item) <= 0;
}
