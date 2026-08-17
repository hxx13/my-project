import { useEffect, useRef, useState } from "react";
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
  /** 有负面评审意见（建议修改/不合规）的字段键集合，章节/小节对勾变红叉 */
  negativeKeys?: Set<string>;
}

/**
 * 左侧吸顶章节导航（`.sidebar`）。
 * 仅展示当前应出现的章节与子章节：无条件章节始终显示；带 showWhen 的补充表在条件满足时才出现。
 * 每个 subdivisible 的板块下平铺其小节（A1/A2…），标记答题完整状态，点击可跳转；
 * 点击板块标题可折叠/展开其小节列表。
 */
export default function SectionNav({ sections, values, activeId, onSelect, errorKeys, negativeKeys }: SectionNavProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  // 自动跟随：主内容滚动切换当前章节时，把侧栏内对应高亮项滚进可视区。
  // 只调整 sidebar-body 的 scrollTop（不调用 scrollIntoView，避免连带动到整页滚动）。
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !activeId) return;
    const item = body.querySelector<HTMLElement>(`.nav-item[data-navid="${activeId}"]`);
    if (!item) return;
    const bodyRect = body.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const pad = 8;
    if (itemRect.top < bodyRect.top + pad) {
      body.scrollTop -= bodyRect.top + pad - itemRect.top;
    } else if (itemRect.bottom > bodyRect.bottom - pad) {
      body.scrollTop += itemRect.bottom - (bodyRect.bottom - pad);
    }
  }, [activeId, sections]);

  const visible = sections.filter((s) => evaluateShowWhen(s.showWhen, values));
  const main = visible.filter((s) => !s.showWhen);
  const supplement = visible.filter((s) => !!s.showWhen);

  const toggle = (code: string) => {
    setCollapsed((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const hasError = (fields: FormField[]) => fields.some((f) => errorKeys?.has(f.fieldKey));
  const hasNegative = (fields: FormField[]) => fields.some((f) => negativeKeys?.has(f.fieldKey));

  const renderSection = (s: FormSection) => {
    const done = sectionIsDone(s, values);
    const subs = s.subdivisible
      ? (s.subsections ?? []).filter((sub) => evaluateShowWhen(sub.showWhen, values))
      : [];
    const isCollapsed = collapsed[s.code] === true;
    const secNegative = hasNegative(flattenSectionFields(s));
    const secError = hasError(flattenSectionFields(s)) || secNegative;
    return (
      <div key={s.code}>
        <div
          className={"nav-item" + (activeId === s.code ? " active" : "") + (secError ? " nav-error" : "")}
          data-navid={s.code}
          onClick={() => {
            onSelect(s.code);
            if (subs.length > 0) toggle(s.code);
          }}
        >
          <span className={"mark " + (secNegative ? "bad" : s.showWhen ? "cond" : done ? "done" : "todo")}>
            {secNegative ? "✗" : s.showWhen ? "✓" : done ? "✓" : ""}
          </span>
          <span className="nav-label">{displayTitle(s.code, s.label)}</span>
          {subs.length > 0 && <span className="nav-arrow">{isCollapsed ? "▸" : "▾"}</span>}
        </div>
        {!isCollapsed &&
          subs.map((sub) => {
            const subDone = subsectionIsDone(sub, values);
            const subNegative = hasNegative(sub.fields ?? []);
            const subError = hasError(sub.fields ?? []) || subNegative;
            return (
              <div
                key={sub.code}
                className={"nav-item nav-sub" + (activeId === sub.code ? " active" : "") + (subError ? " nav-error" : "")}
                data-navid={sub.code}
                onClick={() => onSelect(sub.code)}
              >
                <span className={"mark " + (subNegative ? "bad" : subDone ? "done" : "todo")}>
                  {subNegative ? "✗" : subDone ? "✓" : ""}
                </span>
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
      <div className="sidebar-body" ref={bodyRef}>
        {main.map(renderSection)}
        {supplement.length > 0 && <div className="nav-group">补充表（条件）</div>}
        {supplement.map(renderSection)}
      </div>
    </aside>
  );
}
