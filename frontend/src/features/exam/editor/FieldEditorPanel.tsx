/**
 * 右侧字段编辑面板（对齐设计 15 FieldEditorPanel）。
 */
import type { ChoiceType, FormField, NoteTone } from "../schema/formTemplate";
import { FIELD_TYPES, TYPES_WITH_OPTIONS, typeMetaOf } from "../schema/typeRegistry";
import { normalizeOptions } from "../store/editorUtils";
import type { FieldCatalogEntry } from "../store/editorUtils";
import OptionsEditor from "./OptionsEditor";
import ShowWhenEditor from "./ShowWhenEditor";

interface Props {
  field: FormField;
  fieldCatalog: FieldCatalogEntry[];
  editable?: boolean;
  onChange: (patch: Partial<FormField>) => void;
  onRemove: () => void;
  onClose?: () => void;
}

export default function FieldEditorPanel({
  field,
  fieldCatalog,
  editable = true,
  onChange,
  onRemove,
  onClose,
}: Props) {
  const meta = typeMetaOf(field.type);
  const hasOptions = TYPES_WITH_OPTIONS.has(field.type);
  const cfg = field.config ?? {};

  const setCfg = (patch: Partial<FormField["config"]>) => onChange({ config: { ...cfg, ...patch } });

  const handleAnswerChange = (answer: string | string[]) => {
    if ((cfg.choiceType ?? "single") === "multiple") setCfg({ answers: answer as string[] });
    else setCfg({ answer: answer as string });
  };

  const answerLabels = (() => {
    const multiple = (cfg.choiceType ?? "single") === "multiple";
    const vals = multiple
      ? Array.isArray(cfg.answers) ? cfg.answers : cfg.answer ? [cfg.answer] : []
      : cfg.answer ? [cfg.answer] : [];
    return vals
      .map((v) => normalizeOptions(field.options).find((o) => o.value === v)?.label ?? v)
      .filter(Boolean);
  })();

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
            {FIELD_TYPES.map((t) => (
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
              onChange={(e) => setCfg({ unit: e.target.value || undefined })}
              placeholder="如 μmol/L"
            />
          </div>
        )}

        {field.type === "choice" && (
          <>
            <div className="aup-row">
              <label>选择方式</label>
              <select
                className="aup-select"
                value={cfg.choiceType ?? "single"}
                disabled={!editable}
                onChange={(e) => setCfg({ choiceType: e.target.value as ChoiceType })}
              >
                <option value="single">单选</option>
                <option value="multiple">多选</option>
              </select>
            </div>
            <div className="aup-row">
              <label>排版</label>
              <select
                className="aup-select"
                value={cfg.layout ?? "list"}
                disabled={!editable}
                onChange={(e) => setCfg({ layout: e.target.value as "list" | "grid" | "grouped" })}
              >
                <option value="list">竖排列表</option>
                <option value="grid">多列网格</option>
                <option value="grouped">分组标题</option>
              </select>
            </div>
            {cfg.layout === "grid" && (
              <div className="aup-row">
                <label>列数</label>
                <input
                  className="aup-input"
                  type="number"
                  min={2}
                  max={4}
                  disabled={!editable}
                  value={String(cfg.cols ?? 3)}
                  onChange={(e) => setCfg({ cols: Number(e.target.value) || 3 })}
                />
              </div>
            )}
          </>
        )}

        {(field.type === "file" || field.type === "image") && (
          <>
            <div className="aup-row">
              <label>接受类型</label>
              <input
                className="aup-input"
                disabled={!editable}
                value={cfg.accept ?? ""}
                placeholder={field.type === "image" ? "image/jpeg,image/png" : "如 .pdf,.docx"}
                onChange={(e) => setCfg({ accept: e.target.value || undefined })}
              />
            </div>
            <div className="aup-row">
              <label>大小上限（字节）</label>
              <input
                className="aup-input"
                type="number"
                disabled={!editable}
                value={cfg.maxSize != null ? String(cfg.maxSize) : ""}
                onChange={(e) => setCfg({ maxSize: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div className="aup-row">
              <label>数量上限</label>
              <input
                className="aup-input"
                type="number"
                disabled={!editable}
                value={cfg.maxCount != null ? String(cfg.maxCount) : ""}
                onChange={(e) => setCfg({ maxCount: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          </>
        )}

        {field.type === "richText" && (
          <div className="aup-row">
            <label>高亮变体</label>
            <select
              className="aup-select"
              value={cfg.tone ?? "info"}
              disabled={!editable}
              onChange={(e) => setCfg({ tone: e.target.value as NoteTone })}
            >
              <option value="info">信息（蓝）</option>
              <option value="warn">警示（琥珀）</option>
              <option value="danger">危险（红）</option>
              <option value="muted">弱化（灰）</option>
            </select>
          </div>
        )}

        {hasOptions && (
          <>
            <div className="aup-subh">选项</div>
            {field.type === "choice" && (
              <div className="aup-row">
                <label>正确答案</label>
                <span className="aup-muted">{answerLabels.length ? answerLabels.join("、") : "未设置"}</span>
              </div>
            )}
            <OptionsEditor
              options={field.options}
              editable={editable}
              choiceType={field.type === "choice" ? cfg.choiceType ?? "single" : undefined}
              answer={field.type === "choice" ? cfg.answer ?? cfg.answers : undefined}
              onAnswerChange={field.type === "choice" ? handleAnswerChange : undefined}
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
