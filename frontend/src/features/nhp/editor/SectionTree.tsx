/**
 * 左栏板块/字段树（对齐设计 15 SectionTree）。
 * embedded=true 时不包外层 aup-toc（由编辑器壳负责滚动）。
 */
import { useState } from "react";
import type { FormSection } from "../schema/formTemplate";

interface Props {
  sections: FormSection[];
  selectedFieldKey: string | null;
  search?: string;
  /** 嵌在编辑器 toc.body 内，避免双重 aup-toc 打断 overflow */
  embedded?: boolean;
  onSelectField: (fieldKey: string) => void;
  onSelectSection: (code: string) => void;
  onAddSection: () => void;
  onRemoveSection: (code: string) => void;
  onRemoveSubsection?: (sectionCode: string, subsectionCode: string) => void;
}

export default function SectionTree({
  sections,
  selectedFieldKey,
  search = "",
  embedded = false,
  onSelectField,
  onSelectSection,
  onAddSection,
  onRemoveSection,
  onRemoveSubsection,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const q = search.trim().toLowerCase();

  const toggle = (code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const tree = (
    <>
      {sections.map((sec) => {
        const open = !collapsed.has(sec.code);
        const fields = [
          ...(sec.fields ?? []),
          ...(sec.subsections ?? []).flatMap((u) => u.fields),
        ].filter((f) => !q || f.label.toLowerCase().includes(q) || f.fieldKey.toLowerCase().includes(q));
        if (q && fields.length === 0 && !sec.label.toLowerCase().includes(q) && !sec.code.toLowerCase().includes(q)) {
          return null;
        }
        return (
          <div key={sec.code}>
            <div className="aup-toc-item" onClick={() => { toggle(sec.code); onSelectSection(sec.code); }}>
              <span className="aup-code-badge">{sec.code}</span>
              <span className="lbl">{sec.label || "未命名板块"}</span>
              <button
                type="button"
                className="aup-iconbtn danger"
                title="删除板块"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSection(sec.code);
                }}
              >
                ×
              </button>
            </div>
            {open &&
              (sec.subsections ?? []).map((sub) => (
                <div key={sub.code}>
                  <div className="aup-toc-item sub">
                    <span className="aup-code-badge">{sub.code}</span>
                    <span className="lbl">{sub.label || sub.code}</span>
                    {onRemoveSubsection ? (
                      <button
                        type="button"
                        className="aup-iconbtn danger"
                        title="删除子模块"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveSubsection(sec.code, sub.code);
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  {sub.fields
                    .filter((f) => !q || f.label.toLowerCase().includes(q) || f.fieldKey.toLowerCase().includes(q))
                    .map((f) => (
                      <div
                        key={f.fieldKey}
                        className="aup-toc-item sub"
                        style={{
                          paddingLeft: 40,
                          background: selectedFieldKey === f.fieldKey ? "var(--pw)" : undefined,
                          color: selectedFieldKey === f.fieldKey ? "var(--p)" : undefined,
                        }}
                        onClick={() => onSelectField(f.fieldKey)}
                      >
                        <span className="lbl">{f.label || f.fieldKey}</span>
                        {f.showWhen ? <span className="cond-tag">条件</span> : null}
                      </div>
                    ))}
                </div>
              ))}
            {open &&
              (sec.fields ?? [])
                .filter((f) => !q || f.label.toLowerCase().includes(q) || f.fieldKey.toLowerCase().includes(q))
                .map((f) => (
                  <div
                    key={f.fieldKey}
                    className="aup-toc-item sub"
                    style={{
                      background: selectedFieldKey === f.fieldKey ? "var(--pw)" : undefined,
                      color: selectedFieldKey === f.fieldKey ? "var(--p)" : undefined,
                    }}
                    onClick={() => onSelectField(f.fieldKey)}
                  >
                    <span className="lbl">{f.label || f.fieldKey}</span>
                    {f.showWhen ? <span className="cond-tag">条件</span> : null}
                  </div>
                ))}
          </div>
        );
      })}
      <div className="aup-toc-foot" style={embedded ? { borderTop: "none", padding: "8px 4px 4px" } : undefined}>
        <button type="button" className="aup-btn ghost" onClick={onAddSection}>
          ＋ 新增数据域
        </button>
      </div>
    </>
  );

  if (embedded) return <div className="nhp-section-tree-embedded">{tree}</div>;

  return (
    <aside className="aup-toc">
      <div className="hd">
        <span>CRF 目录</span>
      </div>
      <div className="body">{tree}</div>
    </aside>
  );
}
