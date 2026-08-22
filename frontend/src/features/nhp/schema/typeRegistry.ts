/**
 * NHP 题型注册表（单一事实来源）。
 *
 * 统一维护全部字段题型的元信息：枚举值、中文名、图标字、分组、能力标记、默认 config。
 *
 * 消费方：
 * - NhpTemplateEditor：TypeMenu 网格、题型下拉、renderTypeConfig 分发、字段创建默认 config
 * - NhpFormField：渲染分发时按 type 的 switch
 *
 * 新增题型 = 在此加一行 + formTemplate.ts 的 FieldType 联合类型 + NhpFormField 渲染 case。
 *
 * 注意：已去掉 AUP 的 picker 类（personPicker/departmentPicker/cagePicker/animalPicker），
 * 与人员/笼架信息建立关联后再扩。
 */
import type { FieldConfig, FieldType } from "./formTemplate";

/** 题型分组（菜单分区） */
export type FieldTypeGroup = "input" | "choice" | "structure" | "upload" | "decor";

export interface FieldTypeMeta {
  value: FieldType;
  label: string;
  icon: string;
  group: FieldTypeGroup;
  /** choice/checkbox：选项来源面板（内联选项 / 码表） */
  hasOptions?: boolean;
  /** table/group：可配置子字段列表 */
  nestable?: boolean;
  defaultConfig?: Partial<FieldConfig>;
}

export const FIELD_TYPE_GROUP_LABELS: Record<FieldTypeGroup, string> = {
  input: "基础输入",
  choice: "选择类",
  structure: "结构化",
  upload: "上传类",
  decor: "特殊 / 装饰",
};

export const TYPE_REGISTRY: FieldTypeMeta[] = [
  { value: "text", label: "输入框", icon: "文", group: "input" },
  { value: "textarea", label: "多行输入框", icon: "多", group: "input" },
  { value: "number", label: "数字输入框", icon: "数", group: "input" },
  { value: "date", label: "日期选择", icon: "日", group: "input" },
  { value: "dateRange", label: "日期区间", icon: "区", group: "input" },
  { value: "time", label: "时间选择", icon: "时", group: "input" },
  {
    value: "choice",
    label: "选择题",
    icon: "选",
    group: "choice",
    hasOptions: true,
    defaultConfig: { choiceType: "single" },
  },
  {
    value: "select",
    label: "下拉选择",
    icon: "↓",
    group: "choice",
    hasOptions: true,
    defaultConfig: { choiceType: "single" },
  },
  { value: "checkbox", label: "是否勾选", icon: "勾", group: "choice", hasOptions: true },
  { value: "cascade", label: "级联选择", icon: "级", group: "choice" },
  { value: "table", label: "表格", icon: "表", group: "structure", nestable: true, defaultConfig: { columns: [] } },
  { value: "group", label: "字段组", icon: "组", group: "structure", nestable: true, defaultConfig: { fields: [] } },
  { value: "repeatGroup", label: "可重复块", icon: "块", group: "structure", defaultConfig: { fields: [] } },
  { value: "file", label: "附件上传", icon: "附", group: "upload", defaultConfig: { maxCount: 1 } },
  { value: "image", label: "图片上传", icon: "图", group: "upload", defaultConfig: { maxCount: 1 } },
  { value: "signature", label: "签名", icon: "签", group: "decor" },
  { value: "richText", label: "富文本", icon: "富", group: "decor" },
  { value: "divider", label: "分隔线", icon: "分", group: "decor" },
  { value: "description", label: "说明文字", icon: "说", group: "decor" },
];

/** 题型下拉选项（编辑器兼容用） */
export const FIELD_TYPES = TYPE_REGISTRY.map((t) => ({ value: t.value, label: t.label }));

/** type → 元信息 */
export const typeMetaOf = (t: FieldType): FieldTypeMeta | undefined =>
  TYPE_REGISTRY.find((x) => x.value === t);

export const typeLabelOf = (t: FieldType): string => typeMetaOf(t)?.label ?? t;

/** 带内联选项面板的题型集合（choice/select/checkbox） */
export const TYPES_WITH_OPTIONS = new Set<FieldType>(
  TYPE_REGISTRY.filter((t) => t.hasOptions).map((t) => t.value)
);

/** 可嵌套子字段的题型集合（table/group） */
export const TYPES_NESTABLE = new Set<FieldType>(
  TYPE_REGISTRY.filter((t) => t.nestable).map((t) => t.value)
);

/**
 * dataType（字典层存储类型）→ 兼容的控件 type（填写方式）。
 * 字段属性限制「存什么」，type 决定「怎么填」，二者独立但必须配合——
 * 编辑器选题型时按 dataType 过滤，避免 DECIMAL 字段选成下拉、ENUM 字段选成文本。
 */
export const DATA_TYPE_COMPATIBLE_TYPES: Record<string, FieldType[]> = {
  STRING: ["text", "textarea", "richText"],
  TEXT: ["textarea", "richText"],
  INTEGER: ["number"],
  DECIMAL: ["number"],
  DATE: ["date", "dateRange", "time"],
  DATETIME: ["date", "dateRange", "time"],
  ENUM: ["select", "choice", "cascade"],
  ENUM_MULTI: ["checkbox"],
  BOOLEAN: ["checkbox"],
  FILE: ["file", "image"],
  CALC: [],
};

/** 按 dataType 取可选题型；无 dataType 时返回全部（兼容旧数据，不设限） */
export function compatibleTypesFor(dataType?: string): FieldType[] {
  if (!dataType) return TYPE_REGISTRY.map((t) => t.value);
  return DATA_TYPE_COMPATIBLE_TYPES[dataType] ?? ["text"];
}
