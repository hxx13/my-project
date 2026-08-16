import { useState } from "react";
import type { FormField, FormSection, FormSubSection } from "../schema/formTemplate";
import { displayTitle, evaluateShowWhen, hasValue } from "./FormField";

/** 平铺一个 Section 的所有字段（subdivisible 时取 subsections[].fields） */
export function flattenSectionFields(section: FormSection): FormField[] {
  if (section.subdivisible && section.subsections?.length) {
    return section.subsections.flatMap((s) => s.fields ?? []);
  }
  return section.fields ?? [];
}

/** 该 Section 是否「已填完」：所有「可见的」必填字段均有值（showWhen 隐藏的字段不计入） */
export function sectionIsDone(section: FormSection, values: Record<string, unknown>): boolean {
  const fields = flattenSectionFields(section).filter((f) => evaluateShowWhen(f.showWhen, values));
  if (fields.length === 0) return true;
  const required = fields.filter((f) => f.required);
  if (required.length === 0) return fields.some((f) => hasValue(values[f.fieldKey]));
  return required.every((f) => hasValue(values[f.fieldKey]));
}

/** 该 SubSection 是否「已填完」：所有「可见的」必填字段均有值（showWhen 隐藏的字段不计入） */
export function subsectionIsDone(sub: FormSubSection, values: Record<string, unknown>): boolean {
  const fields = (sub.fields ?? []).filter((f) => evaluateShowWhen(f.showWhen, values));
  if (fields.length === 0) return true;
  const required = fields.filter((f) => f.required);
  if (required.length === 0) return fields.some((f) => hasValue(values[f.fieldKey]));
  return required.every((f) => hasValue(values[f.fieldKey]));
}

interface SectionNavProps {
  sections: FormSection[];
  values: Record<string, unknown>;
  activeId: string | null;
  onSelect: (id: string) => void;
  /** 校验错误的字段键集合（提交前预检），用于章节/小节标题红色高亮 */
  errorKeys?: Set<string>;
}

/**
 * 左侧吸顶章节导航（`.sidebar`）。
 * 仅展示当前应出现的章节与子章节：无条件章节始终显示；带 showWhen 的补充表在条件满足时才出现。
 * 每个 subdivisible 的板块下平铺其小节（A1/A2…），标记答题完整状态，点击可跳转；
 * 点击板块标题可折叠/展开其小节列表。
 */
export default function SectionNav({ sections, values, activeId, onSelect, errorKeys }: SectionNavProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const visible = sections.filter((s) => evaluateShowWhen(s.showWhen, values));
  const main = visible.filter((s) => !s.showWhen);
  const supplement = visible.filter((s) => !!s.showWhen);

  const toggle = (code: string) => {
    setCollapsed((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const hasError = (fields: FormField[]) => fields.some((f) => errorKeys?.has(f.fieldKey));

  const renderSection = (s: FormSection) => {
    const done = sectionIsDone(s, values);
    const subs = s.subdivisible
      ? (s.subsections ?? []).filter((sub) => evaluateShowWhen(sub.showWhen, values))
      : [];
    const isCollapsed = collapsed[s.code] === true;
    const secError = hasError(flattenSectionFields(s));
    return (
      <div key={s.code}>
        <div
          className={"nav-item" + (activeId === s.code ? " active" : "") + (secError ? " nav-error" : "")}
          onClick={() => {
            onSelect(s.code);
            if (subs.length > 0) toggle(s.code);
          }}
        >
          <span className={"mark " + (s.showWhen ? "cond" : done ? "done" : "todo")}>
            {s.showWhen ? "✓" : done ? "✓" : ""}
          </span>
          <span className="nav-label">{displayTitle(s.code, s.label)}</span>
          {subs.length > 0 && <span className="nav-arrow">{isCollapsed ? "▸" : "▾"}</span>}
        </div>
        {!isCollapsed &&
          subs.map((sub) => {
            const subDone = subsectionIsDone(sub, values);
            const subError = hasError(sub.fields ?? []);
            return (
              <div
                key={sub.code}
                className={"nav-item nav-sub" + (activeId === sub.code ? " active" : "") + (subError ? " nav-error" : "")}
                onClick={() => onSelect(sub.code)}
              >
                <span className={"mark " + (subDone ? "done" : "todo")}>{subDone ? "✓" : ""}</span>
                <span className="nav-label">{displayTitle(sub.code, sub.label)}</span>
              </div>
            );
          })}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="hd">章节导航</div>
      <div className="sidebar-body">
        {main.map(renderSection)}
        {supplement.length > 0 && <div className="nav-group">补充表（条件）</div>}
        {supplement.map(renderSection)}
      </div>
    </aside>
  );
}
