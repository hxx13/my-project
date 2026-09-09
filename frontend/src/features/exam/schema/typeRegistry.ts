/**
 * Exam 题型注册表（单一事实来源）。
 *
 * 统一维护全部题目题型的元信息：枚举值、中文名、图标字、分组、能力标记、默认 config。
 *
 * 新增题型 = 在此加一行 + formTemplate.ts 的 FieldType 联合类型 + 渲染 case。
 */
import type { FieldConfig, FieldType } from "./formTemplate";

/** 题型分组（菜单分区） */
export type FieldTypeGroup = "input" | "choice" | "upload";

export interface FieldTypeMeta {
  value: FieldType;
  label: string;
  icon: string;
  group: FieldTypeGroup;
  /** choice/checkbox：选项来源面板（内联选项） */
  hasOptions?: boolean;
  defaultConfig?: Partial<FieldConfig>;
}

export const FIELD_TYPE_GROUP_LABELS: Record<FieldTypeGroup, string> = {
  input: "基础输入",
  choice: "选择类",
  upload: "上传类",
};

export const TYPE_REGISTRY: FieldTypeMeta[] = [
  { value: "text", label: "输入框", icon: "文", group: "input" },
  { value: "textarea", label: "多行输入框", icon: "多", group: "input" },
  { value: "number", label: "数字输入框", icon: "数", group: "input" },
  {
    value: "choice",
    label: "选择题",
    icon: "选",
    group: "choice",
    hasOptions: true,
    defaultConfig: { choiceType: "single" },
  },
  { value: "checkbox", label: "是否勾选", icon: "勾", group: "choice", hasOptions: true },
  { value: "file", label: "附件上传", icon: "附", group: "upload", defaultConfig: { maxCount: 1 } },
  { value: "image", label: "图片上传", icon: "图", group: "upload", defaultConfig: { maxCount: 1 } },
  { value: "richText", label: "富文本", icon: "富", group: "input" },
];

/** 题型下拉选项（编辑器兼容用） */
export const FIELD_TYPES = TYPE_REGISTRY.map((t) => ({ value: t.value, label: t.label }));

/** type → 元信息 */
export const typeMetaOf = (t: FieldType): FieldTypeMeta | undefined =>
  TYPE_REGISTRY.find((x) => x.value === t);

export const typeLabelOf = (t: FieldType): string => typeMetaOf(t)?.label ?? t;

/** 带内联选项面板的题型集合（choice/checkbox） */
export const TYPES_WITH_OPTIONS = new Set<FieldType>(
  TYPE_REGISTRY.filter((t) => t.hasOptions).map((t) => t.value)
);
