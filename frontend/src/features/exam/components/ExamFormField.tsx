/**
 * Exam 题目渲染组件（纯 type 渲染）。
 */
import { useMemo, useState } from "react";
import type { FormField, OptionItem } from "../schema/formTemplate";
import { multiSelectValues, normalizeOptions } from "@/features/form-shared/fieldHelpers";

interface Props {
  field: FormField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  readOnly?: boolean;
}

function normalizeFieldOptions(field: FormField): OptionItem[] {
  return normalizeOptions(field.options);
}

export default function ExamFormField({ field, value, onChange, readOnly }: Props) {
  const { type, required } = field;
  const disabled = !!readOnly;
  const options = useMemo(() => normalizeFieldOptions(field), [field.options]);

  switch (type) {
    case "text":
      return (
        <input
          className="input"
          value={(value as string) ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="请输入"
          required={required}
          disabled={disabled}
        />
      );
    case "textarea":
      return (
        <textarea
          className="textarea"
          value={(value as string) ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="请输入"
          required={required}
          disabled={disabled}
        />
      );
    case "number": {
      const unit = field.config?.unit;
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            className="input"
            type="number"
            value={(value as number) ?? ""}
            onChange={(e) => onChange?.(e.target.value === "" ? undefined : Number(e.target.value))}
            required={required}
            disabled={disabled}
          />
          {unit ? <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{unit}</span> : null}
        </span>
      );
    }
    case "choice":
      return (
        <ChoiceControl
          field={field}
          options={options}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "checkbox":
      if (options.length > 0) {
        const arr = multiSelectValues(value);
        const toggle = (opt: string) => {
          const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
          onChange?.(next);
        };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {options.map((o) => {
              const checked = arr.includes(o.value);
              return (
                <label key={o.value} className={"choice" + (checked ? " chosen" : "")} style={{ display: "flex", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(o.value)}
                  />
                  <span>{o.label}</span>
                </label>
              );
            })}
          </div>
        );
      }
      return (
        <input
          type="checkbox"
          checked={(value as boolean) ?? false}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
        />
      );
    case "file":
    case "image":
      // ponytail: 附件上传占位，接入真实上传链路时替换
      return (
        <input
          type="file"
          disabled={disabled}
          accept={field.type === "image" ? (field.config?.accept ?? "image/*") : field.config?.accept}
          onChange={(e) => onChange?.(e.target.files?.[0] ?? null)}
        />
      );
    case "richText":
      return (
        <RichTextControl value={value} onChange={onChange} disabled={disabled} placeholder={field.label} />
      );
    default:
      return <div style={{ color: "#8a94a6" }}>{type}（待实现）</div>;
  }
}

function ChoiceControl({
  field,
  options,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  options: OptionItem[];
  value?: unknown;
  onChange?: (v: unknown) => void;
  disabled?: boolean;
}) {
  const multiple = field.config?.choiceType === "multiple";
  const layout = field.config?.layout ?? "list";
  const cols = Math.max(2, field.config?.cols ?? 3);
  const arr = multiple ? multiSelectValues(value) : [];

  const answer = field.config?.answer;
  const answers = field.config?.answers;
  const correctValues = multiple
    ? Array.isArray(answers) ? answers : answer ? [answer] : []
    : answer ? [answer] : [];

  const toggle = (opt: string) => {
    const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
    onChange?.(next);
  };

  const optionEl = (o: OptionItem) => {
    const isFixed = !!o.fixed;
    const checked = multiple ? isFixed || arr.includes(o.value) : isFixed || String(value ?? "") === o.value;
    const off = !!disabled || isFixed;
    const correct = correctValues.includes(o.value);
    return (
      <label key={o.value} className={"choice" + (checked ? " chosen" : "") + (off ? " disabled" : "")}>
        <input
          type={multiple ? "checkbox" : "radio"}
          name={multiple ? undefined : field.fieldKey}
          checked={checked}
          disabled={off}
          onChange={() => !isFixed && (multiple ? toggle(o.value) : onChange?.(o.value))}
        />
        <span style={correct ? { color: "#16a34a", fontWeight: 600 } : undefined}>{o.label}</span>
        {correct && <span style={{ color: "#16a34a", marginLeft: 4 }} title="正确答案">✓</span>}
      </label>
    );
  };

  return (
    <div
      className={layout === "grid" ? "choice-grid" : undefined}
      style={layout === "grid" ? { display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 6 } : { display: "flex", flexDirection: "column", gap: 4 }}
    >
      {options.map(optionEl)}
    </div>
  );
}

function RichTextControl({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value?: unknown;
  onChange?: (v: unknown) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const text = value == null ? "" : String(value);
  const [showPreview, setShowPreview] = useState(false);
  return (
    <div>
      <textarea
        className="textarea rich"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        rows={4}
      />
      {text.trim() && (
        <button type="button" className="btn ghost small" style={{ marginTop: 4 }} onClick={() => setShowPreview((p) => !p)}>
          {showPreview ? "隐藏预览" : "HTML 预览"}
        </button>
      )}
      {showPreview && text.trim() && (
        <div className="aup-desc" style={{ marginTop: 6, padding: 8, border: "1px solid var(--border)", borderRadius: 6 }} dangerouslySetInnerHTML={{ __html: text }} />
      )}
    </div>
  );
}
