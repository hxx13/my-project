import type { FieldDefinition } from '../types';
import { parseFileFieldValue } from './fileFieldValue';
import { formatDatetimeDisplay } from './reportFormFieldValue';

type OptionItem = { label: string; value: string };

function toBoolean(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v !== '' && v !== 'false' && v !== '0';
  if (typeof v === 'number') return v !== 0;
  return !!v;
}

function toArray(v: unknown): string[] {
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

/** 填报页非编辑态：格式化为纯文本展示 */
export function formatFillFieldDisplayText(
  field: FieldDefinition,
  value: unknown,
  getFieldOptions: (field: FieldDefinition) => OptionItem[],
): string {
  switch (field.type) {
    case 'BOOLEAN':
      return toBoolean(value) ? '✓ 是' : '';
    case 'MULTI_SELECT': {
      const arr = toArray(value);
      if (arr.length === 0) return '';
      const opts = getFieldOptions(field);
      return arr.map(v => opts.find(o => o.value === v)?.label ?? v).join('、');
    }
    case 'SELECT': {
      const val = String(value ?? '');
      if (!val) return '';
      const opts = getFieldOptions(field);
      return opts.find(o => o.value === val)?.label || val;
    }
    case 'NUMBER': {
      const n = value != null && value !== '' && value !== 'null' ? Number(value) : NaN;
      return !isNaN(n) ? String(n) : '';
    }
    case 'AUTO_USER':
      return value != null && value !== '' && value !== 'null' ? String(value) : '';
    case 'USER':
      return value != null && value !== '' && value !== 'null'
        ? String(value).replace(/,/g, '、')
        : '';
    case 'FILE': {
      const parsed = parseFileFieldValue(value);
      return parsed?.name ?? '';
    }
    case 'IMAGE':
      return value != null && value !== '' && value !== 'null' ? '图片' : '';
    case 'DATETIME':
      return formatDatetimeDisplay(value);
    default: {
      if (value == null || value === '' || value === 'null') return '';
      return String(value);
    }
  }
}

export function fillFieldHasMediaValue(field: FieldDefinition, value: unknown): boolean {
  if (field.type === 'IMAGE') return value != null && value !== '' && value !== 'null';
  if (field.type === 'FILE') return !!parseFileFieldValue(value)?.name;
  return false;
}
