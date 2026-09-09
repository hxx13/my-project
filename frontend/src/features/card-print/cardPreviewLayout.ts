import { effectiveCells, type CardCell, type CardSlot, type CardSpec } from "./types";

const MM_TO_PX = 96 / 25.4; // CSS 1mm ≈ 3.7795px

/** 单元格为空：label 与 fieldKey 都为 null/空白。 */
const isBlankCell = (c: CardCell | undefined) =>
  c == null ||
  ((c.label == null || c.label.trim() === "") &&
    (c.fieldKey == null || c.fieldKey.trim() === ""));

export interface SlotRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreviewLayout {
  /** 纸面尺寸（外层卡片盒子） */
  paperWidthPx: number;
  paperHeightPx: number;
  /** 布局空间尺寸（内容盒子的尺寸，rotate90 时与纸面互换） */
  layoutWidthPx: number;
  layoutHeightPx: number;
  rotated: boolean;
  /** rows[j][i] = 第 j 行第 i 列的矩形 */
  rows: SlotRect[][];
  qrRect: SlotRect | null;
  /** 表格块矩形（用于画表格外框，可选） */
  tableRect: SlotRect | null;
}

/** 与后端 CardLayoutEngine.layout 同算法：左上角原点，单位 mm。 */
export function computePreviewLayout(spec: CardSpec, slots: CardSlot[]): PreviewLayout {
  const landscape = spec.landscape === true;
  const rotate90 = spec.rotate90 === true;

  // 纸面尺寸（物理页面）
  const paperW = landscape ? spec.pageHeightMm : spec.pageWidthMm;
  const paperH = landscape ? spec.pageWidthMm : spec.pageHeightMm;
  // 布局空间尺寸（矩形都算在这个空间里）
  const layoutW = rotate90 ? paperH : paperW;
  const layoutH = rotate90 ? paperW : paperH;

  const contentX = spec.offsetXMm + spec.marginMm;
  const contentY = spec.offsetYMm + spec.marginMm;
  const contentW = layoutW - 2 * spec.marginMm;
  const contentH = layoutH - 2 * spec.marginMm;

  const qrOn = spec.qr.enabled;
  let qrH: string | null = null;
  let qrW = 0;
  if (qrOn) {
    qrH = spec.qr.anchor.split("-")[1];
    qrW = spec.qr.sizeMm + spec.qr.marginMm;
  }

  let qrRect: SlotRect | null = null;
  if (qrOn) {
    const qrV = spec.qr.anchor.split("-")[0];
    const x =
      qrH === "left"
        ? contentX
        : qrH === "center"
          ? spec.offsetXMm + (layoutW - spec.qr.sizeMm) / 2
          : spec.offsetXMm + layoutW - spec.marginMm - spec.qr.sizeMm;
    const y =
      qrV === "top"
        ? contentY
        : qrV === "middle"
          ? spec.offsetYMm + (layoutH - spec.qr.sizeMm) / 2
          : spec.offsetYMm + layoutH - spec.marginMm - spec.qr.sizeMm;

    qrRect = { index: -1, x, y, w: spec.qr.sizeMm, h: spec.qr.sizeMm };
  }

  // 二维码让位后的槽位区
  let slotAreaX = contentX;
  let slotAreaW = contentW;
  if (qrOn) {
    if (qrH === "left") {
      slotAreaX = contentX + qrW;
      slotAreaW = contentW - qrW;
    } else if (qrH === "right") {
      slotAreaW = contentW - qrW;
    }
    // center：二维码与槽位重叠，仅用于纯二维码卡
  }

  const table = spec.table;
  const tableOn = table != null;
  let tW: number, tH: number, tableX: number, tableY: number;
  if (table != null) {
    // 默认横向锚点：二维码在左则表格靠右、在右则靠左，否则靠左；默认纵向靠顶。
    const defaultHAlign =
      qrOn && qrH === "left" ? "right" : qrOn && qrH === "right" ? "left" : "left";
    const defaultVAlign = "top";

    let hAlign: string, vAlign: string;
    if (table.anchor != null) {
      hAlign = table.anchor.split("-")[1];
      vAlign = table.anchor.split("-")[0];
    } else {
      hAlign = defaultHAlign;
      vAlign = defaultVAlign;
    }

    tW = table.widthMm != null ? Math.min(table.widthMm, contentW) : slotAreaW;
    tH = table.heightMm != null ? Math.min(table.heightMm, contentH) : contentH;

    tableX =
      hAlign === "left"
        ? contentX
        : hAlign === "center"
          ? contentX + (contentW - tW) / 2
          : contentX + contentW - tW;
    tableY =
      vAlign === "top"
        ? contentY
        : vAlign === "middle"
          ? contentY + (contentH - tH) / 2
          : contentY + contentH - tH;
  } else {
    tW = slotAreaW;
    tH = contentH;
    tableX = slotAreaX;
    tableY = contentY;
  }

  const rowCount = slots.length;

  // 列数：优先表格块配置，否则取各行有效列数的最大值。
  let colCount: number;
  if (table?.colCount != null) {
    colCount = Math.max(1, table.colCount);
  } else {
    let maxCells = 0;
    for (const s of slots) maxCells = Math.max(maxCells, effectiveCells(s).length);
    colCount = Math.max(1, maxCells);
  }

  // 列宽(mm)：配置列宽按比例缩放到 tW，否则等分 tW。
  const colW: number[] = new Array<number>(colCount);
  const cfgWidths = table?.colWidthsMm ?? null;
  if (cfgWidths != null && cfgWidths.length === colCount) {
    let sum = 0;
    for (const v of cfgWidths) sum += v;
    if (sum <= 0) sum = colCount;
    for (let i = 0; i < colCount; i++) colW[i] = (cfgWidths[i] / sum) * tW;
  } else {
    for (let i = 0; i < colCount; i++) colW[i] = tW / colCount;
  }

  const rowH =
    spec.lineHeightMm != null
      ? spec.lineHeightMm
      : rowCount > 0
        ? tH / rowCount
        : 0;

  // 列前缀和：colPrefix[i] = Σ colW[0..i-1]，用于定位第 i 列的 x 与跨列宽。
  const colPrefix: number[] = new Array<number>(colCount + 1).fill(0);
  for (let i = 0; i < colCount; i++) colPrefix[i + 1] = colPrefix[i] + colW[i];

  const rows: SlotRect[][] = [];
  for (let j = 0; j < rowCount; j++) {
    const cells = effectiveCells(slots[j]);
    const row: SlotRect[] = [];
    let cursor = 0;
    for (let i = 0; i < cells.length && cursor < colCount; i++) {
      const c = cells[i];
      const raw = c.colSpan ?? 1;
      const span = Math.max(1, Math.min(raw, colCount - cursor));
      if (span <= 0) break;
      if (!isBlankCell(c)) {
        const x = tableX + colPrefix[cursor];
        const w = colPrefix[cursor + span] - colPrefix[cursor];
        row.push({ index: i, x, y: tableY + j * rowH, w, h: rowH });
      }
      cursor += span;
    }
    rows.push(row);
  }

  return {
    paperWidthPx: paperW * MM_TO_PX,
    paperHeightPx: paperH * MM_TO_PX,
    layoutWidthPx: layoutW * MM_TO_PX,
    layoutHeightPx: layoutH * MM_TO_PX,
    rotated: rotate90,
    rows,
    qrRect,
    tableRect: tableOn ? { index: -2, x: tableX, y: tableY, w: tW, h: tH } : null,
  };
}

export { MM_TO_PX };
