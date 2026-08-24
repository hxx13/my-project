/**
 * NHP 子字段列表（table/group/repeatGroup 列/子字段配置，对齐 AUP ChildFieldList）。
 */
import type { FormField } from "../schema/formTemplate";
import { TYPE_REGISTRY } from "../schema/typeRegistry";

function nextChildKey(parentKey: string, existing: string[]): string {
  let n = 1;
  let k = `${parentKey}_c${n}`;
  while (existing.includes(k)) {
    n++;
    k = `${parentKey}_c${n}`;
  }
  return k;
}

interface Props {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  editable?: boolean;
  parentKey: string;
}

export default function ChildFieldList({ fields, onChange, editable = true, parentKey }: Props) {
  const addChild = () => {
    const key = nextChildKey(parentKey, fields.map((f) => f.fieldKey));
    onChange([...fields, { fieldKey: key, label: "", type: "text", required: false }]);
  };

  const patchAt = (i: number, patch: Partial<FormField>) => {
    const next = [...fields];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {fields.map((c, i) => (
        <div key={`${i}-${c.fieldKey}`} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="aup-input"
              style={{ flex: 1, minWidth: 120 }}
              value={c.label}
              disabled={!editable}
              placeholder="子字段标题"
              onChange={(e) => patchAt(i, { label: e.target.value })}
            />
            <select
              className="aup-select"
              style={{ width: 140 }}
              value={c.type}
              disabled={!editable}
              onChange={(e) => patchAt(i, { type: e.target.value as FormField["type"] })}
            >
              {TYPE_REGISTRY.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <label className="aup-check">
              <input
                type="checkbox"
                checked={!!c.required}
                disabled={!editable}
                onChange={(e) => patchAt(i, { required: e.target.checked })}
              />
              必填
            </label>
            {editable && (
              <button type="button" className="aup-btn small danger" onClick={() => onChange(fields.filter((_, j) => j !== i))}>
                删
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{c.fieldKey}</div>
        </div>
      ))}
      <button type="button" className="aup-btn small ghost" disabled={!editable} onClick={addChild}>
        ＋ 添加子字段
      </button>
    </div>
  );
}
