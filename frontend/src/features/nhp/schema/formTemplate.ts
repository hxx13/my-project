/**
 * NHP CRF 表单模板 Schema 类型。
 *
 * 三级结构：Section（数据域 D1~D10）→ SubSection（子模块 D1.01）→ Field（字段）。
 * 本文件只描述「表单内容」的可配置结构；采集阶段骨架（供体→配型→手术→随访→终点）由
 * 业务流转定义（见 09），不属模板内容。
 *
 * 设计约束（见 13）：
 * - 纯类型，无 UI、无状态、无副作用
 * - 题型不含 AUP 的 picker 类（personPicker/departmentPicker/cagePicker/animalPicker），
 *   与我们人员/笼架信息尚未建立关联，后续需要时再扩。
 */

/** 条件显示运算符（作用在 Section / SubSection / Field 任意层级） */
export type ShowWhenOp =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "notEmpty"
  | "empty";

/** 条件显示规则：引用其它字段的取值来决定本节点是否显示 */
export interface ShowWhen {
  /** 被引用的字段 key，如 "D1.birth_date" */
  field: string;
  op: ShowWhenOp;
  /** equals/notEquals/contains/notContains 时的比较值；notEmpty/empty 时省略 */
  value?: string | number | boolean;
}

/** 字段题型（NHP 专用，去掉 picker 类） */
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
  /** 概念码（DERIVED/CALC 计算锚点，如 PAIR_SCORE / VR） */
  conceptCode?: string;
}

/** 字段 role（与 type 正交：type 管「是什么控件」，role 管「能不能手填 / 从哪取值」） */
export type FieldRole = "PK" | "FK" | "DERIVED" | "VALUE";

/** role 专属元数据（由事件类型定义配置驱动，非硬编码） */
export interface FieldRoleMeta {
  /** PK：取号规则编码（如 SMP/MED），用于展示「由 X 规则生成」 */
  pkRule?: string;
  /** DERIVED：算法/规则来源（如「平台配对算法 V1」），显式标注给填写人 */
  derivedSource?: string;
  /** FK：目标实体类型（如 donor/recipient/sample/regimen），实体选择器据此取数 */
  entityType?: string;
}

/** 字段（可配置的最小单元） */
export interface FormField {
  id?: number;
  /** 字段键，如 "D1.01.donor_id" */
  fieldKey: string;
  label: string;
  /** 说明文字（可空，支持富文本 HTML） */
  description?: string;
  type: FieldType;
  required?: boolean;
  /** choice 内联选项，或 dictKey 引用码表（二选一） */
  options?: FieldOptions;
  /** 引用码表（来自 04 的码表编码，如 FARM/BREED） */
  dictKey?: string;
  /** role 四类：决定采集侧渲染形态，与 type 正交；缺省按 VALUE 处理（兼容旧数据） */
  role?: FieldRole;
  /** role 专属元数据（PK 取号规则 / DERIVED 算法来源 / FK 实体类型） */
  roleMeta?: FieldRoleMeta;
  /** 字段存储类型（字典层权威，约束可选题型；STRING/TEXT/INTEGER/DECIMAL/DATE/DATETIME/ENUM/ENUM_MULTI/BOOLEAN/FILE/CALC） */
  dataType?: string;
  /** 概念码（DERIVED/CALC 计算锚点，如 PAIR_SCORE / VR） */
  conceptCode?: string;
  showWhen?: ShowWhen | null;
  sortOrder?: number;
  config?: FieldConfig;
}

/** 小章节（子模块），如 D1.01，对齐字段字典的子模块 */
export interface FormSubSection {
  id?: number;
  /** 子模块标识，如 "D1.01" */
  code: string;
  label: string;
  sortOrder?: number;
  description?: string;
  descriptionTone?: NoteTone;
  showWhen?: ShowWhen | null;
  fields: FormField[];
}

/** 大段（数据域），如 D1 供体猪域 */
export interface FormSection {
  id?: number;
  /** 数据域标识，如 "D1" */
  code: string;
  label: string;
  sortOrder?: number;
  /** 是否细分小章节（true=D1.01~D1.xx 细分；false=直接挂字段） */
  subdivisible: boolean;
  showWhen?: ShowWhen | null;
  highlight?: boolean;
  subsections?: FormSubSection[];
  fields?: FormField[];
}

/** 表单模板顶层结构 */
export interface FormTemplate {
  /** 表单唯一标识，如 "nhp-crf-v1" */
  formKey: string;
  title?: string;
  sections: FormSection[];
}
