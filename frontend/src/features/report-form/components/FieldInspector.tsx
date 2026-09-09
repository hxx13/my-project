import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LayoutJson, GridCell, FieldType, FieldDefinition } from '../types';

interface FieldInspectorProps {
  layout: LayoutJson;
  selectedCellIds: Set<string>;
  fieldType?: FieldType;
  fieldTypeMixed: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onPatchField: (patch: Partial<FieldDefinition>) => void;
  onUpdateCell: (cellId: string, patch: Partial<GridCell>) => void;
  onRenameFieldKey: (oldKey: string, newKey: string) => void;
}

const inputBase =
  'w-full rounded-lg bg-[var(--app-color-surface-hover)] px-2 text-[11px] text-[var(--app-color-text-primary)] focus:bg-white focus:outline focus:outline-2 focus:outline-[color-mix(in_srgb,var(--app-color-accent)_45%,transparent)]';
const inputClass = `${inputBase} h-9`;
const labelClass = 'text-[10px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block';

export default function FieldInspector({
  layout, selectedCellIds, fieldType, fieldTypeMixed, collapsed,
  onToggleCollapsed, onPatchField, onUpdateCell, onRenameFieldKey,
}: FieldInspectorProps) {
  // 参考格：layout.cells 中第一个命中 selectedCellIds 的格子
  const referenceCell = layout.cells.find(c => selectedCellIds.has(c.id));
  const cellId = referenceCell?.id;
  const cellFieldKey = referenceCell?.fieldKey ?? '';

  const isStatic = referenceCell?.kind === 'static';
  const field = cellFieldKey ? layout.fields[cellFieldKey] ?? null : null;
  /** 多选时 Key / 文案 / 跨度只作用于参考格，禁用以免看起来像批量生效 */
  const multi = selectedCellIds.size > 1;

  // 各输入一律草稿态、失焦才提交：逐字写 layout 会让每个击键都 pushUndo + 全表深拷贝。
  // 草稿随「参考格 + 其落库值」变化重置——React 官方「渲染期调整 state」写法，不用 effect。
  const syncKey = `${cellId ?? ''}|${cellFieldKey}|${field?.label ?? ''}|${referenceCell?.staticText ?? ''}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  const [keyDraft, setKeyDraft] = useState(cellFieldKey);
  const [labelDraft, setLabelDraft] = useState(field?.label ?? '');
  const [staticDraft, setStaticDraft] = useState(referenceCell?.staticText ?? '');
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey);
    setKeyDraft(cellFieldKey);
    setLabelDraft(field?.label ?? '');
    setStaticDraft(referenceCell?.staticText ?? '');
  }

  // 折叠态：仅一条竖直窄条 + 展开按钮，不渲染任何表单
  if (collapsed) {
    return (
      <div className="w-8 h-full shrink-0 flex flex-col items-center py-2 bg-[var(--app-color-surface-container)] shadow-[-1px_0_0_color-mix(in_srgb,var(--app-color-text-primary)_6%,transparent)]">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="展开属性"
          aria-label="展开属性"
          className="p-1 rounded-[4px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--app-color-surface-container)] shrink-0">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-[var(--app-color-text-tertiary)]">属性</span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="折叠属性栏"
          aria-label="折叠属性栏"
          className="p-0.5 rounded-[4px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {!referenceCell ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-[11px] text-[var(--app-color-text-tertiary)]">点击表格中的格子查看属性</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {isStatic ? (
            <div>
              <label className={labelClass}>文案内容</label>
              <textarea
                value={staticDraft}
                onChange={e => setStaticDraft(e.target.value)}
                onBlur={() => {
                  if (staticDraft !== (referenceCell.staticText ?? '')) {
                    onUpdateCell(referenceCell.id, { staticText: staticDraft });
                  }
                }}
                disabled={multi}
                title={multi ? '多选时仅作用于第一个格' : undefined}
                className={`${inputBase} h-16 py-2 resize-none disabled:opacity-40`}
                placeholder="输入文本..."
              />
            </div>
          ) : field ? (
            <>
              {!fieldTypeMixed && (
                <>
                  <div>
                    <label className={labelClass}>字段 Key</label>
                    <input
                      value={keyDraft}
                      onChange={e => setKeyDraft(e.target.value)}
                      onBlur={() => {
                        const newKey = keyDraft.trim();
                        // 先回退到旧 key：重命名成功时 effect 会用新 key 覆盖，失败（如 key 已存在）则保持旧值
                        setKeyDraft(cellFieldKey);
                        if (newKey && newKey !== cellFieldKey) onRenameFieldKey(cellFieldKey, newKey);
                      }}
                      disabled={multi}
                      title={multi ? '多选时仅作用于第一个格' : undefined}
                      className={`${inputClass} disabled:opacity-40`}
                      placeholder="f_xxx"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>标签</label>
                    <input
                      value={labelDraft}
                      onChange={e => setLabelDraft(e.target.value)}
                      onBlur={() => {
                        if (labelDraft !== (field.label ?? '')) onPatchField({ label: labelDraft });
                      }}
                      className={inputClass}
                      placeholder="显示名称"
                    />
                  </div>
                </>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <span className="relative inline-flex w-[34px] h-[20px] shrink-0">
                  <input
                    type="checkbox"
                    checked={field.required ?? false}
                    onChange={e => onPatchField({ required: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-[var(--app-color-surface-hover)] peer-checked:bg-[var(--app-color-accent)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-[var(--app-color-accent)]" />
                  <span className="absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white shadow-sm transition-[left] duration-150 peer-checked:left-[16px]" />
                </span>
                <span className="text-[10px] text-[var(--app-color-text-secondary)]">必填</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <span className="relative inline-flex w-[34px] h-[20px] shrink-0">
                  <input
                    type="checkbox"
                    checked={field.editableInFill ?? false}
                    onChange={e => onPatchField({ editableInFill: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-[var(--app-color-surface-hover)] peer-checked:bg-[var(--app-color-accent)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-[var(--app-color-accent)]" />
                  <span className="absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white shadow-sm transition-[left] duration-150 peer-checked:left-[16px]" />
                </span>
                <span className="text-[10px] text-[var(--app-color-text-secondary)]">填报可编辑</span>
              </label>

              {fieldType === 'NUMBER' && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className={labelClass}>最小值</label>
                    <input
                      type="number"
                      value={field.min ?? ''}
                      onChange={e => onPatchField({ min: e.target.value !== '' ? Number(e.target.value) : undefined })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>最大值</label>
                    <input
                      type="number"
                      value={field.max ?? ''}
                      onChange={e => onPatchField({ max: e.target.value !== '' ? Number(e.target.value) : undefined })}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {fieldType === 'TEXT' && (
                <div>
                  <label className={labelClass}>最大长度</label>
                  <input
                    type="number"
                    value={field.maxLength ?? ''}
                    onChange={e => onPatchField({ maxLength: e.target.value !== '' ? Number(e.target.value) : undefined })}
                    className={inputClass}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-[10px] text-[var(--app-color-text-tertiary)]">该格子未关联字段定义</p>
          )}

          {/* 单元格 */}
          <div className="!mt-[22px] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--app-color-text-primary)_6%,transparent)] pt-3">
            <h4 className="text-[11px] font-semibold tracking-[0.08em] text-[var(--app-color-text-tertiary)] mb-1.5">单元格</h4>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className={labelClass}>列跨度</label>
                <input
                  type="number"
                  min={1}
                  value={referenceCell.colSpan}
                  onChange={e => onUpdateCell(referenceCell.id, { colSpan: Math.max(1, Number(e.target.value) || 1) })}
                  disabled={multi}
                  title={multi ? '多选时仅作用于第一个格' : undefined}
                  className={`${inputClass} disabled:opacity-40`}
                />
              </div>
              <div>
                <label className={labelClass}>行跨度</label>
                <input
                  type="number"
                  min={1}
                  value={referenceCell.rowSpan}
                  onChange={e => onUpdateCell(referenceCell.id, { rowSpan: Math.max(1, Number(e.target.value) || 1) })}
                  disabled={multi}
                  title={multi ? '多选时仅作用于第一个格' : undefined}
                  className={`${inputClass} disabled:opacity-40`}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
