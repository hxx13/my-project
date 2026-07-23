import {
  estimateWrapLinesAtMaxWidth,
  estimateDisplayLinesAtWidth,
  estimateDisplayLinesAtWidthFull,
  fillCapColumnWidth,
  LONG_TEXT_WRAP_CHARS,
  FILL_TEXT_MAX_WRAP_LINES,
} from './gridColumnWidths';

import type { CellAlign } from '../types';

export type FillTextDisplayMode = 'fit' | 'wrap' | 'scroll';

/**
 * 填报页文本展示档位：
 * - fit：单行完整（列宽够或随内容加宽）
 * - wrap：2~3 行自然换行，无滚动条
 * - scroll：超过 3 行，限高 3 行并框内滚动
 */
export function resolveFillTextDisplayMode(
  text: string | undefined | null,
  colWidthPx: number,
  baseColWidthPx: number,
  fontSize = 13,
  bold?: boolean,
): FillTextDisplayMode {
  if (!text?.trim()) return 'fit';
  const capColW = fillCapColumnWidth(colWidthPx, baseColWidthPx);
  const lines = estimateDisplayLinesAtWidthFull(text, capColW, fontSize, bold);
  if (lines <= 1) return 'fit';
  if (lines <= FILL_TEXT_MAX_WRAP_LINES) return 'wrap';
  return 'scroll';
}

/**
 * 格子文本排版（与列宽自适应配合）：
 * - 填报页：列宽随内容增长至初始宽 ×5；能单行放下则完整显示
 * - 超出封顶宽后换行，最多 3 行，再省略
 * - 设计页静态格：沿用原有多档策略
 */

/** 单行完整展示（列宽足够时不截断） */
export const GRID_CELL_TEXT_FIT_CLASS =
  'block w-full min-w-0 whitespace-nowrap [word-break:keep-all]';

/** 填报页：超过 3 行时限高并框内滚动 */
export const GRID_CELL_TEXT_SCROLL_CLASS = 'fill-cell-text-scroll';

/** 填报页：2~3 行自然换行（无滚动条） */
export const GRID_CELL_TEXT_WRAP_CLASS =
  'block w-full min-w-0 whitespace-normal [overflow-wrap:break-word] [word-break:break-word]';

/** 默认：单行完整优先，超出列宽省略（设计页等） */
export const GRID_CELL_TEXT_SINGLE_CLASS =
  'block w-full min-w-0 truncate whitespace-nowrap overflow-hidden text-ellipsis [word-break:keep-all]';

/** 较长文本：在列宽封顶处换行，最多 2 行 */
export const GRID_CELL_TEXT_LONG_CLASS =
  'block w-full min-w-0 overflow-hidden line-clamp-2 whitespace-normal [overflow-wrap:break-word] [word-break:keep-all]';

/** 超宽文本：在 MAX 列宽处换行，最多 4 行 */
export const GRID_CELL_TEXT_WIDE_CLASS =
  'block w-full min-w-0 overflow-hidden line-clamp-4 whitespace-normal [overflow-wrap:break-word] [word-break:keep-all]';

/** 含手动换行符：最多 3 行 */
export const GRID_CELL_TEXT_PRELINE_CLASS =
  'block w-full min-w-0 overflow-hidden line-clamp-3 whitespace-pre-wrap [overflow-wrap:break-word] [word-break:keep-all]';

/** 下拉/多选已选值：默认单行完整（由 cellValueDisplayClass 覆盖为换行档） */
export const GRID_CELL_SELECT_VALUE_CLASS = GRID_CELL_TEXT_FIT_CLASS;

/** 填报输入框：宽度随列，文本随格子对齐 */
export const GRID_CELL_INPUT_CLASS =
  'w-full min-w-0 max-w-full rounded-[6px] border border-[var(--app-color-border-default)] ' +
  'bg-[var(--app-color-surface-page)] px-2 py-1.5 text-xs text-[var(--app-color-text-primary)] ' +
  'outline-none focus:border-[var(--app-color-accent)]';

/** 填报多行文本框 */
export const GRID_CELL_TEXTAREA_CLASS =
  GRID_CELL_INPUT_CLASS + ' resize-none leading-[1.35]';

export function fillTextLineHeightPx(fontSize = 12): number {
  return Math.ceil(fontSize * 1.35);
}

