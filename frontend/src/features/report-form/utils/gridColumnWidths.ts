import type { FieldDefinition, FieldType, GridCell, ThemeJson } from '../types';
import { parseFileFieldValue } from './fileFieldValue';

const CELL_PADDING = 16;

/** 空列默认宽 */
export const DEFAULT_COL_WIDTH = 48;
/** 单列至少容纳约 4 个汉字，避免一字一行 */
export const MIN_READABLE_COL_WIDTH = 72;
/** 自适应单列上限；超出后在列宽封顶处换行（设计页等） */
export const MAX_AUTO_COL_WIDTH = 280;
/** 填报页：列宽相对初始宽度的最大放大倍数，超出后换行 */
export const FILL_COL_EXPAND_FACTOR = 5;
/** 填报页换行后最多展示行数 */
export const FILL_TEXT_MAX_WRAP_LINES = 3;

/** 超过该字数允许最多 2 行（列宽已封顶时） */
export const LONG_TEXT_WRAP_CHARS = 24;

/** 填报页：读取主题/导入时的列初始宽 */
export function getBaseColumnWidth(col: number, theme?: ThemeJson): number {
  const stored = theme?.columnWidths?.[col] ?? (theme?.columnWidths as Record<string, number> | undefined)?.[String(col)];
  if (typeof stored === 'number' && !Number.isNaN(stored) && stored > 0) {
    return Math.max(MIN_READABLE_COL_WIDTH, stored);
  }
  return MIN_READABLE_COL_WIDTH;
}

export function buildBaseColumnWidths(maxCol: number, theme?: ThemeJson): Map<number, number> {
  const map = new Map<number, number>();
  for (let c = 0; c < maxCol; c++) {
    map.set(c, getBaseColumnWidth(c, theme));
  }
  return map;
}

/** Word：列数取格子与 theme.columnWidths 的并集，避免正文区格子较少时表格被压窄 */
export function getWordLayoutMaxCol(cells: GridCell[], theme?: ThemeJson): number {
  let fromCells = 1;
  if (cells.length > 0) {
    fromCells = Math.max(...cells.map(c => c.col + c.colSpan), 1);
  }
  const cw = theme?.columnWidths;
  if (!cw) return fromCells;
  let fromTheme = 0;
  for (const key of Object.keys(cw)) {
    const col = Number(key);
    if (!Number.isNaN(col) && col >= 0) {
      fromTheme = Math.max(fromTheme, col + 1);
    }
  }
  return Math.max(fromCells, fromTheme, 1);
}

export function hasWordThemeColumnWidths(theme?: ThemeJson): boolean {
  return !!(theme?.columnWidths && Object.keys(theme.columnWidths).length > 0);
}

/** Word 网页展示：以导入 theme 列宽为底，内容仅在更宽时扩展 */
export function mergeWordWebColumnWidths(
  contentCols: Map<number, number>,
  theme: ThemeJson,
  maxCol: number,
): Map<number, number> {
  const merged = mergeColumnWidths(contentCols, theme.columnWidths);
  for (let c = 0; c < maxCol; c++) {
    merged.set(c, Math.max(merged.get(c) ?? 0, getBaseColumnWidth(c, theme)));
  }
  return merged;
}

/** Word 导入页宽：列宽总和明显小于 pageContentWidthPx 时按比例放大（修复填报页压瘪） */
export function scaleWordColumnsToPageWidth(
  widths: Map<number, number>,
  theme: ThemeJson,
): Map<number, number> {
  const target = theme.pageContentWidthPx;
  if (!target || target <= 0) return widths;
  const sum = sumColumnWidths(widths);
  if (sum <= 0 || sum >= target * 0.92) return widths;
  const factor = target / sum;
  const next = new Map<number, number>();
  for (const [col, w] of widths) {
    next.set(col, Math.max(MIN_READABLE_COL_WIDTH, Math.round(w * factor)));
  }
  let newSum = sumColumnWidths(next);
  if (newSum !== target && next.size > 0) {
    const lastCol = Math.max(...next.keys());
    next.set(lastCol, Math.max(MIN_READABLE_COL_WIDTH, (next.get(lastCol) ?? 0) + (target - newSum)));
  }
  return next;
}

