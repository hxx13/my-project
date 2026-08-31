/**
 * 右侧字段编辑面板（对齐设计 15 FieldEditorPanel）。
 */
import type { ChoiceType, FieldRole, FormField, NoteTone } from "../schema/formTemplate";
import { TYPES_WITH_OPTIONS, typeMetaOf, compatibleTypesFor } from "../schema/typeRegistry";
import type { FieldCatalogEntry } from "../store/editorUtils";
import { PK_ID_RULE_OPTIONS } from "../utils/nhpIdRuleLabels";
import ChildFieldList from "./ChildFieldList";
import OptionsEditor, { type CodelistOption } from "./OptionsEditor";
import ShowWhenEditor from "./ShowWhenEditor";

const ROLE_OPTIONS: { value: FieldRole; label: string }[] = [
  { value: "VALUE", label: "采集值（码表 / 直填）" },
  { value: "PK", label: "取号（自动生成，只读）" },
  { value: "FK", label: "关联实体（选择器）" },
  { value: "DERIVED", label: "派生计算（只读）" },
];

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
  const cfg = field.config ?? {};

  const setCfg = (patch: Partial<FormField["config"]>) => onChange({ config: { ...cfg, ...patch } });

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
            {compatibleTypesFor(field.dataType).map((tv) => {
              const t = typeMetaOf(tv);
              return (
                <option key={tv} value={tv}>
                  {t?.label ?? tv}
                </option>
              );
            })}
          </select>
        </div>
        <div className="aup-row">
          <label>字段角色</label>
          <select
            className="aup-select"
            value={field.role ?? "VALUE"}
            disabled={!editable}
            onChange={(e) => onChange({ role: e.target.value as FieldRole })}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {field.role === "PK" && (
          <div className="aup-row">
            <label>编码引擎（ID 规则）</label>
            <select
              className="aup-select"
              value={field.roleMeta?.pkRule ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ roleMeta: { ...field.roleMeta, pkRule: e.target.value || undefined } })}
            >
              <option value="">— 选择 ID 规则 —</option>
              {PK_ID_RULE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {field.role === "FK" && (
          <div className="aup-row">
            <label>实体类型</label>
            <input
              className="aup-input"
              value={field.roleMeta?.entityType ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ roleMeta: { ...field.roleMeta, entityType: e.target.value || undefined } })}
              placeholder="如 donor / recipient / sample / regimen"
            />
          </div>
        )}
        {field.role === "DERIVED" && (
          <div className="aup-row">
            <label>算法来源</label>
            <input
              className="aup-input"
              value={field.roleMeta?.derivedSource ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ roleMeta: { ...field.roleMeta, derivedSource: e.target.value || undefined } })}
              placeholder="如 平台配对算法 V1"
            />
          </div>
        )}

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

        {field.type === "cascade" && (
          <div className="aup-row">
            <label>级联层级</label>
            <input
              className="aup-input"
              disabled={!editable}
              value={Array.isArray(cfg.levels) ? cfg.levels.join(",") : ""}
              placeholder="如 校区,楼,房间"
              onChange={(e) =>
                setCfg({
                  levels: e.target.value ? e.target.value.split(",").map((x) => x.trim()).filter(Boolean) : undefined,
                })
              }
            />
          </div>
        )}

        {(field.type === "description" || field.type === "richText") && (
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

        {field.type === "table" && (
          <>
            <div className="aup-subh">列定义</div>
            <ChildFieldList
              fields={cfg.columns ?? []}
              editable={editable}
              parentKey={field.fieldKey}
              onChange={(cols) => setCfg({ columns: cols })}
            />
          </>
        )}

        {(field.type === "group" || field.type === "repeatGroup") && (
          <>
            <div className="aup-subh">子字段</div>
            <ChildFieldList
              fields={cfg.fields ?? []}
              editable={editable}
              parentKey={field.fieldKey}
              onChange={(fields) => setCfg({ fields })}
            />
          </>
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
