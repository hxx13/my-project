/**
 * NHP 题目渲染组件（role 优先，type 兜底）。
 */
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import type { FormField, OptionItem } from "../schema/formTemplate";
import { idRuleTypeZh } from "../utils/nhpIdRuleLabels";
import { useNhpAttachments } from "../hooks/useNhpAttachments";
import {
  cascadeOptionsForLevel,
  cascadePatch,
  defaultImageAccept,
  fileIdsFromValue,
  multiSelectValues,
  normalizeOptions,
  parseCascadeValue,
  validateFileUpload,
} from "@/features/form-shared/fieldHelpers";

interface Props {
  field: FormField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  readOnly?: boolean;
  entityOptions?: { value: string; label: string }[];
  values?: Record<string, unknown>;
  onFieldChange?: (fieldKey: string, value: unknown) => void;
  autoGenPreview?: string;
  /** @deprecated 使用 autoGenPreview */
  pkPreview?: string;
  /** file/image 上传需要表单实例 id */
  recordId?: number | null;
  operatorId?: string;
}

function normalizeFieldOptions(field: FormField): OptionItem[] {
  return normalizeOptions(field.options);
}

export default function NhpFormField({
  field,
  value,
  onChange,
  readOnly,
  entityOptions,
  values,
  onFieldChange,
  autoGenPreview,
  pkPreview,
  recordId,
  operatorId,
}: Props) {
  const preview = autoGenPreview ?? pkPreview;
  const { role, type, required, description } = field;
  const disabled = !!readOnly;
  const options = useMemo(() => normalizeFieldOptions(field), [field.options]);
  const [fkFilter, setFkFilter] = useState("");
  const filteredEntityOptions = useMemo(() => {
    if (!entityOptions) return [];
    const q = fkFilter.trim().toLowerCase();
    if (!q) return entityOptions;
    return entityOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [entityOptions, fkFilter]);

  if (role === "PK") {
    const hasPersisted = value != null && String(value).trim() !== "";
    const isPreview = !hasPersisted && !!preview;
    const displayCode = hasPersisted ? String(value) : preview ?? "…";
    const ruleHint = field.roleMeta?.pkRule
      ? `由 ${idRuleTypeZh(field.roleMeta.pkRule)} 规则自动生成`
      : "由取号器自动生成";
    const statusHint = isPreview
      ? "预览编号 · 提交后正式取号落库"
      : hasPersisted
        ? "已取号 · 不可手填"
        : "等待预览… · 不可手填";
    return (
      <div className={`nhp-pk-box${isPreview ? " is-preview" : ""}`}>
        <span className="nhp-role-badge pk">🔒 PK 取号</span>
        {isPreview ? <span className="nhp-autogen-preview-tag">预览</span> : null}
        <span className={`nhp-pk-code${isPreview ? " preview" : ""}`}>{displayCode}</span>
        <span className="nhp-role-hint">{ruleHint} · {statusHint}</span>
      </div>
    );
  }

  if (role === "DERIVED") {
    const hasPersisted = value != null && String(value).trim() !== "";
    const isPreview = !hasPersisted && !!preview;
    const displayVal = hasPersisted ? String(value) : preview ?? "—";
    const sourceHint = field.roleMeta?.derivedSource
      ? `⚙ ${field.roleMeta.derivedSource}`
      : "只读 · 随源数据实时重算";
    const statusHint = isPreview
      ? "预览值 · 保存后写入"
      : hasPersisted
        ? "已计算 · 不可手填"
        : "等待源字段…";
    return (
      <div className={`nhp-derived-box${isPreview ? " is-preview" : ""}`}>
        <span className="nhp-role-badge derived">⚙ DERIVED 派生</span>
        {isPreview ? <span className="nhp-autogen-preview-tag">预览</span> : null}
        <span className={`nhp-derived-val${isPreview ? " preview" : ""}`}>{displayVal}</span>
        <span className="nhp-role-hint">{sourceHint} · {statusHint}</span>
      </div>
    );
  }

  if (role === "FK") {
    const hasOptions = (entityOptions?.length ?? 0) > 0;
    return (
      <div className="nhp-fk-box">
        <span className="nhp-role-badge fk">🔗 FK 实体</span>
        {hasOptions ? (
          <>
            {!readOnly && (
              <input
                className="input"
                style={{ minWidth: 200, marginBottom: 4 }}
                placeholder="搜索实体…"
                value={fkFilter}
                onChange={(e) => setFkFilter(e.target.value)}
              />
            )}
            <select
              className="select"
              style={{ width: "auto", minWidth: 200, flex: 1 }}
              value={(value as string) ?? ""}
              disabled={disabled}
              onChange={(e) => onChange?.(e.target.value)}
            >
              <option value="">请选择实体…</option>
              {filteredEntityOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <span className="nhp-entity-chip">{String(value ?? "未选择")}</span>
            <span className="nhp-role-hint">实体选择器 · 实体列表待接入</span>
          </>
        )}
      </div>
    );
  }

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
      return (
        <ChoiceControl
          field={field}
          options={options}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
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
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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
    case "signature":
      return (
        <input
          className="input"
          value={value == null ? "" : String(value)}
          disabled={disabled}
          placeholder={disabled ? "（未签署）" : "请输入手写签名"}
          onChange={(e) => onChange?.(e.target.value)}
        />
      );
    case "file":
    case "image":
      return (
        <FileUploadControl
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          recordId={recordId}
          operatorId={operatorId}
        />
      );
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
        <CascadeControl
          field={field}
          options={options}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "description":
      return description ? <div dangerouslySetInnerHTML={{ __html: description }} /> : null;
    case "richText":
      return (
        <RichTextControl value={value} onChange={onChange} disabled={disabled} placeholder={field.label} />
      );
    case "divider":
      return <hr />;
    case "group":
      return (
        <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {(field.config?.fields ?? []).map((child) => (
            <NhpFormField
              key={child.fieldKey}
              field={child}
              value={values?.[child.fieldKey]}
              onChange={(v) => onFieldChange?.(child.fieldKey, v)}
              readOnly={readOnly}
              values={values}
              onFieldChange={onFieldChange}
              entityOptions={entityOptions}
              recordId={recordId}
              operatorId={operatorId}
            />
          ))}
        </div>
      );
    case "repeatGroup": {
      const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const childFields = field.config?.fields ?? [];
      const updateRows = (next: Record<string, unknown>[]) => onChange?.(next);
      return (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ border: "1px dashed var(--border)", borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>#{ri + 1}</span>
                {!readOnly && (
                  <button type="button" className="btn ghost small" onClick={() => updateRows(rows.filter((_, i) => i !== ri))}>
                    删除
                  </button>
                )}
              </div>
              {childFields.map((child) => (
                <div key={child.fieldKey} style={{ marginBottom: 6 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{child.label}</label>
                  <NhpFormField
                    field={child}
                    value={row[child.fieldKey]}
                    readOnly={readOnly}
                    recordId={recordId}
                    operatorId={operatorId}
                    onChange={(v) =>
                      updateRows(rows.map((r, i) => (i === ri ? { ...r, [child.fieldKey]: v } : r)))
                    }
                  />
                </div>
              ))}
            </div>
          ))}
          {!readOnly && (
            <button type="button" className="btn ghost small" onClick={() => updateRows([...rows, {}])}>
              ＋ 添加一行
            </button>
          )}
        </div>
      );
    }
    case "table": {
      const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const columns = field.config?.columns ?? [];
      const updateRows = (next: Record<string, unknown>[]) => onChange?.(next);
      return (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.fieldKey} style={{ borderBottom: "1px solid var(--border)", padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>
                    {c.label}
                  </th>
                ))}
                {!readOnly && <th style={{ width: 44 }} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {columns.map((c) => (
                    <td key={c.fieldKey} style={{ borderBottom: "1px solid var(--border)", padding: "4px 8px" }}>
                      <NhpFormField
                        field={c}
                        value={row[c.fieldKey]}
                        readOnly={readOnly}
                        recordId={recordId}
                        operatorId={operatorId}
                        onChange={(v) =>
                          updateRows(rows.map((r, i) => (i === ri ? { ...r, [c.fieldKey]: v } : r)))
                        }
                      />
                    </td>
                  ))}
                  {!readOnly && (
                    <td style={{ borderBottom: "1px solid var(--border)", padding: "4px 8px", textAlign: "center" }}>
                      <button type="button" className="btn ghost small" onClick={() => updateRows(rows.filter((_, i) => i !== ri))}>
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <button type="button" className="btn ghost small" style={{ margin: 8 }} onClick={() => updateRows([...rows, {}])}>
              ＋ 添加行
            </button>
          )}
        </div>
      );
    }
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

  const toggle = (opt: string) => {
    const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
    onChange?.(next);
  };

  const optionEl = (o: OptionItem) => {
    const isFixed = !!o.fixed;
    const checked = multiple ? isFixed || arr.includes(o.value) : isFixed || String(value ?? "") === o.value;
    const off = !!disabled || isFixed;
    return (
      <label key={o.value} className={"choice" + (checked ? " chosen" : "") + (off ? " disabled" : "")}>
        <input
          type={multiple ? "checkbox" : "radio"}
          name={multiple ? undefined : field.fieldKey}
          checked={checked}
          disabled={off}
          onChange={() => !isFixed && (multiple ? toggle(o.value) : onChange?.(o.value))}
        />
        <span>{o.label}</span>
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

function CascadeControl({
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
  const levels = field.config?.levels;
  const current = parseCascadeValue(value);

  if (!levels || levels.length === 0) {
    return (
      <select
        className="select"
        value={current._legacy ?? ""}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="">请选择</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {levels.map((levelLabel, i) => {
        const levelOpts = cascadeOptionsForLevel(options, levels, i, current);
        const val = current[levelLabel] ?? "";
        const prevFilled = i === 0 || Boolean(current[levels[i - 1]]);
        if (!prevFilled && i > 0) return null;
        return (
          <div key={levelLabel}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{levelLabel}</div>
            {levelOpts.length > 0 ? (
              <select
                className="select"
                value={val}
                disabled={disabled}
                onChange={(e) => onChange?.(cascadePatch(levels, current, levelLabel, i, e.target.value))}
              >
                <option value="">请选择</option>
                {levelOpts.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={val}
                disabled={disabled}
                placeholder={`输入${levelLabel}`}
                onChange={(e) => onChange?.(cascadePatch(levels, current, levelLabel, i, e.target.value))}
              />
            )}
          </div>
        );
      })}
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

function FileUploadControl({
  field,
  value,
  onChange,
  readOnly,
  recordId,
  operatorId,
}: {
  field: FormField;
  value?: unknown;
  onChange?: (v: unknown) => void;
  readOnly?: boolean;
  recordId?: number | null;
  operatorId?: string;
}) {
  const { listQuery, uploadMutation, deleteMutation, download } = useNhpAttachments(recordId, operatorId);
  const ids = fileIdsFromValue(value);
  const files = (listQuery.data ?? []).filter((f) => ids.includes(f.fileId));
  const accept = field.type === "image" ? (field.config?.accept ?? defaultImageAccept()) : field.config?.accept;
  const maxCount = field.config?.maxCount ?? (field.type === "image" ? 5 : 1);
  const isMulti = maxCount > 1;

  const onPick = (file: File | null) => {
    if (!file || !recordId) return;
    const err = validateFileUpload(file, ids.length, field.config);
    if (err) {
      toast.error(err);
      return;
    }
    uploadMutation.mutate(file, {
      onSuccess: (uploaded) => {
        const next = isMulti ? [...ids, uploaded.fileId] : uploaded.fileId;
        onChange?.(next);
      },
    });
  };

  const doDownload = async (fileId: number) => {
    try {
      const { blob, fileName } = await download(fileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* toast from hook */
    }
  };

  return (
    <div>
      {files.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {files.map((f) => (
            <div key={f.fileId} className="attach-row" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <span>{f.fileName}</span>
              {f.size != null && <span style={{ fontSize: 11, color: "var(--muted)" }}>{(f.size / 1024).toFixed(1)} KB</span>}
              <button type="button" className="btn ghost small" onClick={() => doDownload(f.fileId)}>↓</button>
              {!readOnly && (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    deleteMutation.mutate(f.fileId, {
                      onSuccess: () => {
                        const nextIds = ids.filter((x) => x !== f.fileId);
                        onChange?.(isMulti ? nextIds : nextIds[0] ?? undefined);
                      },
                    });
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <label className="btn ghost small" style={{ display: "inline-block", cursor: "pointer" }}>
          {uploadMutation.isPending ? "上传中…" : "＋ 上传"}
          <input
            type="file"
            hidden
            accept={accept}
            onChange={(e) => {
              onPick(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {!recordId && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>保存草稿后即可上传附件</div>}
    </div>
  );
}
