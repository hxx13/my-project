import type { GridCell, FieldDefinition, FieldType } from '../types';
import {
  collectCellFillMeasureTexts,
  estimateDisplayLinesAtWidth,
  sumSpanColumnWidths,
  type FillMeasureContext,
} from './gridColumnWidths';

const CELL_PADDING_Y = 16;

/** 填报页控件基准高度（px，含 td padding 前） */
const FILL_CONTROL_HEIGHT: Record<FieldType, number> = {
  STATIC: 28,
  TEXT: 36,
  NUMBER: 36,
  BOOLEAN: 36,
  SELECT: 36,
  MULTI_SELECT: 40,
  DATETIME: 36,
  IMAGE: 88,
  FILE: 44,
  USER: 40,
  AUTO_USER: 32,
};

function staticTextLines(text: string): number {
  if (!text) return 1;
  return text.split('\n').length;
}

function staticRowNeed(text: string, fontSize: number): number {
  const lines = staticTextLines(text);
  const lineH = Math.ceil(fontSize * 1.35);
  return lines * lineH + CELL_PADDING_Y;
}

/** 单格内容所需行高（px） */
export function cellRequiredRowHeight(
  cell: GridCell,
  fields: Record<string, FieldDefinition>,
  fillCtx?: FillMeasureContext & { colWidths?: Map<number, number> },
): number {
  const fontSize = cell.style.fontSize ?? 13;

  if (cell.kind === 'static') {
    let need = Math.max(32, staticRowNeed(cell.staticText || '', fontSize));
    if (cell.style.imageSrc) {
      need = Math.max(need, 88);
    }
    if (fillCtx?.colWidths) {
      const colW = sumSpanColumnWidths(cell.col, cell.colSpan, fillCtx.colWidths);
      const lines = estimateDisplayLinesAtWidth(cell.staticText || '', colW, fontSize, cell.style.bold);
      const lineH = Math.ceil(fontSize * 1.35);
      need = Math.max(need, lines * lineH + CELL_PADDING_Y);
    }
    return need;
  }
  if (!cell.fieldKey) return 32;
  const field = fields[cell.fieldKey];
  if (!field) return 32;
  if (field.type === 'STATIC') {
    const text = field.label || cell.staticText || '';
    return Math.max(32, staticRowNeed(text, fontSize));
  }

  const controlMin = FILL_CONTROL_HEIGHT[field.type] ?? 36;
  const labelText = field.label || cell.staticText || '';
  const labelNeed = labelText ? staticRowNeed(labelText, fontSize) : 0;

  let wrapNeed = 0;
  if (fillCtx?.colWidths) {
    const colW = sumSpanColumnWidths(cell.col, cell.colSpan, fillCtx.colWidths);
    const texts = collectCellFillMeasureTexts(cell, fields, fillCtx);
    let maxLines = 1;
    for (const t of texts) {
      maxLines = Math.max(maxLines, estimateDisplayLinesAtWidth(t, colW, fontSize, cell.style.bold));
    }
    const lineH = Math.ceil(fontSize * 1.35);
    wrapNeed = maxLines * lineH + CELL_PADDING_Y;
  }

  if (field.type === 'TEXT' || field.type === 'NUMBER' || field.type === 'DATETIME') {
    return Math.max(32, controlMin, labelNeed, wrapNeed);
  }
  if (field.type === 'SELECT' || field.type === 'MULTI_SELECT') {
    return Math.max(32, controlMin, labelNeed, wrapNeed);
  }
  return Math.max(32, controlMin, wrapNeed);
}

/**
 * 按格子内容计算行高（像素）。
 * 合并格按 rowSpan 分摊，保证跨行区域总高 ≥ 控件所需高度。
 */
export function calcRowHeights(
  cells: GridCell[],
  fields: Record<string, FieldDefinition>,
  maxRow: number,
  fillCtx?: FillMeasureContext & { colWidths?: Map<number, number> },
): Map<number, number> {
  const heights = new Map<number, number>();
  for (let r = 0; r < maxRow; r++) {
    heights.set(r, 32);
  }

  for (const cell of cells) {
    const required = cellRequiredRowHeight(cell, fields, fillCtx);
    const span = cell.rowSpan;
    const start = cell.row;
    const end = cell.row + span;

    if (span === 1) {
      heights.set(start, Math.max(heights.get(start)!, required));
      continue;
    }

    let spanSum = 0;
    for (let r = start; r < end; r++) {
      spanSum += heights.get(r)!;
    }
    if (spanSum >= required) continue;

    const deficit = required - spanSum;
    const addPerRow = deficit / span;
    for (let r = start; r < end; r++) {
      heights.set(r, Math.max(Math.ceil(heights.get(r)! + addPerRow), 32));
    }
  }

  return heights;
}

export function mergeRowHeights(
  computed: Map<number, number>,
  stored?: Record<number, number>,
): Map<number, number> {
  if (!stored || Object.keys(stored).length === 0) return computed;
  const merged = new Map(computed);
  for (const [key, value] of Object.entries(stored)) {
    const row = Number(key);
    if (Number.isNaN(row)) continue;
    merged.set(row, Math.max(merged.get(row) ?? 32, value));
  }
  return merged;
}

export function rowHeightsToRecord(heights: Map<number, number>): Record<number, number> {
  const record: Record<number, number> = {};
  for (const [row, height] of heights) {
    record[row] = height;
  }
  return record;
}
