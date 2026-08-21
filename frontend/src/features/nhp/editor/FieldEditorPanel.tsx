/**
 * 右侧字段编辑面板（对齐设计 15 FieldEditorPanel）。
 */
import type { FormField } from "../schema/formTemplate";
import { TYPE_REGISTRY, TYPES_WITH_OPTIONS, typeMetaOf } from "../schema/typeRegistry";
import type { FieldCatalogEntry } from "../store/editorUtils";
import OptionsEditor, { type CodelistOption } from "./OptionsEditor";
import ShowWhenEditor from "./ShowWhenEditor";

interface Props {
  field: FormField;
  fieldCatalog: FieldCatalogEntry[];
  codelists: CodelistOption[];
  editable?: boolean;
  onChange: (patch: Partial<FormField>) => void;
  onRemove: () => void;
  onClose?: () => void;
}

export default function FieldEditorPanel({
  field,
  fieldCatalog,
  codelists,
  editable = true,
  onChange,
  onRemove,
  onClose,
}: Props) {
  const meta = typeMetaOf(field.type);
  const hasOptions = TYPES_WITH_OPTIONS.has(field.type);

  return (
    <div className="aup-drawer" onClick={(e) => e.stopPropagation()}>
      <div className="aup-drawer-hd">
        <div className="aup-drawer-title">
          <span className="aup-type-ic">{meta?.icon ?? "题"}</span>
          编辑题目
        </div>
        {onClose && (
          <button type="button" className="aup-iconbtn" onClick={onClose} title="关闭">
            ×
          </button>
        )}
      </div>
      <div className="aup-drawer-body">
        <div className="aup-drawer-hint">修改后点顶栏「保存」才会写回服务器。</div>

        <div className="aup-row">
          <label>题目标题</label>
          <input
            className="aup-input"
            value={field.label}
            disabled={!editable}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="填写人看到的题目"
          />
        </div>
        <div className="aup-row">
          <label>题型</label>
          <select
            className="aup-select"
            value={field.type}
            disabled={!editable}
            onChange={(e) => {
              const type = e.target.value as FormField["type"];
              const nextMeta = typeMetaOf(type);
              onChange({
                type,
                config: nextMeta?.defaultConfig ? { ...nextMeta.defaultConfig } : field.config,
              });
            }}
          >
            {TYPE_REGISTRY.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="aup-row">
          <label>必填</label>
          <label className="aup-check">
            <input
              type="checkbox"
              checked={!!field.required}
              disabled={!editable}
              onChange={(e) => onChange({ required: e.target.checked })}
            />
            必填项
          </label>
        </div>
        <div className="aup-row">
          <label>说明</label>
          <textarea
            className="aup-textarea"
            value={field.description ?? ""}
            disabled={!editable}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={2}
            placeholder="题下灰字说明"
          />
        </div>

        {field.type === "number" && (
          <div className="aup-row">
            <label>单位</label>
            <input
              className="aup-input"
              value={field.config?.unit ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ config: { ...field.config, unit: e.target.value || undefined } })}
              placeholder="如 μmol/L"
            />
          </div>
        )}

        {hasOptions && (
          <>
            <div className="aup-subh">选项</div>
            <OptionsEditor
              options={field.options}
              dictKey={field.dictKey}
              codelists={codelists}
              editable={editable}
              onChange={(patch) => onChange(patch)}
            />
          </>
        )}

        <details className="aup-adv" open={!!field.showWhen}>
          <summary>高级设置</summary>
          <div className="aup-row">
            <label>字段键</label>
            <input className="aup-input" value={field.fieldKey} disabled />
          </div>
          <ShowWhenEditor
            value={field.showWhen}
            onChange={(v) => onChange({ showWhen: v })}
            fieldCatalog={fieldCatalog.filter((c) => c.key !== field.fieldKey)}
          />
        </details>

        <div className="aup-divider" />
        <div className="aup-actions">
          <button type="button" className="aup-btn danger" disabled={!editable} onClick={onRemove}>
            删除题目
          </button>
        </div>
      </div>
    </div>
  );
}
