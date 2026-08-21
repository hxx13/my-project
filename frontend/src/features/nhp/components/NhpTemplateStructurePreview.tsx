/**
 * 模板结构预览：章节 → 子模块 → 题目（含题型），供列表右栏 / 组合器右栏复用。
 */
import type { FormSection, FormSubSection, FormField } from "../schema/formTemplate";
import type { NhpFormTemplate } from "../api/nhpTemplate.api";
import { typeMetaOf } from "../schema/typeRegistry";

function countFields(sections: FormSection[] | undefined): number {
  if (!sections?.length) return 0;
  let n = 0;
  for (const s of sections) {
    n += s.fields?.length ?? 0;
    for (const u of s.subsections ?? []) n += u.fields?.length ?? 0;
  }
  return n;
}

function FieldLine({ field }: { field: FormField }) {
  const meta = typeMetaOf(field.type);
  return (
    <li className="nhp-struct-field">
      <span className="key">{field.fieldKey}</span>
      <span className="lbl">{field.label || field.fieldKey}</span>
      <span className="type">{meta?.label || field.type}</span>
      {field.required ? <span className="req">必填</span> : null}
    </li>
  );
}

function SubBlock({ sub }: { sub: FormSubSection }) {
  const fields = sub.fields ?? [];
  return (
    <li className="nhp-struct-sub">
      <div className="nhp-struct-sub-hd">
        <b>
          {sub.code} {sub.label}
        </b>
        <span className="muted"> · {fields.length} 题</span>
      </div>
      {fields.length > 0 ? (
        <ul className="nhp-struct-fields">
          {fields.map((f: FormField) => (
            <FieldLine key={f.fieldKey} field={f} />
          ))}
        </ul>
      ) : (
        <div className="muted nhp-struct-empty-hint">该子模块暂无题目</div>
      )}
    </li>
  );
}

export default function NhpTemplateStructurePreview({
  template,
  emptyHint = "暂无结构",
}: {
  template: NhpFormTemplate | undefined | null;
  emptyHint?: string;
}) {
  const sections = template?.sections ?? [];
  if (!template) {
    return <div className="aup-empty small">{emptyHint}</div>;
  }
  if (!sections.length) {
    return (
      <div className="aup-empty small">
        该版本尚无章节/题目。原子可从字段字典生成；组合请先钉住数据域原子。
      </div>
    );
  }

  const kind = template.kind === "ATOM" ? "数据域原子" : "组合快照";
  const atomHint =
    template.kind === "COMPOSITE" && (template.atoms?.length ?? 0) > 0
      ? ` · 钉住 ${(template.atoms ?? []).map((a) => `${a.atomCode}@v${a.atomVersion ?? "?"}`).join("、")}`
      : "";

  return (
    <div className="nhp-struct-preview">
      <div className="nhp-struct-summary">
        <b>{template.title || template.formKey}</b>
        <span className="muted">
          {" "}
          · {kind}
          {template.version != null ? ` · v${template.version}` : ""}
          {" · "}
          {countFields(sections)} 题 · {sections.length} 个章节
          {atomHint}
        </span>
      </div>
      <ul className="nhp-composer-sec-list nhp-struct-sec-list">
        {sections.map((sec) => (
          <li key={sec.code} className="nhp-struct-sec">
            <div className="nhp-struct-sec-hd">
              <b>
                {sec.code} {sec.label}
              </b>
              <span className="muted">
                {" "}
                · {(sec.subsections ?? []).length} 子模块
                {(sec.fields?.length ?? 0) > 0 ? ` · 直属 ${sec.fields!.length} 题` : ""}
              </span>
            </div>
            <ul>
              {(sec.subsections ?? []).map((sub) => (
                <SubBlock key={sub.code} sub={sub} />
              ))}
              {(sec.fields ?? []).length > 0 && (
                <li className="nhp-struct-sub">
                  <div className="nhp-struct-sub-hd">
                    <b>直属题目</b>
                    <span className="muted"> · {sec.fields!.length} 题</span>
                  </div>
                  <ul className="nhp-struct-fields">
                    {sec.fields!.map((f) => (
                      <FieldLine key={f.fieldKey} field={f} />
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
