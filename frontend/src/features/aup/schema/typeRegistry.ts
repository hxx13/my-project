/**
 * 题型注册表（单一事实来源）。
 *
 * 统一维护全部字段类型的元信息：
 * - 枚举值（与 formTemplate.ts 的 FieldType 对齐）
 * - 中文名（编辑器菜单 / 下拉框）
 * - 图标字（菜单网格）
 * - 分组（菜单分区显示）
 * - 能力标记（hasOptions 是否带内联选项 / nestable 是否可嵌套子字段）
 * - 新建时的默认 config
 *
 * 消费方：
 * - AupTemplateEditor：TypeMenu 网格、题型下拉、renderTypeConfig 分发、字段创建默认 config
 * - FormField：渲染分发时按 type 的 switch（渲染组件耦合运行态，留在组件内）
 *
 * 新增题型 = 在此加一行 + formTemplate.ts 的 FieldType 联合类型 + FormField 渲染 case。
 */
import type { FieldConfig, FieldType } from "./formTemplate";

/** 题型分组（菜单分区） */
export type FieldTypeGroup = "input" | "choice" | "structure" | "upload" | "picker" | "decor";

export interface FieldTypeMeta {
  value: FieldType;
  label: string;
  icon: string;
  group: FieldTypeGroup;
  /** choice/checkbox：选项来源面板（内联选项 / 字典） */
  hasOptions?: boolean;
  /** table/group：可配置子字段列表 */
  nestable?: boolean;
  /** 新建该题型时的初始 config */
  defaultConfig?: Partial<FieldConfig>;
}

export const FIELD_TYPE_GROUP_LABELS: Record<FieldTypeGroup, string> = {
  input: "基础输入",
  choice: "选择类",
  structure: "结构化",
  upload: "上传类",
  picker: "选择器",
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
    defaultConfig: { choiceType: "single" } satisfies Partial<FieldConfig>,
  },
  {
    value: "select",
    label: "下拉选择",
    icon: "↓",
    group: "choice",
    hasOptions: true,
    defaultConfig: { choiceType: "single" } satisfies Partial<FieldConfig>,
  },
  { value: "checkbox", label: "是否勾选", icon: "勾", group: "choice", hasOptions: true },
  { value: "cascade", label: "级联选择", icon: "级", group: "choice" },
  { value: "table", label: "表格", icon: "表", group: "structure", nestable: true, defaultConfig: { columns: [] } satisfies Partial<FieldConfig> },
  { value: "group", label: "字段组", icon: "组", group: "structure", nestable: true, defaultConfig: { fields: [] } satisfies Partial<FieldConfig> },
  { value: "repeatGroup", label: "可重复块", icon: "块", group: "structure", defaultConfig: { fields: [] } satisfies Partial<FieldConfig> },
  { value: "file", label: "附件上传", icon: "附", group: "upload", defaultConfig: { maxCount: 1 } satisfies Partial<FieldConfig> },
  { value: "image", label: "图片上传", icon: "图", group: "upload", defaultConfig: { maxCount: 1 } satisfies Partial<FieldConfig> },
  { value: "personPicker", label: "人员选择", icon: "人", group: "picker" },
  { value: "departmentPicker", label: "部门选择", icon: "部", group: "picker" },
  { value: "cagePicker", label: "笼位选择", icon: "笼", group: "picker" },
  { value: "animalPicker", label: "动物选择", icon: "动", group: "picker" },
  { value: "signature", label: "签名", icon: "签", group: "decor" },
  { value: "richText", label: "富文本", icon: "富", group: "decor" },
  { value: "divider", label: "分隔线", icon: "分", group: "decor" },
  { value: "description", label: "说明文字", icon: "说", group: "decor" },
];

/** 题型下拉选项（编辑器兼容用） */
export const FIELD_TYPES = TYPE_REGISTRY.map((t) => ({ value: t.value, label: t.label }));

/** type → 图标字 */
export const TYPE_ICONS: Record<FieldType, string> = Object.fromEntries(
  TYPE_REGISTRY.map((t) => [t.value, t.icon])
) as Record<FieldType, string>;

/** type → 元信息 */
export const typeMetaOf = (t: FieldType): FieldTypeMeta | undefined =>
  TYPE_REGISTRY.find((x) => x.value === t);

export const typeLabelOf = (t: FieldType): string => typeMetaOf(t)?.label ?? t;

/** 带内联选项面板的题型集合（choice/checkbox） */
export const TYPES_WITH_OPTIONS = new Set<FieldType>(
  TYPE_REGISTRY.filter((t) => t.hasOptions).map((t) => t.value)
);

/** 可嵌套子字段的题型集合（table/group） */
export const TYPES_NESTABLE = new Set<FieldType>(
  TYPE_REGISTRY.filter((t) => t.nestable).map((t) => t.value)
);
