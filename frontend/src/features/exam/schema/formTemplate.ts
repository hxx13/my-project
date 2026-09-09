/**
 * Exam 试卷表单模板 Schema 类型。
 *
 * 两级结构：Section（大题）→ Field（题目）。
 * 本文件只描述「试卷内容」的可配置结构。
 *
 * 设计约束：
 * - 纯类型，无 UI、无状态、无副作用
 */

/** 条件显示运算符（作用在 Section / Field 任意层级） */
export type ShowWhenOp =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "notEmpty"
  | "empty";

/** 条件显示规则：引用其它字段的取值来决定本节点是否显示 */
export interface ShowWhen {
  /** 被引用的字段 key，如 "S1.question_1" */
  field: string;
  op: ShowWhenOp;
  /** equals/notEquals/contains/notContains 时的比较值；notEmpty/empty 时省略 */
  value?: string | number | boolean;
}

/** 字段题型（考试卷） */
export type FieldType =
  // 基础输入
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "dateRange"
  | "time"
  // 选择类
  | "choice"
  | "select"
  | "checkbox"
  | "cascade"
  // 结构化
  | "table"
  | "group"
  | "repeatGroup"
  // 上传类
  | "file"
  | "image"
  // 特殊 / 装饰
  | "signature"
  | "richText"
  | "divider"
  | "description";

/** choice 字段的题型 */
export type ChoiceType = "single" | "multiple";

/** 说明文字高亮变体（description/richText 的 config.tone） */
export type NoteTone = "info" | "warn" | "danger" | "muted";

/** 选项条目（value 为落库值、label 为展示文本） */
export interface OptionItem {
  value: string;
  label: string;
  /** 固定选中：默认勾选且不可取消 */
  fixed?: boolean;
  /** 分组标题：同 group 的选项渲染在同一分组下（choice config.layout=grouped 时生效） */
  group?: string;
}

/**
 * 字段选项：统一为 { value, label } 对象数组；
 * 当 value === label 时允许简写为纯字符串数组。
 */
export type FieldOptions = Array<OptionItem | string>;

/** 字段附加配置（按 type 取用不同子集） */
export interface FieldConfig {
  /** text/textarea：字数上限 */
  maxLength?: number;
  /** choice：单选 / 多选 */
  choiceType?: ChoiceType;
  /** choice：单选题正确答案（选项 value） */
  answer?: string;
  /** choice：多选题正确答案（选项 value 数组） */
  answers?: string[];
  /** choice：单题分值（留空=等权重） */
  score?: number;
  /** choice：选项排版（list 竖排 / grid 多列 / grouped 分组标题），缺省 list */
  layout?: "list" | "grid" | "grouped";
  /** choice/group：grid/grouped 时每行列数（2/3/4） */
  cols?: number;
  /** group/repeatGroup：子字段跨列数 */
  span?: number;
  /** description/richText：说明块高亮变体 */
  tone?: NoteTone;
  /** table：动态行列定义（每列也是 Field） */
  columns?: FormField[];
  /** group：嵌套字段组 */
  fields?: FormField[];
  /** number：单位 */
  unit?: string;
  /** number：最小值 / 最大值 */
  min?: number;
  max?: number;
  /** file/image：接受的文件类型 */
  accept?: string;
  /** file/image：单文件大小上限（字节） */
  maxSize?: number;
  /** file/image：数量上限 */
  maxCount?: number;
  /** cascade：级联层级（如 ["中心", "批次"]） */
  levels?: string[];
  /** 表格列：列宽（px） */
  width?: number;
}

/** 字段（可配置的最小单元，即一道题） */
export interface FormField {
  id?: number;
  /** 字段键，如 "S1.question_1" */
  fieldKey: string;
  label: string;
  /** 说明文字（可空，支持富文本 HTML） */
  description?: string;
  type: FieldType;
  required?: boolean;
  /** choice 内联选项 */
  options?: FieldOptions;
  showWhen?: ShowWhen | null;
  sortOrder?: number;
  config?: FieldConfig;
}

/** 大题（板块），如 S1 */
export interface FormSection {
  id?: number;
  /** 大题标识，如 "S1" */
  code: string;
  label: string;
  sortOrder?: number;
  showWhen?: ShowWhen | null;
  highlight?: boolean;
  fields?: FormField[];
}

/** 试卷模板顶层结构 */
export interface FormTemplate {
  /** 试卷唯一标识，如 "exam-paper-v1" */
  formKey: string;
  title?: string;
  sections: FormSection[];
}
