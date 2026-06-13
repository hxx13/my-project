// frontend/src/features/smartsheet/types.ts — V2 simplified types

export type LayoutMode = 'matrix' | 'table' | 'checklist' | 'calendar';

export type ColumnType = 'text' | 'number' | 'select' | 'multi-select'
  | 'date' | 'checkbox' | 'user' | 'progressbar' | 'radio';

export interface ColumnConfig {
  key: string;
  label: string;
  type: ColumnType;
  options?: string[];
  required?: boolean;
  defaultValue?: string;
  width?: number;
  min?: number;
  max?: number;
  decimal?: number;
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
  cellData: Record<string, unknown>;  // preserves boolean/number/string native types
  version: number;
  createdAt: string;
  updatedAt: string;
}

// API request types
export interface SmartsheetSheetRequest {
  name: string;
  description?: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: object;
  templateId?: string;
  rowLimit?: number;
  themeConfig?: Record<string, string>;
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

export interface SmartSheetTemplate {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  defaultColumns: ColumnConfig[];
}

export const PRESET_TEMPLATES: SmartSheetTemplate[] = [
  {
    id: 'tpl-matrix', name: '交叉矩阵',
    description: '横纵双表头，交叉点配置。适合部门评估、设施巡查、供应商对比',
    layoutMode: 'matrix',
    defaultColumns: [
      { key: 'col_1', label: '列1', type: 'select', options: ['选项A', '选项B', '选项C'] },
      { key: 'col_2', label: '列2', type: 'number' },
      { key: 'col_3', label: '列3', type: 'text' },
    ],
  },
  {
    id: 'tpl-table', name: '简单数据表',
    description: '列头+行记录，支持排序筛选。适合设备清单、人员花名册、资产台账',
    layoutMode: 'table',
    defaultColumns: [
      { key: 'col_name', label: '名称', type: 'text' },
      { key: 'col_status', label: '状态', type: 'select', options: ['在用', '闲置', '报废'] },
      { key: 'col_date', label: '日期', type: 'date' },
    ],
  },
  {
    id: 'tpl-checklist', name: '勾选清单',
    description: '逐项确认模式。适合安全巡检、设备点检、审计核对表',
    layoutMode: 'checklist',
    defaultColumns: [
      { key: 'col_check', label: '结果', type: 'checkbox' },
      { key: 'col_note', label: '备注', type: 'text' },
      { key: 'col_inspector', label: '检查人', type: 'user' },
    ],
  },
  {
    id: 'tpl-calendar', name: '日历矩阵',
    description: '行头=资源，列头=日期。适合排班表、考勤记录、机房每日状态',
    layoutMode: 'calendar',
    defaultColumns: [
      { key: 'col_day1', label: '周一', type: 'checkbox' },
      { key: 'col_day2', label: '周二', type: 'checkbox' },
      { key: 'col_day3', label: '周三', type: 'checkbox' },
      { key: 'col_day4', label: '周四', type: 'checkbox' },
      { key: 'col_day5', label: '周五', type: 'checkbox' },
    ],
  },
];
