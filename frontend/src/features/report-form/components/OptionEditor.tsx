// components/OptionEditor.tsx — 弹窗模式
import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchOptionSets, createOptionSet } from '../api/reportForm.api';
import type { OptionSet } from '../types';

interface OptionItem {
  label: string;
  value: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  options: OptionItem[];
  optionSetId?: string;
  onChange: (options: OptionItem[]) => void;
  onOptionSetChange: (optionSetId: string | undefined, options: OptionItem[]) => void;
}

export default function OptionEditor({ open, onClose, options, optionSetId, onChange, onOptionSetChange }: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const qc = useQueryClient();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { data: optionSets = [] } = useQuery<OptionSet[]>({
    queryKey: ['report-form-option-sets'],
    queryFn: fetchOptionSets,
    staleTime: 30000,
  });

  const saveAsSetMut = useMutation({
    mutationFn: (name: string) =>
      createOptionSet(name, JSON.stringify(options.map(o => ({ label: o.label, sortOrder: 0 })))),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['report-form-option-sets'] });
      onOptionSetChange(String(created.id), options);
      setShowSaveInput(false);
      setSaveAsName('');
      toast.success('已存为选项集: ' + created.name);
    },
    onError: (e: Error) => toast.error('保存选项集失败: ' + e.message),
  });

  useEffect(() => {
    if (showSaveInput && nameInputRef.current) nameInputRef.current.focus();
  }, [showSaveInput]);

  // 添加行
  const addRow = useCallback(() => {
    onChange([...options, { label: '', value: '' }]);
  }, [options, onChange]);

  // 删除行
  const removeRow = useCallback((idx: number) => {
    onChange(options.filter((_, i) => i !== idx));
  }, [options, onChange]);

  // 更新行 — label 变更时自动生成 value
  const updateLabel = useCallback((idx: number, label: string) => {
    const next = options.map((o, i) => {
      if (i !== idx) return o;
      // 自动生成 value: 拼音简化（取首字母或直接用 label）
      const autoValue = label.trim() || '';
      return { label: label, value: o.value || autoValue };
    });
    onChange(next);
  }, [options, onChange]);

  const updateValue = useCallback((idx: number, value: string) => {
    const next = options.map((o, i) => i === idx ? { ...o, value } : o);
    onChange(next);
  }, [options, onChange]);

  // 拖拽排序
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...options];
    const [item] = next.splice(dragIdx, 1);
    next.splice(idx, 0, item);
    onChange(next);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  // 关联选项集
  const handleOptionSetSelect = (id: string) => {
    const set = optionSets.find(s => String(s.id) === id);
    if (set && set.itemsJson) {
      const items = Array.isArray(set.itemsJson) ? set.itemsJson : [];
      const opts = items.map((item: { label: string; sortOrder?: number }) => ({
        label: item.label,
        value: item.label,
      }));
      onOptionSetChange(id, opts);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center pt-[10vh]"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[520px] max-h-[70vh] flex flex-col rounded-[var(--app-radius-container)]
                      border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)]
                      shadow-xl"
           onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-color-border)] shrink-0">
          <span className="text-[13px] font-semibold text-[var(--app-color-text-primary)]">
            编辑选项
          </span>
          <button onClick={onClose}
            className="p-0.5 rounded-[4px] hover:bg-[var(--app-color-surface-hover)]">
            <X className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
          </button>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--app-color-border)] shrink-0 bg-[var(--app-color-surface-container)]">
          <button
            onClick={addRow}
            className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium
                       bg-[var(--app-color-accent)] text-white hover:opacity-90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> 添加选项
          </button>

          {/* 选项集快捷选择 */}
          <select
            value={optionSetId || ''}
            onChange={e => {
              if (e.target.value) handleOptionSetSelect(e.target.value);
              else onOptionSetChange(undefined, options);
            }}
            className="rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]
                       px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none
                       focus:border-[var(--app-color-accent)] max-w-[160px]"
          >
            <option value="">选择选项集模板</option>
            {optionSets.map(s => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>

          <div className="flex-1" />

          {/* 存为模板 */}
          {showSaveInput ? (
            <div className="flex items-center gap-1">
              <input
                ref={nameInputRef}
                type="text"
                value={saveAsName}
                onChange={e => setSaveAsName(e.target.value)}
                placeholder="选项集名称"
                className="w-[120px] rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]
                           px-1.5 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none
                           focus:border-[var(--app-color-accent)]"
                onKeyDown={e => {
                  if (e.key === 'Enter' && saveAsName.trim()) saveAsSetMut.mutate(saveAsName.trim());
                  if (e.key === 'Escape') { setShowSaveInput(false); setSaveAsName(''); }
                }}
              />
              <button
                onClick={() => saveAsName.trim() && saveAsSetMut.mutate(saveAsName.trim())}
                disabled={saveAsSetMut.isPending || !saveAsName.trim()}
                className="px-2 py-1 rounded-[4px] text-[10px] bg-[var(--app-color-accent)] text-white
                           hover:opacity-90 disabled:opacity-40"
              >
                确定
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveInput(true)}
              className="px-2 py-1 rounded-[6px] text-[10px] border border-dashed border-[var(--app-color-border)]
                         text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)]
                         hover:border-[var(--app-color-accent)] transition-colors"
            >
              存为模板
            </button>
          )}

          <button
            onClick={onClose}
            className="px-3 py-1 rounded-[6px] text-[11px] font-medium bg-[var(--app-color-accent)] text-white
                       hover:opacity-90 transition-colors"
          >
            完成
          </button>
        </div>

        {/* 选项列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 min-h-[120px]">
          {options.length === 0 ? (
            <p className="text-[11px] text-[var(--app-color-text-tertiary)] text-center py-8">
              暂无选项，点击"添加选项"创建
            </p>
          ) : (
            options.map((opt, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-1.5"
              >
                <div className="cursor-grab active:cursor-grabbing text-[var(--app-color-text-tertiary)] flex-shrink-0">
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  value={opt.label}
                  onChange={e => updateLabel(idx, e.target.value)}
                  placeholder="显示名称"
                  className="flex-1 rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]
                             px-2 py-1.5 text-[12px] text-[var(--app-color-text-primary)] outline-none
                             focus:border-[var(--app-color-accent)] min-w-0"
                />
                <input
                  type="text"
                  value={opt.value}
                  onChange={e => updateValue(idx, e.target.value)}
                  placeholder={opt.label || '自动生成'}
                  className="w-[100px] rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)]
                             px-2 py-1.5 text-[11px] text-[var(--app-color-text-tertiary)] outline-none
                             focus:border-[var(--app-color-accent)]"
                />
                <button
                  onClick={() => removeRow(idx)}
                  className="flex-shrink-0 p-1 rounded-[4px] text-[var(--app-color-text-tertiary)]
                             hover:text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]
                             transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
