// frontend/src/features/smartsheet/types.ts — V3 clean

export type LayoutMode = 'matrix' | 'table' | 'checklist' | 'calendar';
export type ColumnType = 'text' | 'number' | 'select' | 'multi-select'
  | 'date' | 'checkbox' | 'user' | 'progressbar' | 'radio';

export interface ColumnConfig {
  key: string;
  label: string;
  type: ColumnType;
  options?: string[];
  required?: boolean;
  width?: number;
  min?: number;
  max?: number;
}

export interface SmartSheetDefinition {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: { type: 'manual' | 'reference'; tableName?: string; labelField?: string; valueField?: string };
  templateId?: string;
  isPinned?: number;
  isTemplate?: number;
  rowLimit?: number;
  themeConfig?: Record<string, string>;
  rowCount?: number;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmartSheetRow {
  id: string;
  sheetId: string;
  rowIndex: number;
  rowLabel: string;
  rowEntityId?: string;
  cellData: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SmartsheetSheetRequest {
  name: string;
  description?: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: object;
  templateId?: string;
  isTemplate?: boolean;
}

export interface SmartsheetCellUpdateRequest {
  columnKey: string;
  value: unknown;
  expectedVersion: number;
}

export interface SmartsheetImportResult {
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errors: string[];
  preview: Record<string, string>[];
}

export interface SystemPreset {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  defaultColumns: ColumnConfig[];
}

export const SYSTEM_PRESETS: SystemPreset[] = [
  {
    id: 'sys-checklist',
    name: '勾选清单',
    description: '逐项确认模式。适合安全巡检、设备点检、审计核对表',
    layoutMode: 'checklist',
    defaultColumns: [
      { key: 'col_check', label: '结果', type: 'checkbox' },
      { key: 'col_note', label: '备注', type: 'text' },
      { key: 'col_inspector', label: '检查人', type: 'user' },
    ],
  },
  {
    id: 'sys-table',
    name: '数据表格',
    description: '列头+行记录，支持排序筛选。适合设备清单、人员花名册、资产台账',
    layoutMode: 'table',
    defaultColumns: [
      { key: 'col_name', label: '名称', type: 'text' },
      { key: 'col_status', label: '状态', type: 'select', options: ['在用', '闲置', '报废'] },
      { key: 'col_date', label: '日期', type: 'date' },
    ],
  },
];
