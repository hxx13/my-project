/**
 * NHP 表单模板纯函数操作（无 UI、无副作用、可单测）。
 *
 * 所有函数接收不可变 state（FormSection[]），返回新的 state。
 * 与 zustand store 解耦，便于单元测试。
 */
import type { FormField, FormSection } from "../schema/formTemplate";

/** 在指定 section 的 subsection 里追加字段（subsectionCode 为空则追加到 section.fields） */
export function addField(
  sections: FormSection[],
  sectionCode: string,
  subsectionCode: string | null,
  field: FormField,
): FormSection[] {
  return sections.map((s) => {
    if (s.code !== sectionCode) return s;
    if (subsectionCode && s.subsections) {
      return {
        ...s,
        subsections: s.subsections.map((sub) =>
          sub.code === subsectionCode ? { ...sub, fields: [...sub.fields, field] } : sub,
        ),
      };
    }
    return { ...s, fields: [...(s.fields ?? []), field] };
  });
}

/** 按 fieldKey 更新字段（合并 patch） */
export function updateField(
  sections: FormSection[],
  fieldKey: string,
  patch: Partial<FormField>,
): FormSection[] {
  const patchField = (f: FormField): FormField =>
    f.fieldKey === fieldKey ? { ...f, ...patch } : f;
  return sections.map((s) => ({
    ...s,
    subsections: s.subsections?.map((sub) => ({
      ...sub,
      fields: sub.fields.map(patchField),
    })),
    fields: s.fields?.map(patchField),
  }));
}

/** 按 fieldKey 删除字段 */
export function removeField(sections: FormSection[], fieldKey: string): FormSection[] {
  const filterField = (fields: FormField[]) => fields.filter((f) => f.fieldKey !== fieldKey);
  return sections.map((s) => ({
    ...s,
    subsections: s.subsections?.map((sub) => ({ ...sub, fields: filterField(sub.fields) })),
    fields: s.fields ? filterField(s.fields) : s.fields,
  }));
}

/** 新增一个数据域 Section */
export function addSection(sections: FormSection[], code: string, label: string): FormSection[] {
  return [...sections, { code, label, subdivisible: true, subsections: [] }];
}

/** 删除一个数据域 Section */
export function removeSection(sections: FormSection[], code: string): FormSection[] {
  return sections.filter((s) => s.code !== code);
}

/** 在指定 section/subsection 追加复合模板展开的字段 */
export function insertTemplate(
  sections: FormSection[],
  sectionCode: string,
  subsectionCode: string | null,
  fields: FormField[],
): FormSection[] {
  return sections.map((s) => {
    if (s.code !== sectionCode) return s;
    if (subsectionCode && s.subsections) {
      return {
        ...s,
        subsections: s.subsections.map((sub) =>
          sub.code === subsectionCode ? { ...sub, fields: [...sub.fields, ...fields] } : sub,
        ),
      };
    }
    return { ...s, fields: [...(s.fields ?? []), ...fields] };
  });
}

/** 新增子模块 */
export function addSubsection(
  sections: FormSection[],
  sectionCode: string,
  code: string,
  label: string,
): FormSection[] {
  return sections.map((s) => {
    if (s.code !== sectionCode) return s;
    return {
      ...s,
      subdivisible: true,
      subsections: [...(s.subsections ?? []), { code, label, fields: [] }],
    };
  });
}

/** 删除子模块（连同其下字段一并移除） */
export function removeSubsection(
  sections: FormSection[],
  sectionCode: string,
  subsectionCode: string,
): FormSection[] {
  return sections.map((s) => {
    if (s.code !== sectionCode) return s;
    return {
      ...s,
      subsections: (s.subsections ?? []).filter((sub) => sub.code !== subsectionCode),
    };
  });
}

/** 更新板块元数据 */
export function updateSection(
  sections: FormSection[],
  sectionCode: string,
  patch: Partial<FormSection>,
): FormSection[] {
  return sections.map((s) => (s.code === sectionCode ? { ...s, ...patch } : s));
}

/** 在同级列表内移动字段 */
export function moveField(
  sections: FormSection[],
  fieldKey: string,
  dir: -1 | 1,
): FormSection[] {
  const moveIn = (fields: FormField[]) => {
    const i = fields.findIndex((f) => f.fieldKey === fieldKey);
    if (i < 0) return fields;
    const j = i + dir;
    if (j < 0 || j >= fields.length) return fields;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  return sections.map((s) => ({
    ...s,
    subsections: s.subsections?.map((sub) => ({ ...sub, fields: moveIn(sub.fields) })),
    fields: s.fields ? moveIn(s.fields) : s.fields,
  }));
}
