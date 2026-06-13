// ColumnConfigPanel — side panel for column CRUD + type switching
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateSheet } from '@/api/domains/smartsheet.api';
import type { ColumnConfig, ColumnType } from '@/features/smartsheet/types';
import toast from 'react-hot-toast';
import { Plus, Trash2, X } from 'lucide-react';

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'checkbox', label: '复选框' },
  { value: 'select', label: '下拉选择' },
  { value: 'multi-select', label: '多选' },
  { value: 'radio', label: '单选' },
  { value: 'date', label: '日期' },
  { value: 'progressbar', label: '进度条' },
  { value: 'user', label: '用户' },
];

interface Props {
  sheetId: string;
  columns: ColumnConfig[];
  open: boolean;
  onClose: () => void;
  onChange: () => void;
}

export default function ColumnConfigPanel({ sheetId, columns, open, onClose, onChange }: Props) {
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('text');
  const queryClient = useQueryClient();

  const mutate = useMutation({
    mutationFn: (cols: ColumnConfig[]) => updateSheet(sheetId, { columnsConfig: cols }),
    onSuccess: () => { onChange(); queryClient.invalidateQueries({ queryKey: ['smartsheet', sheetId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) return null;

  const handleAdd = () => {
    if (!newColName.trim()) { toast('请输入列名'); return; }
    const key = `col_${Date.now()}`;
    mutate.mutate([...columns, { key, label: newColName.trim(), type: newColType, width: 120 }]);
    setNewColName('');
  };

  const handleDelete = (colKey: string) => {
    if (!confirm('删除此列？已有数据将保留在数据库中但不再显示。')) return;
    mutate.mutate(columns.filter(c => c.key !== colKey));
  };

  const handleUpdate = (colKey: string, patch: Partial<ColumnConfig>) => {
    mutate.mutate(columns.map(c => c.key === colKey ? { ...c, ...patch } : c));
  };

  const handleOptions = (colKey: string, optionsStr: string) => {
    const options = optionsStr.split(',').map(s => s.trim()).filter(Boolean);
    handleUpdate(colKey, { options });
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[320px] bg-app-surface-container border-l border-app-border shadow-lg z-[var(--z-modal)] flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-app-border">
        <span className="font-semibold text-sm text-app-text-primary">列配置</span>
        <div className="flex-1" />
        <button onClick={onClose} className="p-1 rounded hover:bg-app-surface-hover"><X className="w-4 h-4" /></button>
      </div>

      {/* Add new column */}
      <div className="p-3 border-b border-app-border flex gap-2">
        <input value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="新列名称" className="flex-1 px-2 py-1 text-xs rounded border border-app-border bg-app-surface-page" />
        <select value={newColType} onChange={e => setNewColType(e.target.value as ColumnType)}
          className="px-2 py-1 text-xs rounded border border-app-border bg-app-surface-page">
          {COLUMN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={handleAdd} className="px-3 py-1 rounded text-xs font-medium bg-app-accent text-white"><Plus className="w-3.5 h-3.5" /></button>
      </div>

      {/* Column list */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {columns.map(col => (
          <div key={col.key} className="p-3 rounded-[10px] border border-app-border bg-app-surface-page">
            <div className="flex items-center gap-2 mb-2">
              <input value={col.label} onChange={e => handleUpdate(col.key, { label: e.target.value })}
                className="flex-1 px-2 py-1 text-xs font-medium rounded border border-app-border bg-app-surface-container" />
              <select value={col.type} onChange={e => handleUpdate(col.key, { type: e.target.value as ColumnType })}
                className="px-2 py-1 text-xs rounded border border-app-border bg-app-surface-container">
                {COLUMN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button onClick={() => handleDelete(col.key)} className="p-1 rounded hover:bg-app-feedback-danger-soft">
                <Trash2 className="w-3.5 h-3.5 text-app-feedback-danger" />
              </button>
            </div>
            {(col.type === 'select' || col.type === 'multi-select' || col.type === 'radio') && (
              <input value={(col.options ?? []).join(', ')}
                onChange={e => handleOptions(col.key, e.target.value)}
                placeholder="选项，逗号分隔" className="w-full px-2 py-1 text-xs rounded border border-app-border bg-app-surface-container" />
            )}
          </div>
        ))}
        {columns.length === 0 && <div className="text-xs text-app-text-secondary text-center py-4">暂无列，请添加</div>}
      </div>
    </div>
  );
}
