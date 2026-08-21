/**
 * NHP 填写页左侧章节导航（对齐 AUP SectionNav）：
 * 文件夹折叠；灰默认 / 绿 ✓ 完成 / 红 ✗ 仅提交校验失败；中文名 + monospace 编码。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FormField, FormSection, FormSubSection } from "../schema/formTemplate";
import { collectSectionFields, hasFieldValue, sectionDone, sectionTouchedOrComplete } from "./NhpStageStepper";
import { formatSectionTitle, resolveSectionZhName } from "../utils/nhpSectionTitle";

/** 子模块 TOC：有必填看必填；否则有值才算填过 */
export function subsectionDone(sub: FormSubSection, values: Record<string, unknown>): boolean {
  const fields = sub.fields ?? [];
  if (!fields.length) return true;
  const required = fields.filter((f) => f.required);
  if (required.length) return required.every((f) => hasFieldValue(values[f.fieldKey]));
  return fields.some((f) => hasFieldValue(values[f.fieldKey]));
}

function subsectionGateOk(sub: FormSubSection, values: Record<string, unknown>): boolean {
  const fields = sub.fields ?? [];
  const required = fields.filter((f) => f.required);
  if (!required.length) return true;
  return required.every((f) => hasFieldValue(values[f.fieldKey]));
}

function NavLabel({ code, label, nameMap }: { code: string; label?: string; nameMap?: Record<string, string> | null }) {
  const zh = resolveSectionZhName(code, label, nameMap);
  return (
    <span className="nav-label" title={formatSectionTitle(code, label, nameMap)}>
      {zh ? <span className="nav-zh">{zh}</span> : null}
      {zh ? " " : null}
      <code className="nav-code">{code}</code>
    </span>
  );
}

interface NhpSectionNavProps {
  sections: FormSection[];
  values: Record<string, unknown>;
  activeId: string | null;
  onSelect: (id: string) => void;
  /** 可选：域/子模块编码 → 中文名（字段字典 structure） */
  nameMap?: Record<string, string> | null;
  /** 提交前预检失败的字段键（可选，与 submitAttempted 叠加） */
  errorKeys?: Set<string>;
  /** 用户已点击「提交」且仍有未完整章节时，未完成节点显示红 ✗ */
  submitAttempted?: boolean;
}

export default function NhpSectionNav({
  sections,
  values,
  activeId,
  onSelect,
  nameMap,
  errorKeys,
  submitAttempted = false,
}: NhpSectionNavProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const bodyRef = useRef<HTMLDivElement>(null);

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

  const toggle = (code: string) => {
    setCollapsed((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const hasError = (fields: FormField[]) => fields.some((f) => errorKeys?.has(f.fieldKey));

  /** 对齐 AUP：完成绿 ✓；未完成默认灰；仅校验失败时红 ✗ */
  const markNode = (done: boolean, fail: boolean): ReactNode => {
    if (done) {
      return <span className="mark done">✓</span>;
    }
    if (fail) {
      return <span className="mark bad">✗</span>;
    }
    return <span className="mark todo" />;
  };

  return (
    <aside className="sidebar">
      <div className="hd">数据域章节</div>
      <div className="sidebar-body" ref={bodyRef}>
        {sections.map((sec) => {
          const done = sectionTouchedOrComplete(sec, values);
          const gateOk = sectionDone(sec, values);
          const subs = sec.subsections ?? [];
          const isCollapsed = collapsed[sec.code] === true;
          const secFail = (!gateOk && submitAttempted) || hasError(collectSectionFields(sec));
          const active =
            activeId === sec.code || subs.some((u) => u.code === activeId);
          return (
            <div key={sec.code}>
              <div
                className={"nav-item" + (active ? " active" : "") + (secFail ? " nav-error" : "")}
                data-navid={sec.code}
                onClick={() => {
                  onSelect(sec.code);
                  if (subs.length > 0) toggle(sec.code);
                }}
              >
                {markNode(done, secFail)}
                <NavLabel code={sec.code} label={sec.label} nameMap={nameMap} />
                {subs.length > 0 && (
                  <span className="nav-arrow">{isCollapsed ? "▸" : "▾"}</span>
                )}
              </div>
              {!isCollapsed &&
                subs.map((sub) => {
                  const subDone = subsectionDone(sub, values);
                  const subFail = (!subsectionGateOk(sub, values) && submitAttempted) || hasError(sub.fields ?? []);
                  return (
                    <div
                      key={sub.code}
                      className={
                        "nav-item nav-sub" +
                        (activeId === sub.code ? " active" : "") +
                        (subFail ? " nav-error" : "")
                      }
                      data-navid={sub.code}
                      onClick={() => onSelect(sub.code)}
                    >
                      {markNode(subDone, subFail)}
                      <NavLabel code={sub.code} label={sub.label} nameMap={nameMap} />
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
