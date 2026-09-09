// utils/reportGridHeader.ts
import type { LayoutJson } from '../types';

/**
 * 判断第 0 行是否像「列名行」，用于决定首行是否默认吸顶。
 * 仅当第 0 行有 ≥2 个锚定格，且每个格都是「纯静态文本、无内嵌图片、无合并」时，
 * 才视为列名行；否则（如页眉 logo 行，含图片/合并格）返回 false。
 */
export function row0LooksLikeHeader(layout: LayoutJson): boolean {
  const row0 = layout.cells.filter(c => c.row === 0);
  if (row0.length < 2) return false;
  return row0.every(c => {
    const fieldType = c.fieldKey ? layout.fields[c.fieldKey]?.type : undefined;
    const isStatic = c.kind === 'static' || fieldType === 'STATIC';
    const noImage = !c.style?.imageSrc;
    const noMerge = c.rowSpan === 1 && c.colSpan === 1;
    return isStatic && noImage && noMerge;
  });
}
