export type QrAnchor =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export interface CardSpec {
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  defaultFontSizePt: number;
  defaultFontWeight: number | null;
  lineHeightMm: number | null;
  offsetXMm: number;
  offsetYMm: number;
  borderWidthMm: number;
  borderColor: string;
  qr: {
    enabled: boolean;
    fieldKey: string;
    sizeMm: number;
    marginMm: number;
    anchor: QrAnchor;
  };
  landscape: boolean | null;
  rotate90: boolean | null;
  table: {
    widthMm: number | null;
    heightMm: number | null;
    anchor: QrAnchor | null;
    colCount: number | null;
    colWidthsMm: number[] | null;
  } | null;
}

export interface CardCell {
  label: string | null;
  fieldKey: string | null;
  colSpan: number | null;
}

export interface CardSlot {
  /** 新模型：一行 N 列 */
  cells: CardCell[] | null;
  /** 旧模型遗留字段，仅为兼容老模板 JSON */
  label: string | null;
  fieldKey: string | null;
  rightLabel: string | null;
  rightFieldKey: string | null;
  align: "left" | "center" | "right";
  bold: boolean | null;
  fontSizePt: number | null;
  fontWeight: number | null;
  heightMm: number | null;
  vAlign: string | null;
}

/** 有效列：优先 cells；为空则由旧字段合成（left、right 两列）。复刻后端 effectiveCells。 */
export function effectiveCells(slot: CardSlot): CardCell[] {
  if (slot.cells != null && slot.cells.length > 0) return slot.cells;
  const out: CardCell[] = [];
  if (slot.label != null || slot.fieldKey != null) {
    out.push({ label: slot.label, fieldKey: slot.fieldKey, colSpan: null });
  }
  if (slot.rightLabel != null || slot.rightFieldKey != null) {
    out.push({ label: slot.rightLabel, fieldKey: slot.rightFieldKey, colSpan: null });
  }
  return out;
}

export interface CardFieldOption {
  key: string;
  label: string;
  dataType: string;
  dictKey: string | null;
  domainCode: string | null;
  submoduleCode: string | null;
  source: "FORM" | "SPECIAL";
  readonly: boolean;
}

export interface CardTemplate {
  id: number | null;
  name: string;
  specJson: string;
  slotsJson: string;
  isDefault: boolean | null;
  enabled: boolean | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CardArchive {
  id: number;
  templateId: number;
  templateName: string;
  pageCount: number;
  fileName: string;
  fileSize: number;
  createdBy: string | null;
  createdAt: string;
}

export const QR_FIELD = "__qr__";
export const POSITION_FIELD = "__position__";

export const DEFAULT_SPEC: CardSpec = {
  pageWidthMm: 70,
  pageHeightMm: 105,
  marginMm: 2,
  defaultFontSizePt: 9,
  defaultFontWeight: null,
  lineHeightMm: null,
  offsetXMm: 0,
  offsetYMm: 0,
  borderWidthMm: 0.2,
  borderColor: "#000000",
  qr: { enabled: true, fieldKey: QR_FIELD, sizeMm: 33, marginMm: 1, anchor: "top-right" },
  landscape: false,
  rotate90: false,
  table: null,
};
