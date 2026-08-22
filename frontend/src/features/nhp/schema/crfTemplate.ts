/**
 * 字段字典（05 crf_field）→ 表单模板（FormTemplate）的对接与自动生成。
 *
 * 实现 12 文档的「连锁关系自动生成」：
 * - 码表引用 → dictKey（自动挂码表选项）
 * - 外键 → cascade / select（自动关联）
 * - 条件必填 → showWhen（自动条件连锁）
 * - dataType → 默认题型（仅建议，编辑器可改）
 *
 * 纯函数，无 UI、无状态、可单测。
 */
import type { FormField, FormSection, FormSubSection, FormTemplate, FieldType } from "./formTemplate";

/** 字段字典的字段（对接 05 crf_field，前端解释类型） */
export interface CrfFieldDict {
  /** 字段编码，如 "D1.01.001" */
  fieldCode: string;
  /** 字段英文名（DB 列名，CDISC CDASH 对齐），如 "donor_id" */
  nameEn: string;
  /** 字段中文名 */
  nameCn: string;
  /** 数据类型（字符/文本/数值/日期/日期时间/时间/枚举/枚举多选/枚举+数值） */
  dataType: string;
  /** 单位/格式 */
  unit?: string;
  /** 必填：是/否/条件 */
  required?: string;
  /** 码表编码（已去掉「码表」前缀），如 "FARM" */
  codelistCode?: string;
  /** 采集时点，如 "入档" / "TP01" */
  timepoint?: string;
  /** 采集方 */
  source?: string;
  /** 说明 */
  description?: string;
  /** 是否外键 */
  isForeignKey?: boolean;
  /** 条件必填的触发描述（required=条件 时） */
  conditionalDesc?: string;
}

/** 字段字典的子模块（D1.01） */
export interface CrfSubsectionDict {
  code: string;
  label: string;
  fields: CrfFieldDict[];
}

/** 字段字典的数据域（D1） */
export interface CrfDomainDict {
  code: string;
  label: string;
  subsections: CrfSubsectionDict[];
}

/** dataType（字典层存储类型，英文，与 crf_field.data_type 一致）→ 默认题型；与 typeRegistry 的 DATA_TYPE_COMPATIBLE_TYPES 对齐 */
export const DATATYPE_TO_TYPE: Record<string, FieldType> = {
  STRING: "text",
  TEXT: "textarea",
  INTEGER: "number",
  DECIMAL: "number",
  DATE: "date",
  DATETIME: "date",
  ENUM: "select",
  ENUM_MULTI: "checkbox",
  BOOLEAN: "checkbox",
  FILE: "file",
  CALC: "text",
};

/** 从字段字典生成表单模板（连锁关系自动打好） */
export function buildFormTemplateFromDict(
  formKey: string,
  title: string,
  domains: CrfDomainDict[],
): FormTemplate {
  const sections: FormSection[] = domains.map((domain) => ({
    code: domain.code,
    label: domain.label,
    subdivisible: true,
    subsections: domain.subsections.map(
      (sub): FormSubSection => ({
        code: sub.code,
        label: sub.label,
        fields: sub.fields.map(dictFieldToFormField),
      }),
    ),
  }));
  return { formKey, title, sections };
}

/** 单个字段字典字段 → 表单模板字段（连锁关系自动带出） */
export function dictFieldToFormField(f: CrfFieldDict): FormField {
  const dataType = (f.dataType || "").toUpperCase();
  const field: FormField = {
    fieldKey: fieldKeyOf(f),
    label: f.nameCn,
    type: DATATYPE_TO_TYPE[dataType] ?? "text",
    required: f.required === "是",
    description: f.description,
    dataType,
  };

  // 连锁 1：码表引用 → dictKey（自动挂码表选项）
  if (f.codelistCode) {
    field.dictKey = f.codelistCode;
  }
  // 连锁 2：外键 → cascade（自动关联）
  else if (f.isForeignKey) {
    field.type = "cascade";
  }
  // 连锁 3：条件必填 → showWhen（占位，具体条件由编辑器补全）
  if (f.required === "条件") {
    field.showWhen = { field: "", op: "notEmpty" };
    field.description = `${f.description ?? ""}${f.conditionalDesc ? `（${f.conditionalDesc}）` : ""}`.trim();
  }
  // 单位 → config.unit
  if (f.unit && f.unit !== "—") {
    field.config = { ...(field.config ?? {}), unit: f.unit };
  }
  return field;
}

/** 字段键：用字段编码（D1.01.001）作稳定键 */
export function fieldKeyOf(f: CrfFieldDict): string {
  return f.fieldCode;
}
