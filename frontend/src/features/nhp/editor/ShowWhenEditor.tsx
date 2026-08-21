/**
 * 条件连锁编辑（对齐 AUP ShowWhenEditor）。
 */
import { useMemo } from "react";
import type { ShowWhen, ShowWhenOp } from "../schema/formTemplate";
import type { FieldCatalogEntry } from "../store/editorUtils";

interface Props {
  value: ShowWhen | null | undefined;
  onChange: (v: ShowWhen | null) => void;
  fieldCatalog: FieldCatalogEntry[];
}

export default function ShowWhenEditor({ value, onChange, fieldCatalog }: Props) {
  const showWhen: ShowWhen | null = value ?? null;
  const op = showWhen?.op ?? "";
  const needValue = op === "equals" || op === "notEquals" || op === "contains" || op === "notContains";
  const selected = fieldCatalog.find((c) => c.key === showWhen?.field);
  const hasOptions = needValue && !!selected && selected.optionValues.length > 0;

  const groups = useMemo(() => {
    const m = new Map<string, FieldCatalogEntry[]>();
    fieldCatalog.forEach((c) => {
      const arr = m.get(c.containerLabel) ?? [];
      arr.push(c);
      m.set(c.containerLabel, arr);
    });
    return Array.from(m.entries());
  }, [fieldCatalog]);

  return (
    <div>
      <div className="aup-row">
        <label>显示条件</label>
        <select
          className="aup-select"
          value={op}
          onChange={(e) => {
            const o = e.target.value;
            if (!o) {
              onChange(null);
              return;
            }
            onChange({
              field: showWhen?.field ?? "",
              op: o as ShowWhenOp,
              value: o === "notEmpty" || o === "empty" ? undefined : showWhen?.value,
            });
          }}
        >
          <option value="">无（始终显示）</option>
          <option value="equals">当某题选择某选项时显示</option>
          <option value="notEquals">当某题不是某选项时显示</option>
          <option value="contains">当某题包含某选项时显示</option>
          <option value="notContains">当某题不含某选项时显示</option>
          <option value="notEmpty">当某题已填写时显示</option>
          <option value="empty">当某题未填写时显示</option>
        </select>
      </div>
      {showWhen && (
        <>
          <div className="aup-row">
            <label>依赖题目</label>
            <select
              className="aup-select"
              value={showWhen.field}
              onChange={(e) => onChange({ ...showWhen, field: e.target.value })}
            >
              <option value="">选择题目…</option>
              {groups.map(([gl, items]) => (
                <optgroup key={gl} label={gl}>
                  {items.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}（{c.key}）
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {needValue && (
            <div className="aup-row">
              <label>选项值</label>
              {hasOptions ? (
                <select
                  className="aup-select"
                  value={String(showWhen.value ?? "")}
                  onChange={(e) => onChange({ ...showWhen, value: e.target.value })}
                >
                  <option value="">选择选项…</option>
                  {selected!.optionValues.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="aup-input"
                  value={String(showWhen.value ?? "")}
                  placeholder="手动填写值"
                  onChange={(e) => onChange({ ...showWhen, value: e.target.value })}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
