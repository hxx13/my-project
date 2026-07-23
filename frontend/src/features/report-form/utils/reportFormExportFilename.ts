import type { FillMode } from '../types';

/** 导出文件名非法字符清理 */
export function sanitizeExportFilenamePart(part: string): string {
  return part.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ');
}

export function parseFillMode(fillPolicyJson: unknown): FillMode {
  if (!fillPolicyJson) return 'shared';
  try {
    const fp = typeof fillPolicyJson === 'string' ? JSON.parse(fillPolicyJson) : fillPolicyJson;
    return fp?.mode === 'individual' ? 'individual' : 'shared';
  } catch {
    return 'shared';
  }
}

/**
 * 导出文件名：模板名称；个人表为「模板名-子文件名」；批量为「模板名-批量」。
 */
export function buildReportExportFilename(options: {
  formName: string;
  extension: string;
  fillMode?: FillMode;
  instanceLabel?: string;
  batch?: boolean;
  /** 设计页多 Word 模板时附加模板名 */
  wordTemplateName?: string;
}): string {
  const ext = options.extension.replace(/^\./, '');
  let base = sanitizeExportFilenamePart(options.formName);
  if (!base) base = 'report-form';

  if (options.wordTemplateName) {
    const tmpl = sanitizeExportFilenamePart(options.wordTemplateName);
    if (tmpl) base = `${base}-${tmpl}`;
  }

  if (options.batch) {
    return `${base}-批量.${ext}`;
  }

  if (options.fillMode === 'individual' && options.instanceLabel?.trim()) {
    const label = sanitizeExportFilenamePart(options.instanceLabel);
    if (label) return `${base}-${label}.${ext}`;
  }

  return `${base}.${ext}`;
}

export function parseContentDispositionFilename(disposition: string): string | undefined {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      return utf8[1].trim();
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(disposition);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(disposition);
  if (plain?.[1]) return plain[1].replace(/"/g, '').trim();
  return undefined;
}
