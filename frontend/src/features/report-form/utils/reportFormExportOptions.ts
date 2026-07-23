import type { ReportFormDefinition, WordTemplateBinding } from '../types';

export type ReportFormSourceKind = 'blank' | 'excel' | 'word' | 'template' | string;

export interface FormExportCapabilities {
  /** 可导出 Excel 模板/填报（网格类） */
  excel: boolean;
  /** 可导出 Word 模板/填报（Word 类） */
  word: boolean;
  /** 可导出 PDF */
  pdf: boolean;
  source: ReportFormSourceKind;
  sourceLabel: string;
  wordTemplates: { id: string; name: string }[];
}

export function normalizeFormSource(source?: string | null): ReportFormSourceKind {
  const s = (source || 'blank').trim().toLowerCase();
  return s || 'blank';
}

export function sourceDisplayLabel(source?: string | null): string {
  const s = normalizeFormSource(source);
  if (s === 'excel') return 'Excel';
  if (s === 'word') return 'Word';
  if (s === 'template') return '模板';
  return '空白';
}

/** 解析 wordTemplateIdsJson（字符串或数组） */
export function parseWordTemplateBindings(raw: unknown): WordTemplateBinding[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      parsed = JSON.parse(t);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is WordTemplateBinding => {
    return item != null && typeof item === 'object' && typeof (item as WordTemplateBinding).id === 'string';
  });
}

/** 根据报表来源与 Word 模板绑定，判断应展示哪些导出入口 */
export function getFormExportCapabilities(form: Pick<ReportFormDefinition, 'source' | 'wordTemplateIdsJson'>): FormExportCapabilities {
  const source = normalizeFormSource(form.source);
  const wordTemplates = parseWordTemplateBindings(form.wordTemplateIdsJson);
  const hasWordData = wordTemplates.some(t => typeof t.data === 'string' && t.data.length > 0);

  const isWordPrimary = source === 'word';
  const isExcelPrimary = source === 'excel';

  return {
    excel: isExcelPrimary || source === 'blank' || source === 'template' || (!isWordPrimary && !hasWordData),
    word: isWordPrimary || hasWordData,
    pdf: true,
    source,
    sourceLabel: sourceDisplayLabel(source),
    wordTemplates: wordTemplates.map(t => ({
      id: t.id,
      name: t.name?.trim() || t.id,
    })),
  };
}

export function defaultWordTemplateId(form: Pick<ReportFormDefinition, 'wordTemplateIdsJson'>): string | undefined {
  const list = parseWordTemplateBindings(form.wordTemplateIdsJson);
  return list[0]?.id;
}
