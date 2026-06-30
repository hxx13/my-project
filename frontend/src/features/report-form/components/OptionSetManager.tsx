import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X, Pencil, Check } from 'lucide-react';
import { fetchOptionSets, createOptionSet, updateOptionSet, deleteOptionSet } from '../api/reportForm.api';
import type { OptionSet } from '../types';
import toast from 'react-hot-toast';
import { authStorage } from '@/features/auth/authStorage';
import { canManageOptionSet, formatOptionSetLabel, parseOptionSetItems, optionSetItemLabels } from '../utils/optionSetLabels';

interface Props {
  open: boolean;
  onClose: () => void;
  formId?: number;
}

export default function OptionSetManager({ open, onClose, formId }: Props) {
  const qc = useQueryClient();
  const currentUsername = authStorage.getUserInfo()?.username;
  const [name, setName] = useState('');
  const [items, setItems] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editItems, setEditItems] = useState('');

  const { data: optionSets = [], isLoading } = useQuery({
    queryKey: ['report-form-option-sets', formId ?? null],
    queryFn: () => fetchOptionSets(formId),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: (body: { name: string; itemsJson: string }) =>
      createOptionSet(body.name, body.itemsJson, 'user', formId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-form-option-sets'] });
      setName(''); setItems('');
      toast.success('已创建');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name: n, itemsJson }: { id: number; name: string; itemsJson: string }) =>
      updateOptionSet(id, n, itemsJson),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-form-option-sets'] });
      setEditingId(null);
      toast.success('已更新');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteOptionSet(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-form-option-sets'] });
      toast.success('已删除');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const buildItemsJson = (text: string) =>
    JSON.stringify(text.split('\n').filter(Boolean).map((label, i) => ({ label: label.trim(), sortOrder: i })));

  const startEdit = (os: OptionSet) => {
    setEditingId(os.id);
    setEditName(os.name);
    const items = parseOptionSetItems(os.itemsJson);
    setEditItems(items.map(i => i.label).join('\n'));
  };

  if (!open) return null;

  const inputClass = "w-full rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 800 }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-elevated)] p-5 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">选项集管理</h2>
          <button onClick={onClose} className="p-1 rounded-[6px] hover:bg-[var(--app-color-surface-hover)]">
            <X className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
          </button>
        </div>

        {/* Create form */}
        <div className="space-y-2 mb-4 p-3 rounded-[var(--app-radius-container)] border border-[var(--app-color-border)]">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="选项集名称（如：设备状态）" className={inputClass} />
          <textarea value={items} onChange={e => setItems(e.target.value)} placeholder={'每行一个选项\n正常\n异常\n停用'} rows={4} className={`${inputClass} resize-none`} />
          <button
            onClick={() => {
              if (!name.trim() || !items.trim()) { toast.error('请填写名称和选项'); return; }
              createMut.mutate({ name: name.trim(), itemsJson: buildItemsJson(items) });
            }}
            disabled={createMut.isPending}
            className="px-3 py-1 rounded-[6px] text-[11px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
            <Plus className="w-3 h-3" /> 新增
          </button>
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)]">加载中...</p>
        ) : optionSets.length === 0 ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)]">暂无选项集，上方创建</p>
        ) : (
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {optionSets.map(os => (
              <div key={os.id} className="flex items-start justify-between p-2 rounded-[6px] border border-[var(--app-color-border)]">
                {editingId === os.id ? (
                  <div className="flex-1 space-y-1.5 mr-2">
                    <input value={editName} onChange={e => setEditName(e.target.value)} className={inputClass} />
                    <textarea value={editItems} onChange={e => setEditItems(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
                    <div className="flex gap-1">
                      <button onClick={() => {
                        if (!editName.trim() || !editItems.trim()) { toast.error('请填写名称和选项'); return; }
                        updateMut.mutate({ id: os.id, name: editName.trim(), itemsJson: buildItemsJson(editItems) });
                      }} disabled={updateMut.isPending}
                        className="px-2 py-0.5 rounded-[4px] text-[10px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90 flex items-center gap-1">
                        <Check className="w-3 h-3" /> 保存
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-2 py-0.5 rounded-[4px] text-[10px] border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="text-xs font-medium text-[var(--app-color-text-primary)]">
                        {formatOptionSetLabel(os, currentUsername)}
                      </div>
                      <div className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">
                        {optionSetItemLabels(os.itemsJson) || '无选项'}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {canManageOptionSet(os, currentUsername) && (
                        <>
                          <button onClick={() => startEdit(os)}
                            className="p-1 rounded-[4px] hover:bg-[var(--app-color-surface-hover)]">
                            <Pencil className="w-3 h-3 text-[var(--app-color-text-tertiary)]" />
                          </button>
                          <button onClick={() => { if (confirm(`删除预设「${os.name}」？`)) deleteMut.mutate(os.id); }}
                            className="p-1 rounded-[4px] hover:bg-[var(--app-color-feedback-danger-soft)]">
                            <Trash2 className="w-3 h-3 text-[var(--app-color-feedback-danger)]" />
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  , document.body);
}
