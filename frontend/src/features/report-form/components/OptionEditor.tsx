// components/OptionEditor.tsx — 绑定预设后只改预设，全表引用自动同步
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical, X, BookmarkPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  fetchOptionSets, fetchOptionSetById,
  createOptionSet, updateOptionSet, deleteOptionSet,
} from '../api/reportForm.api';
import type { FieldType } from '../types';
import { authStorage } from '@/features/auth/authStorage';
import { canManageOptionSet, formatOptionSetLabel, parseOptionSetItems } from '../utils/optionSetLabels';
import type { OptionItem } from '../utils/optionSetResolve';

import { appConfirm } from "@/lib/appDialog";
function normalizeOptions(items: OptionItem[]): OptionItem[] {
  return items
    .map(o => {
      const label = o.label.trim();
      return { label, value: label };
    })
    .filter(o => o.label.length > 0);
}

function optionsToItemsJson(items: OptionItem[]): string {
  return JSON.stringify(
    normalizeOptions(items).map((o, i) => ({ label: o.label, sortOrder: i })),
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  formId?: number;
  optionSetId?: string;
  inlineOptions?: OptionItem[];
  fieldType?: FieldType;
  onBindPreset: (id: string) => void;
  onUnbindPreset: () => void;
  onInlineOptionsChange: (options: OptionItem[]) => void;
  onPresetUpdated?: () => void;
}

export default function OptionEditor({
  open,
  onClose,
  formId,
  optionSetId,
  inlineOptions = [],
  fieldType = 'SELECT',
  onBindPreset,
  onUnbindPreset,
  onInlineOptionsChange,
  onPresetUpdated,
}: Props) {
  const [draft, setDraft] = useState<OptionItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const qc = useQueryClient();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isMulti = fieldType === 'MULTI_SELECT';
  const bound = Boolean(optionSetId);

  const currentUsername = authStorage.getUserInfo()?.username;

  const { data: optionSets = [] } = useQuery({
    queryKey: ['report-form-option-sets', formId ?? null],
    queryFn: () => fetchOptionSets(formId),
    staleTime: 30_000,
    enabled: open,
  });

  const { data: boundPreset } = useQuery({
    queryKey: ['report-form-option-set', optionSetId ?? ''],
    queryFn: () => fetchOptionSetById(Number(optionSetId)),
    enabled: open && Boolean(optionSetId),
    staleTime: 0,
  });

  const selectedPreset = useMemo(
    () => (optionSetId ? optionSets.find(s => String(s.id) === optionSetId) ?? boundPreset : undefined),
    [optionSetId, optionSets, boundPreset],
  );

  const canDeletePreset = selectedPreset != null && canManageOptionSet(selectedPreset, currentUsername);

  useEffect(() => {
    if (!open) {
      setDirty(false);
      return;
    }
    if (!optionSetId) {
      setDraft(inlineOptions);
      setDirty(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !optionSetId || !boundPreset || dirty) return;
    const opts = parseOptionSetItems(boundPreset.itemsJson).map(i => ({
      label: i.label,
      value: i.label,
    }));
    setDraft(opts);
  }, [open, optionSetId, boundPreset, dirty]);

  const invalidatePreset = useCallback((id: string | number) => {
    qc.invalidateQueries({ queryKey: ['report-form-option-set', String(id)] });
    qc.invalidateQueries({ queryKey: ['report-form-option-sets'] });
    onPresetUpdated?.();
  }, [qc, onPresetUpdated]);

  const savePresetMut = useMutation({
    mutationFn: () => {
      if (!optionSetId || !selectedPreset) throw new Error('未绑定预设');
      return updateOptionSet(
        Number(optionSetId),
        selectedPreset.name,
        optionsToItemsJson(draft),
      );
    },
    onSuccess: () => {
      if (optionSetId) invalidatePreset(optionSetId);
      setDirty(false);
      toast.success('预设已更新，所有引用格子已同步');
    },
    onError: (e: Error) => toast.error('更新预设失败: ' + e.message),
  });

  const saveAsSetMut = useMutation({
    mutationFn: (name: string) =>
      createOptionSet(name, optionsToItemsJson(draft), 'user', formId),
    onSuccess: (created) => {
      invalidatePreset(created.id);
      onBindPreset(String(created.id));
      setShowSaveInput(false);
      setSaveAsName('');
      setDirty(false);
      toast.success('已创建预设: ' + created.name);
    },
    onError: (e: Error) => toast.error('保存预设失败: ' + e.message),
  });

  const deletePresetMut = useMutation({
    mutationFn: (id: number) => deleteOptionSet(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-form-option-sets'] });
      setDraft([]);
      setDirty(false);
      setShowSaveInput(false);
      setSaveAsName('');
      onUnbindPreset();
      toast.success('预设已删除');
    },
    onError: (e: Error) => toast.error('删除预设失败: ' + e.message),
  });

  useEffect(() => {
    if (showSaveInput && nameInputRef.current) nameInputRef.current.focus();
  }, [showSaveInput]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const patchDraft = useCallback((next: OptionItem[]) => {
    setDraft(next);
    setDirty(true);
    if (!bound) {
      onInlineOptionsChange(normalizeOptions(next));
    }
  }, [bound, onInlineOptionsChange]);

  const addRow = () => patchDraft([...draft, { label: '', value: '' }]);

  const removeRow = (idx: number) => patchDraft(draft.filter((_, i) => i !== idx));

  const updateLabel = (idx: number, label: string) => {
    patchDraft(draft.map((o, i) => (i === idx ? { label, value: label.trim() } : o)));
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...draft];
    const [item] = next.splice(dragIdx, 1);
    next.splice(idx, 0, item);
    patchDraft(next);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const handleOptionSetSelect = (id: string) => {
    if (!id) {
      if (bound) {
        setDraft([]);
        setDirty(false);
        setShowSaveInput(false);
        setSaveAsName('');
        onUnbindPreset();
      }
      return;
    }
    onBindPreset(id);
    setDirty(false);
    setShowSaveInput(false);
    setSaveAsName('');
  };

  const handleDeletePreset = async () => {
    if (!selectedPreset || !canDeletePreset) return;
    if (!await appConfirm(`删除预设「${selectedPreset.name}」？引用该预设的格子将变为未绑定。`)) return;
    deletePresetMut.mutate(selectedPreset.id);
  };

  const handleDone = async () => {
    if (bound && dirty) {
      try {
        await savePresetMut.mutateAsync();
      } catch {
        return;
      }
    }
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4
                 bg-[var(--app-color-overlay)]/40"
      onClick={(e) => { if (e.target === e.currentTarget) void handleDone(); }}
    >
      <div
        className="w-full max-w-[520px] max-h-[min(80vh,640px)] flex flex-col rounded-[var(--app-radius-container)]
                   border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)]
                   shadow-xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="option-editor-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-color-border)] shrink-0">
          <div>
            <span id="option-editor-title" className="text-[13px] font-semibold text-[var(--app-color-text-primary)]">
              {isMulti ? '编辑多选选项' : '编辑下拉选项'}
            </span>
            <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">
              {bound
                ? '已绑定预设，保存后引用该预设的格子会一起更新'
                : '未绑定预设时仅影响当前格子，可新建预设供多格复用'}
            </p>
          </div>
          <button type="button" onClick={() => void handleDone()}
            className="p-0.5 rounded-[4px] hover:bg-[var(--app-color-surface-hover)]">
            <X className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--app-color-border)] flex-wrap">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium
                         bg-[var(--app-color-accent)] text-white hover:opacity-90 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> 新增选项
            </button>

            <button
              type="button"
              onClick={() => setShowSaveInput(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium shrink-0
                         border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)]
                         hover:bg-[var(--app-color-surface-hover)] transition-colors"
            >
              <BookmarkPlus className="w-3.5 h-3.5" /> 新增预设
            </button>

            <div className="flex items-center gap-1 flex-1 min-w-[200px]">
              <select
                value={optionSetId || ''}
                onChange={e => handleOptionSetSelect(e.target.value)}
                className="flex-1 min-w-0 rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]
                           px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none
                           focus:border-[var(--app-color-accent)]"
              >
                <option value="">{bound ? '无预设（本格独立选项）' : '选择已有预设'}</option>
                {optionSets.map(s => (
                  <option key={s.id} value={String(s.id)}>
                    {formatOptionSetLabel(s, currentUsername)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleDeletePreset}
                disabled={!canDeletePreset || deletePresetMut.isPending}
                title={canDeletePreset ? '删除当前预设' : '仅可删除自己保存的预设'}
                className="shrink-0 p-1.5 rounded-[6px] border border-[var(--app-color-border)]
                           text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)]
                           hover:border-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]
                           disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {showSaveInput && (
              <div className="flex items-center gap-1 w-full">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={saveAsName}
                  onChange={e => setSaveAsName(e.target.value)}
                  placeholder="新预设名称"
                  className="flex-1 rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]
                             px-1.5 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none
                             focus:border-[var(--app-color-accent)]"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && saveAsName.trim()) saveAsSetMut.mutate(saveAsName.trim());
                    if (e.key === 'Escape') { setShowSaveInput(false); setSaveAsName(''); }
                  }}
                />
                <button
                  type="button"
                  onClick={() => saveAsName.trim() && saveAsSetMut.mutate(saveAsName.trim())}
                  disabled={saveAsSetMut.isPending || !saveAsName.trim()}
                  className="px-2 py-1 rounded-[4px] text-[10px] bg-[var(--app-color-accent)] text-white
                             hover:opacity-90 disabled:opacity-40"
                >
                  创建
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSaveInput(false); setSaveAsName(''); }}
                  className="px-2 py-1 rounded-[4px] text-[10px] border border-[var(--app-color-border)]
                             text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                >
                  取消
                </button>
              </div>
            )}
          </div>

          <div className="px-4 py-2">
            {draft.length === 0 ? (
              <p className="text-[11px] text-[var(--app-color-text-tertiary)] text-center py-8">
                暂无选项，点击「新增选项」开始编写
              </p>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 px-1 pb-1 text-[10px] text-[var(--app-color-text-tertiary)]">
                  <span className="w-5 shrink-0" />
                  <span className="flex-1">选项名称（显示与存储一致）</span>
                  <span className="w-7 shrink-0" />
                </div>
                {draft.map((opt, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-1.5 rounded-[6px] px-1 py-0.5 transition-colors ${
                      dragIdx === idx ? 'bg-[var(--app-color-accent-soft)]' : 'hover:bg-[var(--app-color-surface-hover)]'
                    }`}
                  >
                    <div className="cursor-grab active:cursor-grabbing text-[var(--app-color-text-tertiary)] shrink-0">
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={opt.label}
                      onChange={e => updateLabel(idx, e.target.value)}
                      placeholder={`选项 ${idx + 1}`}
                      className="flex-1 rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]
                                 px-2 py-1.5 text-[12px] text-[var(--app-color-text-primary)] outline-none
                                 focus:border-[var(--app-color-accent)] min-w-0"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="shrink-0 p-1 rounded-[4px] text-[var(--app-color-text-tertiary)]
                                 hover:text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]
                                 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 py-3 border-t border-[var(--app-color-border)] flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleDone()}
            disabled={savePresetMut.isPending}
            className="px-4 py-1.5 rounded-[6px] text-[11px] font-medium bg-[var(--app-color-accent)] text-white
                       hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {savePresetMut.isPending ? '保存中…' : bound && dirty ? '保存并同步' : '完成'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
