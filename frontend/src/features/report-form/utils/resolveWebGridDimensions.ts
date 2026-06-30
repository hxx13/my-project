import type { LayoutJson, ThemeJson } from '../types';
import {
  applyColumnWidthCap,
  buildBaseColumnWidths,
  calcColumnWidths,
  columnWidthsToRecord,
  fitWordTableThemeToViewport,
  getWordLayoutMaxCol,
  hasWordThemeColumnWidths,
  mergeColumnWidths,
  mergeWordWebColumnWidths,
  MIN_READABLE_COL_WIDTH,
  scaleWordColumnsToPageWidth,
  sumColumnWidths,
  type FillMeasureContext,
} from './gridColumnWidths';
import {
  calcRowHeights,
  mergeRowHeights,
  rowHeightsToRecord,
} from './gridRowHeights';

export type WebGridDimensions = {
  colWidths: Map<number, number>;
  baseColWidths: Map<number, number>;
  rowHeightMap: Map<number, number>;
  totalWidth: number;
  /** 渲染列数（Word 含 theme 中无格子的列） */
  displayMaxCol: number;
  /** Word 网页展示：使用固定行高，与导出模板无关 */
  strictRowHeight: boolean;
  /** 填报页：允许单元格随换行增高（不设 maxHeight） */
  allowCellGrow: boolean;
  /** Word 网页展示：表格横向铺满容器 */
  fillContainerWidth: boolean;
};

function scaleColumnMapToTotal(
  widths: Map<number, number>,
  targetTotal: number,
): Map<number, number> {
  const sum = sumColumnWidths(widths);
  if (sum <= 0 || targetTotal <= 0 || Math.abs(sum - targetTotal) < 2) {
    return widths;
  }
  const factor = targetTotal / sum;
  const next = new Map<number, number>();
  for (const [col, w] of widths) {
    next.set(col, Math.max(MIN_READABLE_COL_WIDTH, Math.round(w * factor)));
  }
  let newSum = sumColumnWidths(next);
  if (newSum !== targetTotal && next.size > 0) {
    const lastCol = Math.max(...next.keys());
    next.set(lastCol, Math.max(MIN_READABLE_COL_WIDTH, (next.get(lastCol) ?? 0) + (targetTotal - newSum)));
  }
  return next;
}

/**
 * 网页表格展示尺寸（与 Word 导出解耦）。
 * - Word：合并后端 theme 与内容测算，并可按容器宽度缩放列宽；行高取二者较大值。
 * - 其他来源：沿用 theme + 内容测算合并逻辑。
 */
export function resolveWebGridDimensions(
  layout: LayoutJson,
  theme: ThemeJson,
  options?: {
    formSource?: string;
    containerWidth?: number;
    /** 填报页：固定行高并按容器缩放列宽，避免控件撑开表格 */
    constrainLayout?: boolean;
    /** 填报页：按已填内容与选项测算列宽 */
    fillMeasure?: FillMeasureContext;
    /** 设计页：与填报页一致居中展示，不铺满视口、不用控件最小宽撑列 */
    designLayout?: boolean;
  },
): WebGridDimensions {
  const cells = layout.cells;
  const fields = layout.fields || {};
  const isWord = String(options?.formSource || '').toLowerCase() === 'word';
  const maxCol = isWord
    ? getWordLayoutMaxCol(cells, theme)
    : Math.max(...cells.map(c => c.col + c.colSpan), 1);
  const maxRow = Math.max(...cells.map(c => c.row + c.rowSpan), 1);

  const fillMeasure = options?.fillMeasure;
  const isDesign = options?.designLayout ?? false;
  const constrain = options?.constrainLayout ?? isWord;
  const isFill = !!fillMeasure;
  const wordThemeCols = isWord && hasWordThemeColumnWidths(theme);
  const baseColWidths = buildBaseColumnWidths(maxCol, theme);
  const skipContentWidthCap = isWord && (isFill || isDesign);
  const contentCols = calcColumnWidths(
    cells,
    fields,
    maxCol,
    fillMeasure,
    skipContentWidthCap ? undefined : ((constrain || fillMeasure) ? baseColWidths : undefined),
    isDesign || (isWord && isFill),
  );
  const fillRowCtx = fillMeasure
    ? { ...fillMeasure, colWidths: contentCols }
    : undefined;
  const contentRows = calcRowHeights(cells, fields, maxRow, fillRowCtx);

  if (!constrain) {
    const mergedCols = mergeColumnWidths(contentCols, theme.columnWidths);
    const mergedRows = mergeRowHeights(contentRows, theme.rowHeights);
    return {
      colWidths: mergedCols,
      baseColWidths,
      rowHeightMap: mergedRows,
      totalWidth: sumColumnWidths(mergedCols),
      displayMaxCol: maxCol,
      strictRowHeight: false,
      allowCellGrow: false,
      fillContainerWidth: false,
    };
  }

  // Word：导入列宽为底；Excel/填报：内容与 theme 取较大值
  let mergedCols = wordThemeCols && (isFill || isDesign)
    ? mergeWordWebColumnWidths(contentCols, theme, maxCol)
    : isFill
      ? mergeColumnWidths(contentCols, theme.columnWidths)
      : mergeColumnWidths(contentCols, theme.columnWidths);
  if (constrain && !isFill) {
    applyColumnWidthCap(mergedCols, baseColWidths, maxCol);
  }
  if (wordThemeCols && (isFill || isDesign)) {
    mergedCols = scaleWordColumnsToPageWidth(mergedCols, theme);
  }
  let mergedRows = mergeRowHeights(contentRows, theme.rowHeights);

  // 设计页与填报页一致：Word 表格保持导入比例，不拉伸铺满视口
  if (isWord && !isFill && !isDesign) {
    const wordTheme: ThemeJson = fitWordTableThemeToViewport({
      ...theme,
      columnWidths: columnWidthsToRecord(mergedCols),
      rowHeights: rowHeightsToRecord(mergedRows),
    });
    mergedCols = mergeColumnWidths(contentCols, wordTheme.columnWidths);
    mergedRows = mergeRowHeights(contentRows, wordTheme.rowHeights);
    applyColumnWidthCap(mergedCols, baseColWidths, maxCol);
  }

  let colWidths = mergedCols;
  const containerW = options?.containerWidth;
  if (containerW && containerW > 0 && !isFill && !isDesign) {
    colWidths = scaleColumnMapToTotal(colWidths, containerW);
  }

  const naturalTotal = sumColumnWidths(colWidths);

  return {
    colWidths,
    baseColWidths,
    rowHeightMap: mergedRows,
    totalWidth: naturalTotal,
    displayMaxCol: maxCol,
    strictRowHeight: isWord || !isFill,
    allowCellGrow: isFill && !isWord,
    fillContainerWidth: !isFill && !isDesign && !!(containerW && containerW > 0 && naturalTotal <= containerW),
  };
}

/** 合并格纵向总高（px） */
export function rowSpanTotalHeight(
  startRow: number,
  rowSpan: number,
  rowHeightMap: Map<number, number>,
): number {
  let h = 0;
  for (let r = startRow; r < startRow + rowSpan; r++) {
    h += rowHeightMap.get(r) ?? 32;
  }
  return Math.max(h, 32);
}
