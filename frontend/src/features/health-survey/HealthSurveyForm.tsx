import { HEALTH_SURVEY, SURVEY_DECLARATION, SURVEY_FOOTER, SURVEY_TITLE, type SurveyField } from "./schema";
import "./health-survey.css";

export type SurveyValue = Record<string, unknown>;

type YesNo = { answer: "是" | "否"; detail?: string };

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}
function asYesNo(v: unknown): YesNo {
  return v && typeof v === "object" ? (v as YesNo) : { answer: "否" };
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asGrid(v: unknown): Record<string, string[]> {
  return v && typeof v === "object" ? (v as Record<string, string[]>) : {};
}
function asList(v: unknown): Record<string, string>[] {
  return Array.isArray(v) ? (v as Record<string, string>[]) : [];
}

/**
 * 健康调查表渲染器：填写态 / 只读态共用。
 * 页眉（两个 logo）与页脚（保密水印）固定，打印时每页重复。
 */
export function HealthSurveyForm({
  value,
  onChange,
  readOnly = false,
}: {
  value: SurveyValue;
  onChange?: (next: SurveyValue) => void;
  readOnly?: boolean;
}) {
  const set = (key: string, v: unknown) => {
    if (readOnly || !onChange) return;
    onChange({ ...value, [key]: v });
  };

  const renderField = (f: SurveyField) => {
    switch (f.kind) {
      case "checkboxes": {
        const cur = asArray(value[f.key]);
        return (
          <div className="hs-field">
            <div className="hs-label">{f.label}</div>
            <div className="hs-options">
              {f.options.map((o) => (
                <label key={o} className="hs-opt">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={cur.includes(o)}
                    onChange={() => set(f.key, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])}
                  />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          </div>
        );
      }
      case "radios": {
        const cur = asString(value[f.key]);
        return (
          <div className="hs-field">
            <div className="hs-label">{f.label}</div>
            <div className="hs-options">
              {f.options.map((o) => (
                <label key={o} className="hs-opt">
                  <input type="radio" disabled={readOnly} checked={cur === o} onChange={() => set(f.key, o)} />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          </div>
        );
      }
      case "yesno": {
        const cur = asYesNo(value[f.key]);
        return (
          <div className="hs-field">
            <div className="hs-label">{f.label}</div>
            <div className="hs-options">
              {(["是", "否"] as const).map((o) => (
                <label key={o} className="hs-opt">
                  <input
                    type="radio"
                    disabled={readOnly}
                    checked={cur.answer === o}
                    onChange={() => set(f.key, { ...cur, answer: o })}
                  />
                  <span>{o}</span>
                </label>
              ))}
              {f.detail && cur.answer === "是" && (
                <input
                  className="hs-inline-input"
                  disabled={readOnly}
                  value={cur.detail ?? ""}
                  placeholder={f.detail}
                  onChange={(e) => set(f.key, { ...cur, detail: e.target.value })}
                />
              )}
            </div>
          </div>
        );
      }
      case "text":
        return (
          <div className="hs-field hs-field-inline">
            <div className="hs-label">{f.label}</div>
            <input
              className="hs-input"
              disabled={readOnly}
              value={asString(value[f.key])}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        );
      case "textarea":
        return (
          <div className="hs-field">
            <div className="hs-label">{f.label}</div>
            <textarea
              className="hs-textarea"
              rows={3}
              disabled={readOnly}
              value={asString(value[f.key])}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        );
      case "grid": {
        const g = asGrid(value[f.key]);
        return (
          <div className="hs-field">
            <div className="hs-label">{f.label}</div>
            <table className="hs-grid">
              <thead>
                <tr>
                  <th>{f.rowHeader}</th>
                  {f.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.rows.map((r) => {
                  const picked = g[r] ?? [];
                  return (
                    <tr key={r}>
                      <td>{r}</td>
                      {f.columns.map((c) => (
                        <td key={c} className="hs-grid-cell">
                          <input
                            type="checkbox"
                            disabled={readOnly}
                            checked={picked.includes(c)}
                            onChange={() => {
                              const next = picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c];
                              set(f.key, { ...g, [r]: next });
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }
      case "list": {
        const rows = asList(value[f.key]);
        return (
          <div className="hs-field">
            <div className="hs-label">{f.label}</div>
            <table className="hs-grid">
              <thead>
                <tr>
                  {f.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                  {!readOnly && <th className="hs-grid-cell">操作</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {f.columns.map((c) => (
                      <td key={c}>
                        <input
                          className="hs-cell-input"
                          disabled={readOnly}
                          value={row[c] ?? ""}
                          onChange={(e) => {
                            const next = rows.map((r, j) => (j === i ? { ...r, [c]: e.target.value } : r));
                            set(f.key, next);
                          }}
                        />
                      </td>
                    ))}
                    {!readOnly && (
                      <td className="hs-grid-cell">
                        <button type="button" onClick={() => set(f.key, rows.filter((_, j) => j !== i))}>
                          删除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!readOnly && (
              <button
                type="button"
                className="hs-add-row"
                onClick={() => set(f.key, [...rows, Object.fromEntries(f.columns.map((c) => [c, ""]))])}
              >
                新增行
              </button>
            )}
          </div>
        );
      }
    }
  };

  return (
    <div className="hs-doc">
      <header className="hs-header">
        <img src="/brand/logo-shsmu.png" alt="上海交通大学医学院实验动物科学部" className="hs-logo-shsmu" />
        <img src="/brand/logo-aaalac.png" alt="AAALAC International" className="hs-logo-aaalac" />
      </header>

      <div className="hs-title">
        <div className="hs-title-org">{SURVEY_TITLE.org}</div>
        <div className="hs-title-name">{SURVEY_TITLE.name}</div>
      </div>

      <main className="hs-body">
        {HEALTH_SURVEY.map((sec) => (
          <section key={sec.title} className="hs-section">
            <h3 className="hs-section-title">{sec.title}</h3>
            {sec.fields.map((f) => (
              <div key={f.key}>{renderField(f)}</div>
            ))}
          </section>
        ))}
        <div className="hs-declaration">{SURVEY_DECLARATION}</div>
      </main>

      <footer className="hs-footer">{SURVEY_FOOTER}</footer>
    </div>
  );
}
