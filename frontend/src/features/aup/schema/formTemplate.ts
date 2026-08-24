/**
 * AUP 表单模板 Schema 类型（与后端 DTO 严格对齐：SectionVO / SubsectionVO / FieldVO）。
 *
 * 三级结构：Section（大段/板块 A/B/C…） → SubSection（小章节 A1/A2…） → Field（字段）。
 * 本文件只描述「表单内容」的可配置结构；审批阶段骨架（stageFlow）由代码硬编码，不属于模板内容。
 *
 * 字段命名以后端 JSON 为准（camelCase）：
 * - FieldVO：`id`/`fieldKey`/`label`/`type`/`options`/`dictKey`/`required`/`showWhen`/`sortOrder`/`config`
 * - SectionVO：`id`/`code`/`label`/`sortOrder`/`subdivisible`/`showWhen`/`subsections`/`fields`
 * - SubsectionVO：`id`/`code`/`label`/`sortOrder`/`description`/`showWhen`/`fields`
 *
 * 后端 options/showWhen/config 为 JSON `Object`，此处以更精确的前端解释类型承载
 * （FieldOptions / ShowWhen / FieldConfig），二者在运行时语义等价。
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
  /** 被引用的字段 key，如 "A8.parts" / "B3.hasPain" */
  field: string;
  op: ShowWhenOp;
  /** equals/notEquals/contains/notContains 时的比较值；notEmpty/empty 时省略 */
  value?: string | number | boolean;
}

/** 字段类型（规格 9.3 全量枚举） */
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
  // 人员 / 组织
  | "personPicker"
  | "departmentPicker"
  // 业务专属（动物系统）
  | "cagePicker"
  | "animalPicker"
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
  /** 固定选中：默认勾选且不可取消（如 A8 中必选的补充表选项） */
  fixed?: boolean;
  /** 分组标题：同 group 的选项渲染在同一个分组下（choice config.layout=grouped 时生效） */
  group?: string;
}

/**
 * 字段选项：统一为 { value, label } 对象数组；
 * 当 value === label 时允许简写为纯字符串数组（["本科生", "硕士"]）。
 */
export type FieldOptions = Array<OptionItem | string>;

/** 字段附加配置（对应 DB `config` 列；按 type 取用不同子集） */
export interface FieldConfig {
  /** text/textarea：字数上限 */
  maxLength?: number;
  /** choice：单选 / 多选 */
  choiceType?: ChoiceType;
  /** choice：选项排版（list 竖排 / grid 多列 / grouped 分组标题），缺省 list */
  layout?: "list" | "grid" | "grouped";
  /** choice/group：grid/grouped 时每行列数（2/3/4） */
  cols?: number;
  /** group/repeatGroup：子字段跨列数（grid-column: span N），实现整行/半行排布 */
  span?: number;
  /** description/richText：说明块高亮变体 */
  tone?: NoteTone;
  /** table：动态行列定义（每列也是 Field） */
  columns?: FormField[];
  /** group：嵌套字段组 */
  fields?: FormField[];
  /** number：单位 */
  unit?: string;
  /** number：最小值 */
  min?: number;
  /** number：最大值 */
  max?: number;
  /** file/image：接受的文件类型 */
  accept?: string;
  /** file/image：单文件大小上限（字节） */
  maxSize?: number;
  /** file/image：数量上限 */
  maxCount?: number;
  /** cascade：级联层级（如 ["校区","楼","房间"]） */
  levels?: string[];
  /** 表格列：列宽（px） */
  width?: number;
  /** select：下拉数据源改为本地 ref_data 类型（ANIMAL_BREED / ANIMAL_STRAIN），选项取 fieldData.title */
  refDataSource?: string;
}

/** 字段（可配置的最小单元），对齐后端 FieldVO */
export interface FormField {
  /** 数据库主键（后端 Long → number） */
  id?: number;
  /** 字段键，如 "A8.parts" / "B1.purpose" */
  fieldKey: string;
  label: string;
  /** 说明文字（可空，支持富文本 HTML） */
  description?: string;
  type: FieldType;
  /** 字段角色 VALUE/DERIVED/PK/FK（对齐 cage/NHP） */
  role?: string;
  /** 是否必填（0/1 → boolean） */
  required?: boolean;
  /** choice 内联选项，或 dictKey 引用公共字典（二选一） */
  options?: FieldOptions;
  /** 引用公共字典（复用场景），与 options 互斥 */
  dictKey?: string;
  /** 条件显示 */
  showWhen?: ShowWhen | null;
  /** 排序 */
  sortOrder?: number;
  /** 附加配置 */
  config?: FieldConfig;
}

/** 小章节（SubSection），如 A1/A2…，对齐后端 SubsectionVO */
export interface FormSubSection {
  /** 数据库主键（后端 Long → number） */
  id?: number;
  /** 小章节标识，如 "A1" */
  code: string;
  label: string;
  /** 排序 */
  sortOrder?: number;
  /** 说明文字（可选） */
  description?: string;
  /** 小节说明高亮变体（info/warn/danger/muted），与字段级 config.tone 语义一致 */
  descriptionTone?: NoteTone;
  /** 条件显示 */
  showWhen?: ShowWhen | null;
  fields: FormField[];
}

/** 大段 / 板块（Section），如 A/B/C…，对齐后端 SectionVO */
export interface FormSection {
  /** 数据库主键（后端 Long → number） */
  id?: number;
  /** 板块标识，如 "A" */
  code: string;
  label: string;
  /** 排序 */
  sortOrder?: number;
  /** 是否细分小章节（true=A1~A8 细分；false=直接是字段） */
  subdivisible: boolean;
  /** 条件显示（补充表 G–L 用） */
  showWhen?: ShowWhen | null;
  /** 是否突出显示（0 号前置说明等板块用作强调卡片，后台可配置） */
  highlight?: boolean;
  /** subdivisible=true 时的小章节列表 */
  subsections?: FormSubSection[];
  /** subdivisible=false 时直接挂字段 */
  fields?: FormField[];
}

/** 表单模板顶层结构（§9.2；后端 TemplateDetailVO 的 sections 载体） */
export interface FormTemplate {
  /** 表单唯一标识，如 "aup" */
  formKey: string;
  /** 表单标题 */
  title?: string;
  /** 审批阶段骨架（定死，不参与配置；此处仅作结构示意） */
  stageFlow?: string[];
  sections: FormSection[];
}
