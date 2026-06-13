import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { adminHttp } from '@/api/core/adminHttp';
import type { OptionSet } from '../types';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
}

const BASE = '/report-form/option-sets';

export default function OptionSetManager({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [items, setItems] = useState('');

  const { data: optionSets = [], isLoading } = useQuery({
    queryKey: ['report-form-option-sets'],
    queryFn: () => adminHttp.get(BASE).then(({ data }) => data.data as OptionSet[]),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: (body: { name: string; itemsJson: string }) =>
      adminHttp.post(BASE, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-form-option-sets'] });
      setName('');
      setItems('');
      toast.success('已创建');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminHttp.delete(`${BASE}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-form-option-sets'] });
      toast.success('已删除');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 800 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-elevated)] p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">
            选项集管理
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-[6px] hover:bg-[var(--app-color-surface-hover)]"
          >
            <X className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
          </button>
        </div>

        {/* Create form */}
        <div className="space-y-2 mb-4 p-3 rounded-[var(--app-radius-container)] border border-[var(--app-color-border)]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="选项集名称（如：设备状态）"
            className="w-full rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]"
          />
          <textarea
            value={items}
            onChange={(e) => setItems(e.target.value)}
            placeholder={'每行一个选项\n正常\n异常\n停用'}
            rows={4}
            className="w-full rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)] resize-none"
          />
          <button
            onClick={() => {
              if (!name.trim() || !items.trim()) {
                toast.error('请填写名称和选项');
                return;
              }
              const itemsJson = JSON.stringify(
                items
                  .split('\n')
                  .filter(Boolean)
                  .map((label, i) => ({ label: label.trim(), sortOrder: i })),
              );
              createMut.mutate({ name: name.trim(), itemsJson });
            }}
            disabled={createMut.isPending}
            className="px-3 py-1 rounded-[6px] text-[11px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            新增
          </button>
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)]">加载中...</p>
        ) : optionSets.length === 0 ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)]">暂无选项集，上方创建</p>
        ) : (
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {optionSets.map((os) => (
              <div
                key={os.id}
                className="flex items-start justify-between p-2 rounded-[6px] border border-[var(--app-color-border)]"
              >
                <div>
                  <div className="text-xs font-medium text-[var(--app-color-text-primary)]">
                    {os.name}
                  </div>
                  <div className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">
                    {os.itemsJson?.map((i) => i.label).join('、') || '无选项'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`删除选项集「${os.name}」？`)) {
                      deleteMut.mutate(os.id);
                    }
                  }}
                  className="p-1 rounded-[4px] hover:bg-[var(--app-color-feedback-danger-soft)] shrink-0"
                >
                  <Trash2 className="w-3 h-3 text-[var(--app-color-feedback-danger)]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  , document.body);
}
