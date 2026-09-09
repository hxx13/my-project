import { useRef } from 'react';
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

const inputClass =
  'w-full rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]';
const labelClass = 'text-[10px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block';

export default function FieldInspector({
  layout, selectedCellIds, fieldType, fieldTypeMixed, collapsed,
  onToggleCollapsed, onPatchField, onUpdateCell, onRenameFieldKey,
}: FieldInspectorProps) {
  // 折叠态：仅一条竖直窄条 + 展开按钮，不渲染任何表单
  if (collapsed) {
    return (
      <div className="w-8 h-full shrink-0 flex flex-col items-center py-2 border-l border-[var(--app-color-border)] bg-[var(--app-color-surface-container)]">
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

  // 参考格：layout.cells 中第一个命中 selectedCellIds 的格子
  const referenceCell = layout.cells.find(c => selectedCellIds.has(c.id));
  const cellId = referenceCell?.id;

  // 参考格切换时快照其绑定的字段 key 作为「旧 key」。编辑 key 时 onUpdateCell 只改
  // cell.fieldKey、不碰 fields 映射，据此解析字段定义可避免输入过程中属性区闪断。
  const committedKeyRef = useRef<string | null>(null);
  const prevCellIdRef = useRef<string | undefined>(undefined);
  if (prevCellIdRef.current !== cellId) {
    prevCellIdRef.current = cellId;
    committedKeyRef.current = referenceCell?.fieldKey ?? null;
  }
  const committedKey = committedKeyRef.current;

  const isStatic = referenceCell?.kind === 'static';
  const field = referenceCell && committedKey ? layout.fields[committedKey] ?? null : null;

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">属性</span>
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
                value={referenceCell.staticText || ''}
                onChange={e => onUpdateCell(referenceCell.id, { staticText: e.target.value })}
                className={`${inputClass} h-16 resize-none`}
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
                      value={referenceCell.fieldKey || ''}
                      onChange={e => onUpdateCell(referenceCell.id, { fieldKey: e.target.value })}
                      onBlur={e => {
                        const newKey = e.target.value.trim();
                        const oldKey = committedKeyRef.current;
                        if (newKey && oldKey && newKey !== oldKey) {
                          onRenameFieldKey(oldKey, newKey);
                          committedKeyRef.current = newKey;
                        }
                      }}
                      className={inputClass}
                      placeholder="f_xxx"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>标签</label>
                    <input
                      value={field.label || ''}
                      onChange={e => onPatchField({ label: e.target.value })}
                      className={inputClass}
                      placeholder="显示名称"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.required ?? false}
                  onChange={e => onPatchField({ required: e.target.checked })}
                  className="w-3 h-3 accent-[var(--app-color-accent)]"
                />
                <label className="text-[10px] text-[var(--app-color-text-secondary)]">必填</label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.editableInFill ?? false}
                  onChange={e => onPatchField({ editableInFill: e.target.checked })}
                  className="w-3 h-3 accent-[var(--app-color-accent)]"
                />
                <label className="text-[10px] text-[var(--app-color-text-secondary)]">填报可编辑</label>
              </div>

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
          <div className="border-t border-[var(--app-color-border)] pt-3">
            <h4 className="text-[10px] font-semibold text-[var(--app-color-text-secondary)] uppercase tracking-wider mb-1.5">单元格</h4>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className={labelClass}>列跨度</label>
                <input
                  type="number"
                  min={1}
                  value={referenceCell.colSpan}
                  onChange={e => onUpdateCell(referenceCell.id, { colSpan: Math.max(1, Number(e.target.value) || 1) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>行跨度</label>
                <input
                  type="number"
                  min={1}
                  value={referenceCell.rowSpan}
                  onChange={e => onUpdateCell(referenceCell.id, { rowSpan: Math.max(1, Number(e.target.value) || 1) })}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
