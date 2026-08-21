/**
 * NHP 表单模板编辑器状态（zustand）。
 *
 * 编辑器唯一状态入口：持有 FormTemplate 的 sections 树 + 当前选中节点，
 * 通过纯函数（templateReducer）做不可变更新。
 */
import { create } from "zustand";
import type { FormField, FormSection } from "../schema/formTemplate";
import * as R from "./templateReducer";

interface TemplateEditorState {
  /** 表单模板的 sections 树（唯一状态源） */
  sections: FormSection[];
  /** 当前选中的字段 key（编辑器右侧面板） */
  selectedFieldKey: string | null;
  /** 当前选中的 section code */
  selectedSectionCode: string | null;

  load: (sections: FormSection[]) => void;
  selectField: (fieldKey: string | null) => void;
  selectSection: (sectionCode: string | null) => void;

  addSection: (code: string, label: string) => void;
  removeSection: (code: string) => void;
  updateSection: (sectionCode: string, patch: Partial<FormSection>) => void;
  addSubsection: (sectionCode: string, code: string, label: string) => void;
  removeSubsection: (sectionCode: string, subsectionCode: string) => void;
  addField: (sectionCode: string, subsectionCode: string | null, field: FormField) => void;
  updateField: (fieldKey: string, patch: Partial<FormField>) => void;
  removeField: (fieldKey: string) => void;
  moveField: (fieldKey: string, dir: -1 | 1) => void;
  insertTemplate: (
    sectionCode: string,
    subsectionCode: string | null,
    fields: FormField[],
  ) => void;
}

export const useTemplateEditor = create<TemplateEditorState>((set) => ({
  sections: [],
  selectedFieldKey: null,
  selectedSectionCode: null,

  load: (sections) => set({ sections, selectedFieldKey: null, selectedSectionCode: null }),
  selectField: (selectedFieldKey) => set({ selectedFieldKey }),
  selectSection: (selectedSectionCode) => set({ selectedSectionCode }),

  addSection: (code, label) =>
    set((s) => ({ sections: R.addSection(s.sections, code, label) })),
  removeSection: (code) =>
    set((s) => ({ sections: R.removeSection(s.sections, code), selectedSectionCode: null })),
  updateSection: (sectionCode, patch) =>
    set((s) => ({ sections: R.updateSection(s.sections, sectionCode, patch) })),
  addSubsection: (sectionCode, code, label) =>
    set((s) => ({ sections: R.addSubsection(s.sections, sectionCode, code, label) })),
  removeSubsection: (sectionCode, subsectionCode) =>
    set((s) => {
      const sec = s.sections.find((x) => x.code === sectionCode);
      const sub = sec?.subsections?.find((u) => u.code === subsectionCode);
      const removedKeys = new Set((sub?.fields ?? []).map((f) => f.fieldKey));
      const selectedFieldKey =
        s.selectedFieldKey && removedKeys.has(s.selectedFieldKey) ? null : s.selectedFieldKey;
      return {
        sections: R.removeSubsection(s.sections, sectionCode, subsectionCode),
        selectedFieldKey,
      };
    }),
  addField: (sectionCode, subsectionCode, field) =>
    set((s) => ({ sections: R.addField(s.sections, sectionCode, subsectionCode, field) })),
  updateField: (fieldKey, patch) =>
    set((s) => ({ sections: R.updateField(s.sections, fieldKey, patch) })),
  removeField: (fieldKey) =>
    set((s) => ({ sections: R.removeField(s.sections, fieldKey), selectedFieldKey: null })),
  moveField: (fieldKey, dir) =>
    set((s) => ({ sections: R.moveField(s.sections, fieldKey, dir) })),
  insertTemplate: (sectionCode, subsectionCode, fields) =>
    set((s) => ({ sections: R.insertTemplate(s.sections, sectionCode, subsectionCode, fields) })),
}));