/** 合并格横向总宽（px） */
export function sumSpanColumnWidths(
  startCol: number,
  colSpan: number,
  widths: Map<number, number>,
): number {
  let sum = 0;
  for (let c = startCol; c < startCol + colSpan; c++) {
    sum += widths.get(c) ?? MIN_READABLE_COL_WIDTH;
  }
  return sum;
}

/** 填报页：列宽封顶（初始宽 × 5） */
export function fillColumnWidthCap(baseColWidth: number): number {
  return Math.max(MIN_READABLE_COL_WIDTH, Math.round(baseColWidth * FILL_COL_EXPAND_FACTOR));
}

/** 单元格内容区可用宽（扣除左右 padding） */
export function cellContentWidth(colWidthPx: number): number {
  return Math.max(8, colWidthPx - CELL_PADDING);
}

/** 在指定列宽下估算实际展示行数（含手动换行，不封顶） */
export function estimateDisplayLinesAtWidthFull(
  text: string,
  colWidthPx: number,
  fontSize = 13,
  bold?: boolean,
): number {
  if (!text?.trim()) return 1;
  const contentW = cellContentWidth(colWidthPx);
  let total = 0;
  for (const segment of text.split('\n')) {
    const lineW = measureLongestLineWidth(segment, fontSize, bold);
    if (lineW <= contentW) total += 1;
    else total += Math.ceil(lineW / contentW);
  }
  return Math.max(1, total);
}

/** 在指定列宽下估算展示行数（用于行高，最多 FILL_TEXT_MAX_WRAP_LINES） */
export function estimateDisplayLinesAtWidth(
  text: string,
  colWidthPx: number,
  fontSize = 13,
  bold?: boolean,
): number {
  return Math.min(
    FILL_TEXT_MAX_WRAP_LINES,
    estimateDisplayLinesAtWidthFull(text, colWidthPx, fontSize, bold),
  );
}

/** 填报页封顶列宽（当前列宽与初始×5 的较小值） */
export function fillCapColumnWidth(colWidthPx: number, baseColWidthPx: number): number {
  return Math.min(colWidthPx, fillColumnWidthCap(baseColWidthPx));
}

/** 填报页控件附加宽度（图标、下拉箭头等） */
const CONTROL_EXTRA: Partial<Record<FieldType, number>> = {
  SELECT: 24,
  MULTI_SELECT: 28,
  BOOLEAN: 8,
  DATETIME: 8,
  USER: 16,
  IMAGE: 8,
  FILE: 8,
};

/** 固定最小控件占位（与文本无关）— 填报页尽量贴内容，避免列过宽留白 */
const CONTROL_MIN_WIDTH: Partial<Record<FieldType, number>> = {
  BOOLEAN: 40,
  DATETIME: 112,
  USER: 96,
  IMAGE: 88,
  FILE: 100,
};

/** 获取格子的显示文本（静态文本或字段标签）— 兼容旧调用 */
export function getCellDisplayText(
  cell: GridCell,
  fields: Record<string, { label?: string; type?: string }>,
): string {
  const texts = collectCellMeasureTexts(cell, fields as Record<string, FieldDefinition>);
  return texts[0] ?? '';
}

