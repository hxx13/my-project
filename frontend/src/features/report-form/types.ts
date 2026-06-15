// frontend/src/features/report-form/types.ts

export type FormStatus = 'draft' | 'published' | 'archived';
export type FillMode = 'shared' | 'individual';
export type FieldType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT'
  | 'MULTI_SELECT' | 'DATETIME' | 'IMAGE' | 'FILE' | 'USER' | 'AUTO_USER';
export type CellKind = 'static' | 'field';
export type CellAlign = 'left' | 'center' | 'right';
export type SchedulePeriod = 'manual' | 'daily' | 'weekly' | 'monthly';

export interface CellStyle {
  align: CellAlign;
  bold?: boolean;
  fontSize?: number;
  bg?: string;      // 背景色
  color?: string;   // 字体颜色
}

export interface GridCell {
  id: string;
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
  kind: CellKind;
  staticText?: string;
  fieldKey?: string;
  style: CellStyle;
}

export interface FieldDefinition {
  type: FieldType;
  label: string;
  required?: boolean;
  editableInFill?: boolean;
  editableByRoles?: string[];
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  optionSetId?: string;
  options?: { label: string; value: string }[];
  props?: Record<string, unknown>;
}

export interface LayoutJson {
  cells: GridCell[];
  fields: Record<string, FieldDefinition>;
  mergeGroups: { cellIds: string[] }[];
}

export interface ThemeJson {
  headerBg: string;
  headerColor: string;
  headerFontSize: number;
  headerBold: boolean;
  headerAlign: CellAlign;
  zebraStripe: boolean;
  oddRowBg: string;
  evenRowBg: string;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  cellPadding: number;
  defaultFontSize: number;
  defaultAlign: CellAlign;
  columnWidths: Record<number, number>;
  rowHeights: Record<number, number>;
}

export interface FillPolicyJson {
  mode: FillMode;
  submitLabel: string;
  allowEditAfterSubmit: boolean;
}

export interface PermissionJson {
  visibleRoles: string[];
  visibleUserIds: number[];
  fieldRoleBindings: Record<string, { editableByRoles: string[] }>;
  allowUnboundView: boolean;
}

export interface ScheduleJson {
  period: SchedulePeriod;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  graceDays?: number;
}

export interface WordTemplateBinding {
  id: string;
  name: string;
  bookmarks?: string[];
  bookmarkMapping: Record<string, string>;
  data?: string;
}

export interface ReportFormDefinition {
  id: number;
  name: string;
  description: string;
  source?: string; // blank | excel | word | template
  status: FormStatus;
  pinned?: boolean;
  layoutJson: LayoutJson;
  themeJson: ThemeJson;
  fillPolicyJson: FillPolicyJson;
  permissionJson: PermissionJson;
  scheduleJson: ScheduleJson;
  wordTemplateIdsJson: WordTemplateBinding[];
  versionSnapshotsJson: VersionSnapshot[];
  createdBy: string;
  updatedBy: string;
  publishedBy: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface VersionSnapshot {
  version: number;
  publishedAt: string;
  publishedBy: string;
  snapshot: {
    layoutJson: LayoutJson;
    themeJson: ThemeJson;
    permissionJson: PermissionJson;
  };
}

export interface ReportFormSubmission {
  id: number;
  formId: number;
  userId: number;
  status: 'draft' | 'submitted';
  fieldValuesJson: Record<string, unknown>;
  version: number;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OptionSet {
  id: number;
  name: string;
  scope: 'global' | 'form';
  formId?: number;
  itemsJson: { label: string; sortOrder: number }[];
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}