/** 只读/展示区 3 行限高（px，不含 padding） */
export function fillTextScrollMaxHeightPx(fontSize = 12): number {
  return fillTextLineHeightPx(fontSize) * FILL_TEXT_MAX_WRAP_LINES;
}

/** @deprecated 使用 fillTextScrollMaxHeightPx */
export function fillTextareaMaxHeightPx(fontSize = 12): number {
  return fillTextScrollMaxHeightPx(fontSize) + 12;
}

export function cellTextClass(
  text: string | undefined | null,
  fontSize = 13,
  bold?: boolean,
): string {
  if (!text) return GRID_CELL_TEXT_SINGLE_CLASS;
  if (text.includes('\n')) return GRID_CELL_TEXT_PRELINE_CLASS;

  const wrapLines = estimateWrapLinesAtMaxWidth(text, fontSize, bold);
  if (wrapLines <= 1) return GRID_CELL_TEXT_SINGLE_CLASS;
  if (wrapLines <= 2 || text.length <= LONG_TEXT_WRAP_CHARS * 2) {
    return GRID_CELL_TEXT_LONG_CLASS;
  }
  return GRID_CELL_TEXT_WIDE_CLASS;
}

/**
 * @deprecated 使用 resolveFillTextDisplayMode
 */
export function cellValueDisplayClass(
  text: string | undefined | null,
  colWidthPx: number,
  baseColWidthPx: number,
  fontSize = 13,
  bold?: boolean,
): string {
  const mode = resolveFillTextDisplayMode(text, colWidthPx, baseColWidthPx, fontSize, bold);
  if (mode === 'fit') return GRID_CELL_TEXT_FIT_CLASS;
  if (mode === 'wrap') return GRID_CELL_TEXT_WRAP_CLASS;
  return GRID_CELL_TEXT_SCROLL_CLASS;
}

/** 填报页文本域行数（1~3，超出 3 行时固定为 3 并滚动） */
export function fillTextareaRows(
  text: string,
  colWidthPx: number,
  baseColWidthPx: number,
  fontSize = 12,
  bold?: boolean,
): number {
  const mode = resolveFillTextDisplayMode(text, colWidthPx, baseColWidthPx, fontSize, bold);
  if (mode === 'fit') return 1;
  if (mode === 'scroll') return FILL_TEXT_MAX_WRAP_LINES;
  return estimateDisplayLinesAtWidthFull(
    text,
    fillCapColumnWidth(colWidthPx, baseColWidthPx),
    fontSize,
    bold,
  );
}

/** 悬停展示全文（省略或多行截断时） */
export function cellTextTitle(
  text: string | undefined | null,
  displayClass?: string,
): string | undefined {
  if (!text?.trim()) return undefined;
  if (displayClass === GRID_CELL_TEXT_SCROLL_CLASS || displayClass === GRID_CELL_TEXT_PRELINE_CLASS) {
    return text;
  }
  return text;
}

/** 格子 td：最小高度由主题/测算决定，内容可撑开；下拉等浮层不被裁切 */
export const GRID_CELL_TD_CLASS =
  'overflow-visible align-middle';

/** 单元格内容区：限制在列宽内，防止控件撑开表格 */
export const GRID_CELL_CONTENT_CLASS = 'w-full min-w-0 max-w-full';

export function resolveCellAlign(cellAlign?: CellAlign, themeDefaultAlign?: CellAlign): CellAlign {
  return cellAlign ?? themeDefaultAlign ?? 'center';
}

export function gridCellContentAlignClass(align?: CellAlign): string {
  if (align === 'right') return 'text-right';
  if (align === 'left') return 'text-left';
  return 'text-center';
}

export function gridCellFlexJustifyClass(align?: CellAlign): string {
  if (align === 'right') return 'justify-end';
  if (align === 'left') return 'justify-start';
  return 'justify-center';
}

export function cellTextAlignStyle(align?: CellAlign): 'left' | 'center' | 'right' {
  if (align === 'right') return 'right';
  if (align === 'left') return 'left';
  return 'center';
}

export function gridCellMinHeight(rowH: number, rowSpan = 1): number {
  return rowH * rowSpan;
}

/** Word 网页展示：固定行高，避免 table 行塌缩 */
export function gridCellFixedHeight(rowH: number, rowSpan = 1): number {
  return Math.max(32, rowH * rowSpan);
}
