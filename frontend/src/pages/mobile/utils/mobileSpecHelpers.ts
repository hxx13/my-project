/** 与小程序 package-feature/utils/specSchemaUtil.js 对齐 */

export interface SpecDimension {
  name: string;
  options: string[];
}

export interface SpecCombo {
  key: string;
  label: string;
  dims: Record<string, string>;
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

export function parseSpecCartKey(key: string): {
  itemId: number;
  specLabel: string;
  specSnapshot: Record<string, string> | null;
} {
  if (!key || !key.includes("::")) {
    return { itemId: Number(key), specLabel: "", specSnapshot: null };
  }
  const [idStr, specStr] = key.split("::");
  const pairs = specStr.split("|").map((p) => p.split("="));
  const specSnapshot: Record<string, string> = {};
  pairs.forEach(([k, v]) => {
    if (k && v != null) specSnapshot[k] = v;
  });
  const specLabel = pairs.map((p) => p[1]).filter(Boolean).join("·");
  return { itemId: Number(idStr), specLabel, specSnapshot };
}

export function formatSpecLabel(specSnapshot?: string | Record<string, string> | null): string {
  if (!specSnapshot) return "";
  try {
    const obj =
      typeof specSnapshot === "string" ? JSON.parse(specSnapshot) : specSnapshot;
    return Object.values(obj as Record<string, string>).join("·");
  } catch {
    return "";
  }
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
  if (Object.values(selections).some((v) => Array.isArray(v))) {
    return filterCombosByMultiSelections(combos, selections as MultiSpecSelections);
  }
  return combos.filter((combo) =>
    Object.keys(selections).every((dimName) => {
      const sel = (selections as Record<string, string>)[dimName];
      if (sel == null || sel === "") return true;
      return combo.dims[dimName] === sel;
    }),
  );
}

export type MultiSpecSelections = Record<string, string[]>;

export function filterCombosByMultiSelections(
  combos: SpecCombo[],
  selections?: MultiSpecSelections | null,
): SpecCombo[] {
  if (!selections || !Object.keys(selections).length) return [];
  return combos.filter((combo) =>
    Object.keys(selections).every((dimName) => {
      const opts = selections[dimName];
      if (!opts || !opts.length) return true;
      return opts.includes(combo.dims[dimName]);
    }),
  );
}

export function isMultiSpecSelectionReady(
  dimensions: SpecDimension[],
  selections?: MultiSpecSelections | null,
): boolean {
  if (!dimensions.length) return false;
  if (!selections) return false;
  return dimensions.every((d) => (selections[d.name] || []).length > 0);
}

/** @deprecated 使用 isMultiSpecSelectionReady */
export function isSpecSelectionComplete(
  dimensions: SpecDimension[],
  selections?: Record<string, string> | MultiSpecSelections | null,
): boolean {
  if (!selections) return false;
  if (Object.values(selections).some((v) => Array.isArray(v))) {
    return isMultiSpecSelectionReady(dimensions, selections as MultiSpecSelections);
  }
  if (!dimensions.length) return false;
  return dimensions.every((d) => {
    const v = (selections as Record<string, string>)[d.name];
    return v != null && v !== "";
  });
}
