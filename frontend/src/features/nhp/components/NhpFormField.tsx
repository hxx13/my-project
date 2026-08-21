/**
 * NHP 题目渲染组件（按 type 分发）。
 *
 * 运行态：填写页按字段 type 渲染对应控件。
 * 编辑态不在此处理；本组件只负责「呈现 + 取值」。
 * 新增题型 = typeRegistry 加一行 + 此处加一个 case。
 */
import type { FormField } from "../schema/formTemplate";

interface Props {
  field: FormField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  readOnly?: boolean;
}

export default function NhpFormField({ field, value, onChange, readOnly }: Props) {
  const { type, options, required, description } = field;
  const disabled = !!readOnly;

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
    case "number":
      return (
        <input
          className="input"
          type="number"
          value={(value as number) ?? ""}
          onChange={(e) => onChange?.(e.target.value === "" ? undefined : Number(e.target.value))}
          required={required}
          disabled={disabled}
        />
      );
    case "date":
      return (
        <input
          className="input"
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          required={required}
          disabled={disabled}
        />
      );
    case "choice":
    case "select":
      return (
        <select
          className="select"
          value={(value as string) ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          required={required}
          disabled={disabled}
        >
          <option value="">请选择</option>
          {(options ?? []).map((o) => {
            const v = typeof o === "string" ? o : o.value;
            const l = typeof o === "string" ? o : o.label;
            return (
              <option key={v} value={v}>
                {l}
              </option>
            );
          })}
        </select>
      );
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={(value as boolean) ?? false}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
        />
      );
    case "signature":
      return <div style={{ border: "1px dashed #d5dbe3", padding: 8 }}>签名（待实现）</div>;
    case "file":
    case "image":
      return <div style={{ border: "1px dashed #d5dbe3", padding: 8 }}>上传（待实现）</div>;
    case "dateRange": {
      const v = String(value ?? "").split("~");
      return (
        <span style={{ display: "inline-flex", gap: 4 }}>
          <input
            className="input"
            type="date"
            value={v[0] ?? ""}
            disabled={disabled}
            onChange={(e) => onChange?.(`${e.target.value}~${v[1] ?? ""}`)}
          />
          <input
            className="input"
            type="date"
            value={v[1] ?? ""}
            disabled={disabled}
            onChange={(e) => onChange?.(`${v[0] ?? ""}~${e.target.value}`)}
          />
        </span>
      );
    }
    case "time":
      return (
        <input
          className="input"
          type="time"
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
        />
      );
    case "cascade":
      return (
        <select
          className="select"
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
        >
          <option value="">请选择</option>
          {(options ?? []).map((o) => {
            const v = typeof o === "string" ? o : o.value;
            const l = typeof o === "string" ? o : o.label;
            return (
              <option key={v} value={v}>
                {l}
              </option>
            );
          })}
        </select>
      );
    case "description":
    case "richText":
      return description ? <div dangerouslySetInnerHTML={{ __html: description }} /> : null;
    case "divider":
      return <hr />;
    default:
      return <div style={{ color: "#8a94a6" }}>{type}（待实现）</div>;
  }
}
