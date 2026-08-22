/**
 * NHP 题目渲染组件（role 优先，type 兜底）。
 *
 * 运行态：填写页按字段渲染控件。
 * role 四类（与 type 正交）：
 *   - PK 取号：灰锁只读，值由取号器预生成，不可手填
 *   - FK 实体：蓝实体选择器，从实体列表勾选，非自由文本
 *   - DERIVED 派生：青只读，值由算法/规则计算，显式标注来源
 *   - VALUE 采集：码表/直填，唯一允许手填，走 type 分发
 * 缺省（无 role）按 VALUE 处理，兼容旧数据。
 * 新增题型 = typeRegistry 加一行 + 本文件 type switch 加一个 case。
 */
import type { FormField } from "../schema/formTemplate";
import { idRuleTypeZh } from "../utils/nhpIdRuleLabels";

interface Props {
  field: FormField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  readOnly?: boolean;
  /** FK 实体选择器的候选实体（由调用方按 roleMeta.entityType 取数后传入，避免本组件硬编码） */
  entityOptions?: { value: string; label: string }[];
  /** 结构化字段（group）子字段取值与回写 */
  values?: Record<string, unknown>;
  onFieldChange?: (fieldKey: string, value: unknown) => void;
  /** PK / DERIVED 预览值（未落库；提交/保存时正式生成或计算） */
  autoGenPreview?: string;
  /** @deprecated 使用 autoGenPreview */
  pkPreview?: string;
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
}: Props) {
  const preview = autoGenPreview ?? pkPreview;
  const { role, type, options, required, description } = field;
  const disabled = !!readOnly;

  // ── role 优先于 type ──

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
        <span className="nhp-entity-chip">{String(value ?? "未选择")}</span>
        {hasOptions ? (
          // 最小闭环用受控 select；完整实体选择器（搜索 + 台账勾选）待后端实体列表端点就绪后替换
          <select
            className="select"
            style={{ width: "auto", minWidth: 200, flex: 1 }}
            value={(value as string) ?? ""}
            disabled={disabled}
            onChange={(e) => onChange?.(e.target.value)}
          >
            <option value="">请选择实体…</option>
            {entityOptions!.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="nhp-role-hint">实体选择器 · 实体列表待接入</span>
        )}
      </div>
    );
  }

  // ── VALUE（或旧数据无 role）→ type 分发 ──

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
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => updateRows(rows.filter((_, i) => i !== ri))}
                  >
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
