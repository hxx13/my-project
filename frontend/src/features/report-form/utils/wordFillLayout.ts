import type { LayoutJson, ThemeJson } from '../types';
import { parseLayoutJson } from '../components/FormGridRenderer';

/** Word 报表填报页：仅展示正文区（导出/打印仍用后端切片）；网页填报已改为完整版式 */
export function sliceWordFillLayout(
  rawLayout: LayoutJson | string,
  rawTheme?: ThemeJson | string,
): { layout: LayoutJson; theme: ThemeJson | undefined } {
  const layout = parseLayoutJson(rawLayout);
  const headerEnd = layout.wordPrintHeaderRowEnd ?? 0;
  const footerStart = layout.wordPrintFooterRowStart;
  const footerBound = footerStart != null && footerStart >= 0 ? footerStart : Number.POSITIVE_INFINITY;

  if (headerEnd <= 0 && !Number.isFinite(footerBound)) {
    return { layout, theme: parseThemeOptional(rawTheme) };
  }

  const cells = layout.cells
    .filter(c => c.row >= headerEnd && c.row < footerBound)
    .map(c => ({ ...c, row: c.row - headerEnd }));

  let theme = parseThemeOptional(rawTheme);
  if (theme?.rowHeights && headerEnd > 0) {
    const next: Record<number, number> = {};
    for (const [k, h] of Object.entries(theme.rowHeights)) {
      const row = Number(k);
      if (row >= headerEnd && row < footerBound) {
        next[row - headerEnd] = h;
      }
    }
    theme = { ...theme, rowHeights: next };
  }

  return {
    layout: { ...layout, cells },
    theme,
  };
}

function parseThemeOptional(raw: ThemeJson | string | undefined): ThemeJson | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ThemeJson;
    } catch {
      return undefined;
    }
  }
  return raw;
}
