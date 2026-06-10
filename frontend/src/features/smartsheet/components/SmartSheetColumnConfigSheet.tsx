// frontend/src/features/smartsheet/components/SmartSheetColumnConfigSheet.tsx
import React, { useState } from 'react';
import type { ColumnConfig, ColumnType } from '@/features/smartsheet/types';

interface ColumnConfigSheetProps {
  column: ColumnConfig | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: ColumnConfig) => void;
  onDelete: (colKey: string) => void;
}

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '单选下拉' },
  { value: 'multi-select', label: '多选' },
  { value: 'date', label: '日期' },
  { value: 'checkbox', label: '勾选框' },
  { value: 'user', label: '人员' },
];

export default function SmartSheetColumnConfigSheet({
  column, open, onClose, onSave, onDelete,
}: ColumnConfigSheetProps) {
  const [draft, setDraft] = useState<ColumnConfig | null>(null);

  React.useEffect(() => { setDraft(column ? { ...column } : null); }, [column]);

  if (!open || !draft) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[360px] bg-app-surface-elevated border-l border-app-border shadow-lg p-5 overflow-y-auto"
         style={{ zIndex: 'var(--z-modal)' }}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-app-text-primary">列配置</h3>
        <button onClick={onClose} className="text-app-text-tertiary hover:text-app-text-primary">✕</button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-app-text-secondary">列名称</label>
          <input className="w-full mt-1 px-2 py-1.5 rounded-app-element border border-app-border bg-app-surface-container text-sm text-app-text-primary"
                 value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </div>

        <div>
          <label className="text-xs text-app-text-secondary">列类型</label>
          <select className="w-full mt-1 px-2 py-1.5 rounded-app-element border border-app-border bg-app-surface-container text-sm text-app-text-primary"
                  value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ColumnType })}>
            {COLUMN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {(draft.type === 'select' || draft.type === 'multi-select') && (
          <div>
            <label className="text-xs text-app-text-secondary">预设选项</label>
            <div className="mt-1 space-y-1">
              {(draft.options || []).map((opt, i) => (
                <div key={i} className="flex gap-1">
                  <input className="flex-1 px-2 py-1 rounded-app-element border border-app-border bg-app-surface-container text-sm text-app-text-primary"
                         value={opt} onChange={(e) => {
                           const opts = [...(draft.options || [])];
                           opts[i] = e.target.value;
                           setDraft({ ...draft, options: opts });
                         }} />
                  <button className="text-app-feedback-danger hover:opacity-80 text-xs px-1"
                          onClick={() => {
                            setDraft({ ...draft, options: (draft.options || []).filter((_, j) => j !== i) });
                          }}>✕</button>
                </div>
              ))}
              <button className="text-xs text-app-accent hover:text-app-accent-hover"
                      onClick={() => setDraft({ ...draft, options: [...(draft.options || []), ''] })}>
                + 添加选项
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input type="checkbox" checked={draft.required || false}
                 onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
          <label className="text-xs text-app-text-secondary">必填</label>
        </div>

        <div className="flex gap-2 pt-4">
          <button onClick={() => { onSave(draft); onClose(); }}
                  className="flex-1 py-1.5 rounded-app-element bg-app-accent text-app-text-inverse text-sm font-medium hover:bg-app-accent-hover">保存</button>
          <button onClick={() => { onDelete(draft.key); onClose(); }}
                  className="px-3 py-1.5 rounded-app-element border border-app-feedback-danger text-app-feedback-danger text-sm hover:bg-app-feedback-danger-soft">删除列</button>
        </div>
      </div>
    </div>
  );
}