/** 收集单元格内所有可能影响渲染宽度的文案（标签、占位、选项等） */
export function collectCellMeasureTexts(
  cell: GridCell,
  fields: Record<string, FieldDefinition>,
): string[] {
  const out: string[] = [];
  const push = (t?: string | null) => {
    const s = t?.trim();
    if (s) out.push(s);
  };

  if (cell.kind === 'static') {
    push(cell.staticText);
    if (cell.style.imageSrc) {
      out.push('🖼');
    }
    return out;
  }

  const field = cell.fieldKey ? fields[cell.fieldKey] : undefined;
  if (!field) {
    push(cell.fieldKey);
    return out;
  }

  push(field.label);
  push(cell.staticText);

  switch (field.type) {
    case 'STATIC':
      break;
    case 'SELECT':
      push('— 请选择 —');
      push('（暂无选项）');
      field.options?.forEach(o => push(o.label));
      break;
    case 'MULTI_SELECT':
      push('— 多选 —');
      push('（暂无选项）');
      field.options?.forEach(o => push(o.label));
      break;
    case 'TEXT':
      push(field.maxLength ? `文本 · 最长${field.maxLength}字` : '文本');
      break;
    case 'NUMBER': {
      const parts = ['数字'];
      if (field.min != null && field.max != null) parts.push(`${field.min}~${field.max}`);
      else if (field.min != null) parts.push(`≥${field.min}`);
      else if (field.max != null) parts.push(`≤${field.max}`);
      push(parts.join(' · '));
      break;
    }
    case 'FILE':
      push('📎 填报页可上传文件');
      break;
    case 'AUTO_USER':
      push('（保存时自动记录）');
      break;
    case 'IMAGE':
      push('粘贴图片链接预览');
      break;
    case 'USER':
      push('请选择人员');
      break;
    default:
      break;
  }

  return out;
}

/** 填报页：合并字段定义与当前已填值，用于列宽测算 */
export type FillMeasureContext = {
  values: Record<string, unknown>;
  getFieldOptions?: (field: FieldDefinition) => { label: string; value: string }[];
};

