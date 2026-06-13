// frontend/src/features/smartsheet/vtable-config/columns.ts
import type { ColumnConfig } from '../types';

export const CELL_TYPE_MAP: Record<string, string> = {
  checkbox: 'checkbox', radio: 'radio', progressbar: 'progressbar', switch: 'switch',
};

export function buildVTableColumns(cols: ColumnConfig[]): Record<string, unknown>[] {
  return cols.map((col) => {
    const def: Record<string, unknown> = { field: col.key, title: col.label, width: col.width ?? 120 };
    const vtype = CELL_TYPE_MAP[col.type];
    if (vtype) def.cellType = vtype;
    if ((col.type === 'select' || col.type === 'multi-select') && col.options) {
      def.fieldFormat = { type: col.type === 'multi-select' ? 'multiple' : 'single', options: col.options.map((o) => ({ label: o, value: o })) };
    }
    if (col.type === 'number') def.fieldFormat = { type: 'number' };
    if (col.type === 'date') def.fieldFormat = { type: 'date' };
    return def;
  });
}

export function buildVTableRecords(rows: { id: string; cellData: Record<string, unknown>; version: number }[]): Record<string, unknown>[] {
  return rows.map((row) => ({ __id: row.id, __version: row.version, ...row.cellData }));
}

export function getDefaultCellValue(type: ColumnConfig['type']): unknown {
  switch (type) {
    case 'checkbox': return false;
    case 'number': case 'progressbar': return 0;
    default: return '';
  }
}
