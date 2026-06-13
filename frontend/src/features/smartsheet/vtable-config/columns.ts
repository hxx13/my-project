// frontend/src/features/smartsheet/vtable-config/columns.ts
import type { ColumnConfig } from '../types';

export function buildVTableColumns(cols: ColumnConfig[]): Record<string, unknown>[] {
  return cols.map((col) => {
    const base: Record<string, unknown> = {
      field: col.key,
      title: col.label,
      width: col.width ?? 120,
    };

    switch (col.type) {
      case 'checkbox':
        base.cellType = 'checkbox';
        break;
      case 'radio':
        base.cellType = 'radio';
        if (col.options) {
          base.fieldFormat = {
            type: 'radio',
            options: col.options.map((o) => ({ label: o, value: o })),
          };
        }
        break;
      case 'select':
        if (col.options) {
          base.fieldFormat = {
            type: 'select',
            options: col.options.map((o) => ({ label: o, value: o })),
          };
        }
        break;
      case 'multi-select':
        if (col.options) {
          base.fieldFormat = {
            type: 'multi-select',
            options: col.options.map((o) => ({ label: o, value: o })),
          };
        }
        break;
      case 'date':
        base.fieldFormat = { type: 'date' };
        break;
      case 'number':
        base.fieldFormat = { type: 'number' };
        break;
      case 'progressbar':
        base.cellType = 'progressbar';
        base.fieldFormat = { type: 'progressbar', min: 0, max: 100 };
        break;
    }

    return base;
  });
}

/** Get default value for a column type when creating new rows */
export function getDefaultCellValue(type: ColumnConfig['type']): unknown {
  switch (type) {
    case 'checkbox': return false;
    case 'radio': return '';
    case 'number': return null;
    case 'progressbar': return 0;
    case 'select': case 'multi-select': case 'text': case 'user': case 'date':
    default: return '';
  }
}

export function buildVTableRecords(
  rows: { id: string; rowIndex: number; rowLabel: string; cellData: Record<string, unknown>; version: number }[]
): Record<string, unknown>[] {
  return rows.map((row) => ({
    __id: row.id,
    __version: row.version,
    __rowLabel: row.rowLabel,
    __rowIndex: row.rowIndex,
    ...row.cellData,
  }));
}
