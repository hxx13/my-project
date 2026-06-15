import type { GridCell } from '../types';

const CELL_PADDING = 16;

/** 获取格子的显示文本（静态文本或字段标签） */
export function getCellDisplayText(
  cell: GridCell,
  fields: Record<string, { label?: string }>,
): string {
  if (cell.kind === 'static') return cell.staticText || '';
  const field = cell.fieldKey ? fields[cell.fieldKey] : null;
  return field?.label || cell.fieldKey || '';
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

function minColWidth(text: string, fontSize: number): number {
  if (!text || text.length <= 3) {
    return Math.max(28, Math.ceil(fontSize * 1.4) + CELL_PADDING);
  }
  return 40;
}

/**
 * 根据格子内容计算列宽（像素）。
 * 合并格按 colSpan 分摊所需宽度，保证跨列区域总宽 ≥ 文本宽。
 */
export function calcColumnWidths(
  cells: GridCell[],
  fields: Record<string, { label?: string }>,
  maxCol: number,
): Map<number, number> {
  const widths = new Map<number, number>();

  for (let c = 0; c < maxCol; c++) {
    widths.set(c, 40);
  }

  for (const cell of cells) {
    const text = getCellDisplayText(cell, fields);
    if (!text) continue;

    const fontSize = cell.style.fontSize ?? 13;
    const required = Math.ceil(measureTextWidth(text, fontSize, cell.style.bold) + CELL_PADDING);
    const span = cell.colSpan;
    const start = cell.col;
    const end = cell.col + span;

    if (span === 1) {
      const floor = minColWidth(text, fontSize);
      widths.set(start, Math.max(widths.get(start)!, required, floor));
      continue;
    }

    let spanSum = 0;
    for (let c = start; c < end; c++) {
      spanSum += widths.get(c)!;
    }

    if (spanSum >= required) continue;

    const deficit = required - spanSum;
    const addPerCol = deficit / span;
    for (let c = start; c < end; c++) {
      const floor = minColWidth(text, fontSize);
      widths.set(c, Math.max(Math.ceil(widths.get(c)! + addPerCol), floor));
    }
  }

  return widths;
}

/** 合并「已保存列宽」与「内容测算列宽」，取较大值以适配新增长文本 */
export function mergeColumnWidths(
  computed: Map<number, number>,
  stored?: Record<number, number>,
): Map<number, number> {
  if (!stored || Object.keys(stored).length === 0) return computed;

  const merged = new Map(computed);
  for (const [key, value] of Object.entries(stored)) {
    const col = Number(key);
    if (Number.isNaN(col)) continue;
    merged.set(col, Math.max(merged.get(col) ?? 40, value));
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
