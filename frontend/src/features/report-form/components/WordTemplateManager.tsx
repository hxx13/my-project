// components/WordTemplateManager.tsx — Word 打印模板管理
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWordTemplates, uploadWordTemplate, unbindWordTemplate, updateForm } from '../api/reportForm.api';
import { Upload, Trash2, X, FileText, Link } from 'lucide-react';
import type { WordTemplateBinding } from '../types';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  formId: number;
  fieldKeys: string[];
}

export default function WordTemplateManager({ open, onClose, formId, fieldKeys }: Props) {
  const qc = useQueryClient();
  const [mappingTemplate, setMappingTemplate] = useState<string | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const { data: templates = [], isLoading } = useQuery<WordTemplateBinding[]>({
    queryKey: ['report-form-word-templates', formId],
    queryFn: () => fetchWordTemplates(formId),
    enabled: open,
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadWordTemplate(formId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-form-word-templates', formId] });
      toast.success('模板上传成功');
    },
    onError: (e: Error) => toast.error('上传失败: ' + e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (wtId: string) => unbindWordTemplate(formId, wtId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-form-word-templates', formId] });
      toast.success('已解绑');
    },
    onError: (e: Error) => toast.error('解绑失败: ' + e.message),
  });

  if (!open) return null;

  const inputClass = "w-full rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";
  const labelClass = "text-[10px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block";

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 800 }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-elevated)] p-5 shadow-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">Word 打印模板</h2>
          <button onClick={onClose} className="p-1 rounded-[4px] hover:bg-[var(--app-color-surface-hover)]">
            <X className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
          </button>
        </div>

        {/* Upload */}
        <div className="mb-4">
          <label className={labelClass}>上传 .docx 模板</label>
          <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--app-radius-container)] border-2 border-dashed border-[var(--app-color-border)] hover:border-[var(--app-color-accent)] cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-[var(--app-color-text-tertiary)]" />
            <span className="text-[12px] text-[var(--app-color-text-secondary)]">
              {uploadMut.isPending ? '上传中...' : '选择 .docx 文件'}
            </span>
            <input type="file" accept=".docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); }} />
          </label>
        </div>

        {/* Template list */}
        {isLoading ? (
          <p className="text-[11px] text-[var(--app-color-text-tertiary)]">加载中...</p>
        ) : templates.length === 0 ? (
          <p className="text-[11px] text-[var(--app-color-text-tertiary)] text-center py-4">暂无模板</p>
        ) : (
          <div className="space-y-2">
            {templates.map(tmpl => (
              <div key={tmpl.id} className="p-3 rounded-[var(--app-radius-container)] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-[var(--app-color-accent)]" />
                    <span className="text-[12px] font-medium text-[var(--app-color-text-primary)]">{tmpl.name}</span>
                  </div>
                  <button onClick={() => deleteMut.mutate(tmpl.id)}
                    className="p-1 rounded-[4px] hover:bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)]">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                {tmpl.bookmarks && (
                  <div className="mt-2">
                    <div className="text-[10px] text-[var(--app-color-text-tertiary)] mb-1">
                      书签 ({tmpl.bookmarks.length})
                    </div>
                    {mappingTemplate === tmpl.id ? (
                      <div className="space-y-1.5">
                        {tmpl.bookmarks.map(bm => (
                          <div key={bm} className="flex items-center gap-2">
                            <Link className="w-3 h-3 text-[var(--app-color-text-tertiary)] shrink-0" />
                            <span className="text-[10px] text-[var(--app-color-text-secondary)] w-[100px] truncate">{bm}</span>
                            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">→</span>
                            <select
                              value={mappings[bm] || ''}
                              onChange={e => setMappings({ ...mappings, [bm]: e.target.value })}
                              className={inputClass}
                            >
                              <option value="">— 选择字段 —</option>
                              {fieldKeys.map(fk => (
                                <option key={fk} value={fk}>{fk}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => setMappingTemplate(null)}
                            className="px-3 py-1 rounded-[4px] text-[11px] border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                          >
                            取消
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const updated = templates.map(t =>
                                  t.id === tmpl.id ? { ...t, bookmarkMapping: mappings } : t
                                );
                                await updateForm(formId, { wordTemplateIdsJson: JSON.stringify(updated) });
                                toast.success('映射已保存');
                                setMappingTemplate(null);
                                qc.invalidateQueries({ queryKey: ['report-form-word-templates', formId] });
                              } catch (e) { toast.error('保存失败: ' + (e as Error).message); }
                            }}
                            className="px-3 py-1 rounded-[4px] text-[11px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90"
                          >
                            保存映射
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setMappingTemplate(tmpl.id);
                          setMappings(tmpl.bookmarkMapping || {});
                        }}
                        className="text-[10px] text-[var(--app-color-accent)] hover:underline mt-1"
                      >
                        配置字段映射
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  , document.body);
}