function toFillArrayValue(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string' && v.startsWith('[')) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return v != null && v !== '' && v !== 'null' ? [String(v)] : [];
}

export function collectCellFillMeasureTexts(
  cell: GridCell,
  fields: Record<string, FieldDefinition>,
  ctx?: FillMeasureContext,
): string[] {
  const texts = collectCellMeasureTexts(cell, fields);
  if (!ctx || !cell.fieldKey) return texts;

  const field = fields[cell.fieldKey];
  if (!field) return texts;

  const push = (t?: string | null) => {
    const s = t?.trim();
    if (s) texts.push(s);
  };

  const value = ctx.values[cell.fieldKey];
  const opts = ctx.getFieldOptions?.(field) ?? field.options ?? [];

  switch (field.type) {
    case 'TEXT':
    case 'NUMBER':
    case 'DATETIME':
    case 'AUTO_USER':
      if (value != null && value !== '' && value !== 'null') push(String(value));
      break;
    case 'SELECT': {
      const val = String(value ?? '');
      if (val) push(opts.find(o => o.value === val)?.label ?? val);
      break;
    }
    case 'MULTI_SELECT': {
      const arr = toFillArrayValue(value);
      if (arr.length > 0) {
        push(arr.join('、'));
        arr.forEach(v => push(opts.find(o => o.value === v)?.label ?? v));
      }
      break;
    }
    case 'USER':
      if (value != null && value !== '' && value !== 'null') {
        push(String(value).replace(/,/g, '、'));
      }
      break;
    case 'BOOLEAN':
      if (value != null && value !== '' && value !== 'false' && value !== '0') push('✓ 是');
      break;
    case 'FILE': {
      const parsed = parseFileFieldValue(value);
      if (parsed?.name) push(parsed.name);
      break;
    }
    case 'IMAGE':
      if (value != null && value !== '' && value !== 'null') push('图片预览');
      break;
    default:
      break;
  }

  return texts;
}

/** 按字号估算文本渲染宽度（px） */
export function measureTextWidth(text: string, fontSize: number, bold?: boolean): number {
  let width = 0;
  for (const ch of text) {
    width += /[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/.test(ch)
      ? fontSize
      : fontSize * 0.55;
  }
  if (bold) width *= 1.05;
  return width;
}

/** 取最长一行（含手动换行）的宽度 */
export function measureLongestLineWidth(text: string, fontSize: number, bold?: boolean): number {
  if (!text) return 0;
  let max = 0;
  for (const line of text.split('\n')) {
    max = Math.max(max, measureTextWidth(line, fontSize, bold));
  }
  return max;
}

/** 控件图标 / 按钮占用的额外宽度 */
export function fieldControlExtraWidth(type?: FieldType): number {
  if (!type) return 0;
  return CONTROL_EXTRA[type] ?? 0;
}

/**
 * 单个格子所需列宽（px）：最长一行文本 + 内边距 + 控件附加宽；
 * 同列多格取 max，合并格按 colSpan 分摊且保证 span 合计 ≥ 本格需求。
 */
export function measureCellWidthNeed(
  cell: GridCell,
  fields: Record<string, FieldDefinition>,
  fillCtx?: FillMeasureContext,
  options?: { forDesignLayout?: boolean },
): number {
  const fontSize = cell.style.fontSize ?? 13;
  const bold = cell.style.bold;
  const field = cell.fieldKey ? fields[cell.fieldKey] : undefined;
  const texts = fillCtx
    ? collectCellFillMeasureTexts(cell, fields, fillCtx)
    : collectCellMeasureTexts(cell, fields);

  let maxLineW = 0;
  for (const t of texts) {
    maxLineW = Math.max(maxLineW, measureLongestLineWidth(t, fontSize, bold));
  }

  const forDesign = options?.forDesignLayout ?? false;
  const controlExtra = forDesign ? 0 : (field ? fieldControlExtraWidth(field.type) : 0);
  const controlMin = forDesign ? 0 : (field?.type ? (CONTROL_MIN_WIDTH[field.type] ?? 0) : 0);
  const maxCap = fillCtx ? undefined : MAX_AUTO_COL_WIDTH;

  if (maxLineW <= 0 && controlMin <= 0 && !field) {
    return MIN_READABLE_COL_WIDTH;
  }

  const textNeed = maxLineW > 0
    ? Math.ceil(maxLineW + CELL_PADDING + controlExtra)
    : MIN_READABLE_COL_WIDTH + controlExtra;

  const raw = Math.max(textNeed, controlMin, MIN_READABLE_COL_WIDTH);
  return maxCap != null ? Math.min(raw, maxCap) : raw;
}

/** 在 MAX 列宽下估算需几行（用于 CSS 换行档位） */
export function estimateWrapLinesAtMaxWidth(text: string, fontSize = 13, bold?: boolean): number {
  const lineW = measureLongestLineWidth(text, fontSize, bold);
  const maxContentW = MAX_AUTO_COL_WIDTH - CELL_PADDING;
  if (lineW <= maxContentW) return 1;
  return Math.min(6, Math.ceil(lineW / maxContentW));
}

function readStoredWidth(stored: Record<number, number> | undefined, col: number): number | undefined {
  if (!stored) return undefined;
  const direct = stored[col];
  if (typeof direct === 'number' && !Number.isNaN(direct)) return direct;
  const asStringKey = (stored as Record<string, number>)[String(col)];
  return typeof asStringKey === 'number' && !Number.isNaN(asStringKey) ? asStringKey : undefined;
}

/** 保证合并格 span 内列宽之和 ≥ totalNeed */
function ensureSpanWidth(
  widths: Map<number, number>,
  startCol: number,
  span: number,
  totalNeed: number,
) {
  const end = startCol + span;
  let spanSum = 0;
  for (let c = startCol; c < end; c++) {
    spanSum += widths.get(c) ?? MIN_READABLE_COL_WIDTH;
  }
  if (spanSum >= totalNeed) return;

  const deficit = totalNeed - spanSum;
  const addPerCol = Math.ceil(deficit / span);
  for (let c = startCol; c < end; c++) {
    widths.set(c, (widths.get(c) ?? MIN_READABLE_COL_WIDTH) + addPerCol);
  }

  spanSum = 0;
  for (let c = startCol; c < end; c++) spanSum += widths.get(c)!;
  if (spanSum < totalNeed) {
    widths.set(startCol, widths.get(startCol)! + (totalNeed - spanSum));
  }
}

/**
 * 根据格子内容计算列宽（像素）。
 * 每列 = 该列所有单元格需求的最大值（含字段标签、选项、控件图标）。
 */
export function calcColumnWidths(
  cells: GridCell[],
  fields: Record<string, FieldDefinition>,
  maxCol: number,
  fillCtx?: FillMeasureContext,
  baseColWidths?: Map<number, number>,
  forDesignLayout?: boolean,
): Map<number, number> {
  const widths = new Map<number, number>();
  for (let c = 0; c < maxCol; c++) {
    widths.set(c, MIN_READABLE_COL_WIDTH);
  }

  for (const cell of cells) {
    const need = measureCellWidthNeed(cell, fields, fillCtx, { forDesignLayout });
    const span = Math.max(1, cell.colSpan);
    const start = cell.col;
    const perCol = Math.ceil(need / span);

    for (let c = start; c < start + span; c++) {
      widths.set(c, Math.max(widths.get(c) ?? MIN_READABLE_COL_WIDTH, perCol));
    }
    ensureSpanWidth(widths, start, span, need);
  }

  if (baseColWidths) {
    applyColumnWidthCap(widths, baseColWidths, maxCol);
  }

  return widths;
}

/** 单列宽度不超过初始宽 × FILL_COL_EXPAND_FACTOR */
export function applyColumnWidthCap(
  widths: Map<number, number>,
  baseColWidths: Map<number, number>,
  maxCol: number,
): void {
  for (let c = 0; c < maxCol; c++) {
    const base = baseColWidths.get(c) ?? MIN_READABLE_COL_WIDTH;
    const cap = fillColumnWidthCap(base);
    widths.set(c, Math.min(widths.get(c) ?? MIN_READABLE_COL_WIDTH, cap));
  }
}

/**
 * 合并「内容测算列宽」与「已保存列宽」。
 * 内容宽度始终作为下限：Excel 导入的 2 字窄列会在内容变 10 字后自动加宽；
 * 已保存值仅在比内容更宽时保留（例如用户手动拉宽）。
 */
export function mergeColumnWidths(
  computed: Map<number, number>,
  stored?: Record<number, number>,
): Map<number, number> {
  const merged = new Map<number, number>();
  const cols = new Set<number>(computed.keys());
  if (stored) {
    for (const key of Object.keys(stored)) {
      const col = Number(key);
      if (!Number.isNaN(col)) cols.add(col);
    }
  }

  for (const col of cols) {
    const contentNeed = computed.get(col) ?? MIN_READABLE_COL_WIDTH;
    const saved = readStoredWidth(stored, col);
    merged.set(col, Math.max(contentNeed, saved ?? 0, MIN_READABLE_COL_WIDTH));
  }
  return merged;
}

export function columnWidthsToRecord(widths: Map<number, number>): Record<number, number> {
  const record: Record<number, number> = {};
  for (const [col, width] of widths) {
    record[col] = width;
  }
  return record;
}

export function sumColumnWidths(widths: Map<number, number>): number {
  return [...widths.values()].reduce((sum, w) => sum + w, 0);
}

/** Word 导入表格：列宽总和不足视口时按比例放大（设计/填报页展示用） */
export function fitWordTableThemeToViewport(theme: ThemeJson): ThemeJson {
  const cw = theme.columnWidths || {};
  const keys = Object.keys(cw);
  if (keys.length === 0) return theme;
  const sum = keys.reduce((acc, k) => acc + (cw[Number(k)] ?? 0), 0);
  if (sum <= 0 || typeof window === 'undefined') return theme;
  const target = Math.min(Math.max(720, window.innerWidth - 160), 1400);
  if (sum >= target) return theme;
  const factor = target / sum;
  const next: Record<number, number> = {};
  for (const k of keys) {
    const col = Number(k);
    next[col] = Math.max(MIN_READABLE_COL_WIDTH, Math.round((cw[col] ?? MIN_READABLE_COL_WIDTH) * factor));
  }
  return { ...theme, columnWidths: next };
}
