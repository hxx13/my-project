// frontend/src/features/report-form/types.ts

export type FormStatus = 'draft' | 'published' | 'archived';
export type FillMode = 'shared' | 'individual';
export type FieldType = 'STATIC' | 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT'
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
  /** Word 导入：页眉等静态格内嵌图片（data URL 或 /api 路径） */
  imageSrc?: string;
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
  /** Word 导入：页眉区结束行（不含），正文从该行开始 */
  wordPrintHeaderRowEnd?: number;
  /** Word 导入：页脚区起始行（含） */
  wordPrintFooterRowStart?: number;
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
  /** Word 导入：页面正文区宽度（px），列宽缩放目标 */
  pageContentWidthPx?: number;
}

export interface FillPolicyJson {
  mode: FillMode;
  submitLabel: string;
  allowEditAfterSubmit: boolean;
  /** 个人表：允许同一用户创建多份子文件 */
  allowMultipleInstances?: boolean;
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
  /** 填报中心：当前用户/协同表最近保存时间（后端 available 附带） */
  lastFillUpdatedAt?: string;
  lastSubmittedAt?: string;
  myFillStatus?: 'draft' | 'submitted';
  mySubmissionId?: number;
  allowMultipleInstances?: boolean;
  myInstanceCount?: number;
  publisher?: boolean;
  totalFillerCount?: number;
  totalSubmissionCount?: number;
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
  /** 个人多份填报时的子文件名称 */
  instanceLabel?: string;
  /** 填报人展示名（昵称优先，后端 listSubmissions 附带） */
  displayNickname?: string;
  status: 'draft' | 'submitted';
  fieldValuesJson: Record<string, unknown>;
  version: number;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublisherFillGroup {
  userId: number;
  displayNickname: string;
  instanceCount: number;
  instances: ReportFormSubmission[];
}

export interface OptionSet {
  id: number;
  name: string;
  scope: 'global' | 'form' | 'user';
  formId?: number;
  createdBy?: string;
  authProfile?: string;
  itemsJson: { label: string; sortOrder: number }[] | string;
  updatedAt?: string;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}
