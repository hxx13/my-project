import type { FormSection } from "../schema/formTemplate";

/**
 * 模板/原子域结构预览：大段 → 小章节 → 字段 三级紧凑树。
 * 用于发布管理列表展开、组合域创建器右侧预览，避免各处重复渲染。
 */
export default function TemplateStructurePreview({ sections }: { sections: FormSection[] }) {
  if (!sections || sections.length === 0) {
    return <span style={{ color: "var(--muted)", fontSize: 12 }}>该版本暂无结构</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sections.map((s) => {
        const subs = s.subdivisible ? (s.subsections ?? []) : null;
        const directFields = s.subdivisible ? [] : (s.fields ?? []);
        return (
          <div key={s.code} style={{ borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>{s.code}</span>
              <span style={{ fontWeight: 600 }}>{s.label}</span>
              <span style={{ color: "var(--muted)", fontSize: 11 }}>
                {subs ? `${subs.length} 小节` : `${directFields.length} 字段`}
              </span>
            </div>
            {subs &&
              subs.map((sub) => (
                <div key={sub.code} style={{ marginLeft: 12, marginTop: 4 }}>
                  <span className="aup-wb-chip muted" style={{ fontFamily: "ui-monospace, monospace" }}>{sub.code}</span>{" "}
                  <span>{sub.label}</span>
                  <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 6 }}>
                    {sub.fields?.length ?? 0} 字段
                  </span>
                </div>
              ))}
            {!subs && directFields.length > 0 && (
              <div style={{ marginLeft: 12, marginTop: 4, color: "var(--muted)" }}>
                {directFields.map((f) => (
                  <span key={f.fieldKey} style={{ display: "inline-block", marginRight: 10 }}>
                    {f.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
