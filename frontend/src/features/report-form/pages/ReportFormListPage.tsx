// ReportFormListPage — 填报报表管理列表
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet, Plus, Trash2, Copy, Pencil, Eye, MoreVertical, Upload,
  Printer, Link, Pin, PinOff, FileJson, FileText, Send, RefreshCw, FileUp, Settings2,
} from 'lucide-react';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import {
  fetchFormPage, deleteForm, batchDeleteForms, renameForm,
  duplicateForm, publishForm, unpublishForm, saveAsTemplate,
  createFormFromExcel, createBlankForm, archiveForm, unarchiveForm, fetchVersions,
  fetchTemplates, updateForm, createFormFromWord, togglePin,
} from '../api/reportForm.api';
import { createFromTemplate, exportPdf } from '../api/reportFill.api';
import FormExportActions from '../components/FormExportActions';
import PublishWizard from '../components/PublishWizard';
import type { ReportFormDefinition } from '../types';
import { formatDateTimeAsiaShanghaiShort, compareApiDateTime } from '@/lib/formatDateTimeAsiaShanghai';
import toast from 'react-hot-toast';

export default function ReportFormListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['report-form-list'],
    queryFn: () => fetchFormPage(),
  });

  if (error) {
    console.error('🔥 [LIST] 列表加载失败:', error);
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['report-form-list'] });
    queryClient.invalidateQueries({ queryKey: ['report-fill-available'] });
  };

  const createBlankMut = useMutation({
    mutationFn: createBlankForm,
    onSuccess: (form) => {
      invalidate();
      navigate(`/admin/report-form/${form.id}/design`);
      toast.success('已创建空白报表');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createFromExcelMut = useMutation({
    mutationFn: (file: File) => createFormFromExcel(file),
    onSuccess: (form) => {
      invalidate();
      navigate(`/admin/report-form/${form.id}/design`);
      toast.success('已从 Excel 创建报表');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteForm,
    onSuccess: () => { invalidate(); toast.success('已删除'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: batchDeleteForms,
    onSuccess: () => { invalidate(); setSelected(new Set()); toast.success('批量删除完成'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameForm(id, name),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: duplicateForm,
    onSuccess: () => { invalidate(); toast.success('已复制'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: publishForm,
    onSuccess: () => { invalidate(); toast.success('已重新发布（沿用上次发布条件）'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unpublishMut = useMutation({
    mutationFn: unpublishForm,
    onSuccess: () => { invalidate(); toast.success('已撤回'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTemplateMut = useMutation({
    mutationFn: (id: number) => saveAsTemplate(id, true),
    onSuccess: () => { invalidate(); toast.success('已保存为模板'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: archiveForm,
    onSuccess: () => { invalidate(); toast.success('已归档'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unarchiveMut = useMutation({
    mutationFn: unarchiveForm,
    onSuccess: () => { invalidate(); toast.success('已取消归档'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePinMut = useMutation({
    mutationFn: togglePin,
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [publishWizardFormId, setPublishWizardFormId] = useState<number | null>(null);
  const [publishWizardIntent, setPublishWizardIntent] = useState<'initial' | 'reset'>('initial');
  const [versionFormId, setVersionFormId] = useState<number | null>(null);
  const [versions, setVersions] = useState<unknown[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templates, setTemplates] = useState<ReportFormDefinition[]>([]);

  const handleExcelCreate = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) createFromExcelMut.mutate(file);
    };
    input.click();
  };

  const handleWordCreate = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx,.doc';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      toast.promise(
        createFormFromWord(file).then(form => {
          invalidate();
          navigate(`/admin/report-form/${form.id}/design`);
        }),
        { loading: '导入中...', success: '已从 Word 创建（已绑定打印模板，书签格已转为可编辑字段）', error: 'Word 导入失败' },
      );
    };
    input.click();
  };

  const openForm = (form: ReportFormDefinition) => {
    navigate(`/admin/report-form/${form.id}/design`);
  };

  // 后端可能返回数组或 PageResult 对象，兼容两者
  const rawList: ReportFormDefinition[] = Array.isArray(data) ? data : ((data as unknown as { list?: ReportFormDefinition[] })?.list ?? []);
  const filtered = rawList
    .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()))
    .filter(f => statusFilter === 'all' || f.status === statusFilter)
    .sort((a, b) => (a.pinned && b.pinned) ? 0 : a.pinned ? -1 : b.pinned ? 1 : 0);

  return (
    <AdminPageShell>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          placeholder="搜索报表..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-[320px] px-3 py-1.5 rounded-[var(--app-radius-container)] border border-app-border bg-app-surface-container text-sm text-app-text-primary outline-none focus:border-app-accent transition-colors"
        />
        {['all', 'draft', 'published', 'archived'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-2 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium transition-colors ${
              statusFilter === s ? 'bg-app-accent text-white' : 'border border-app-border text-app-text-secondary hover:bg-app-surface-hover'
            }`}>
            {s === 'all' ? '全部' : s === 'draft' ? '草稿' : s === 'published' ? '已发布' : '已归档'}
          </button>
        ))}
        <button
          onClick={handleExcelCreate}
          disabled={createFromExcelMut.isPending}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium bg-app-accent text-white hover:opacity-90 flex items-center gap-1 disabled:opacity-50 transition-opacity"
        >
          <FileUp className="w-3.5 h-3.5" />
          {createFromExcelMut.isPending ? '导入中...' : 'Excel 导入'}
        </button>
        {selected.size === 1 && (() => {
          const form = rawList.find(f => f.id === [...selected][0]);
          if (!form) return null;
          return (
            <FormExportActions
              form={form}
              context="admin-template"
              buttonClassName="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-app-border hover:bg-app-surface-hover flex items-center gap-1 transition-colors"
            />
          );
        })()}
        <button
          onClick={handleWordCreate}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-app-border hover:bg-app-surface-hover flex items-center gap-1 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" /> Word 创建
        </button>
        <button
          onClick={() => createBlankMut.mutate()}
          disabled={createBlankMut.isPending}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-app-border hover:bg-app-surface-hover flex items-center gap-1 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> 空白报表
        </button>
        <button
          onClick={async () => {
            try { setTemplates(await fetchTemplates()); } catch { setTemplates([]); }
            setShowTemplateDialog(true);
          }}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-app-border hover:bg-app-surface-hover flex items-center gap-1 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" /> 从模板
        </button>
        {/* JSON 导入 */}
        <label className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-app-border hover:bg-app-surface-hover flex items-center gap-1 cursor-pointer transition-colors">
          <Upload className="w-3.5 h-3.5" /> 导入JSON
          <input type="file" accept=".json" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                const json = JSON.parse(reader.result as string);
                // 先创建空白表单，再更新内容
                const created = await createBlankForm();
                await updateForm(created.id, {
                  name: json.name || created.name,
                  layoutJson: json.layoutJson || json.layout_json,
                  themeJson: json.themeJson || json.theme_json,
                  permissionJson: json.permissionJson || json.permission_json,
                  scheduleJson: json.scheduleJson || json.schedule_json,
                  fillPolicyJson: json.fillPolicyJson || json.fill_policy_json,
                });
                invalidate();
                toast.success('已导入');
              } catch (ex) { toast.error('JSON 格式错误: ' + (ex as Error).message); }
            };
            reader.readAsText(f);
          }} />
        </label>
        {/* JSON 导出选中 */}
        {selected.size > 0 && (
          <button onClick={() => {
            const form = rawList.find(f => f.id === [...selected][0]);
            if (!form) return;
            const blob = new Blob([JSON.stringify(form, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (form.name || 'report-form') + '.json';
            a.click();
            toast.success('已导出 JSON');
          }}
            className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-app-border hover:bg-app-surface-hover flex items-center gap-1">
            <FileJson className="w-3.5 h-3.5" /> 导出JSON
          </button>
        )}
        {/* 打印选中 */}
        {selected.size === 1 && (
          <button onClick={() => exportPdf([...selected][0])}
            className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-app-border hover:bg-app-surface-hover flex items-center gap-1">
            <Printer className="w-3.5 h-3.5" /> 打印
          </button>
        )}
        {selected.size > 0 && (
          <button
            onClick={() => {
              if (confirm(`确定删除 ${selected.size} 个报表？`)) {
                bulkDeleteMut.mutate([...selected]);
              }
            }}
            className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium bg-app-feedback-danger text-white hover:opacity-90 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> 删除选中 ({selected.size})
          </button>
        )}
      </div>

      <div className="max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px] overflow-y-auto">
        {error ? (
          <div className="p-4 rounded-[var(--app-radius-container)] bg-[var(--app-color-feedback-danger-soft)] text-sm text-[var(--app-color-feedback-danger)]">
            加载失败: {String(error)}
          </div>
        ) : isLoading ? (
          <div className="text-sm text-app-text-tertiary py-4">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-app-text-tertiary py-4">暂无报表，从 Excel 创建或新建空白报表</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map(form => (
              <FormRow
              key={form.id}
              form={form}
              selected={selected.has(form.id)}
              onToggleSel={() => setSelected(prev => {
                const next = new Set(prev);
                next.has(form.id) ? next.delete(form.id) : next.add(form.id);
                return next;
              })}
              onOpen={() => openForm(form)}
              onEdit={() => navigate(`/admin/report-form/${form.id}/design`)}
              onDelete={() => {
                if (confirm(`确定删除「${form.name}」？`)) deleteMut.mutate(form.id);
              }}
              onRename={name => renameMut.mutate({ id: form.id, name })}
              onDuplicate={() => duplicateMut.mutate(form.id)}
              onPublish={() => {
                setPublishWizardIntent('initial');
                setPublishWizardFormId(form.id);
              }}
              onRepublish={() => publishMut.mutate(form.id)}
              onResetPublishConditions={() => {
                setPublishWizardIntent('reset');
                setPublishWizardFormId(form.id);
              }}
              onUnpublish={() => unpublishMut.mutate(form.id)}
              onSaveTemplate={() => saveTemplateMut.mutate(form.id)}
              onArchive={() => archiveMut.mutate(form.id)}
              onUnarchive={() => unarchiveMut.mutate(form.id)}
              onTogglePin={() => togglePinMut.mutate(form.id)}
              onViewVersions={async () => {
                setVersionFormId(form.id);
                try { setVersions(await fetchVersions(form.id) || []); } catch { setVersions([]); }
              }}
              onPreview={() => navigate(`/admin/report-fill/${form.id}`)}
              status={form.status}
            />
          ))}
          </div>
        )}
      </div>
      {/* PublishWizard modal */}
      {publishWizardFormId && (() => {
        const form = rawList.find(f => f.id === publishWizardFormId);
        let layout = { cells: [], fields: {}, mergeGroups: [] };
        if (form?.layoutJson) {
          if (typeof form.layoutJson === 'string') {
            try { layout = JSON.parse(form.layoutJson); } catch { /* use default */ }
          } else {
            layout = form.layoutJson as unknown as typeof layout;
          }
        }
        return (
          <PublishWizard
            open={true}
            onClose={() => setPublishWizardFormId(null)}
            formId={publishWizardFormId}
            layout={layout}
            intent={publishWizardIntent}
            onPublished={invalidate}
            initialFillPolicy={(() => {
              const raw = form?.fillPolicyJson;
              if (!raw) return { mode: 'shared' as const, submitLabel: '提交', allowEditAfterSubmit: true };
              if (typeof raw === 'string') {
                try { return JSON.parse(raw); } catch { return { mode: 'shared' as const, submitLabel: '提交', allowEditAfterSubmit: true }; }
              }
              return raw as { mode: 'shared' | 'individual'; submitLabel: string; allowEditAfterSubmit: boolean; allowMultipleInstances?: boolean };
            })()}
            initialPermission={(() => {
              const raw = form?.permissionJson;
              if (!raw) return { visibleRoles: ['STAFF'], visibleUserIds: [], fieldRoleBindings: {}, allowUnboundView: true };
              if (typeof raw === 'string') {
                try { return JSON.parse(raw); } catch { return { visibleRoles: ['STAFF'], visibleUserIds: [], fieldRoleBindings: {}, allowUnboundView: true }; }
              }
              return raw;
            })()}
            initialSchedule={(() => {
              const raw = form?.scheduleJson;
              if (!raw) return { period: 'manual' as const };
              if (typeof raw === 'string') {
                try { return JSON.parse(raw); } catch { return { period: 'manual' as const }; }
              }
              return raw;
            })()}
          />
        );
      })()}

      {/* Template selection dialog */}
      {showTemplateDialog && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTemplateDialog(false)}>
          <div className="w-full max-w-md rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-elevated)] p-5 shadow-lg max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">从模板创建</h2>
              <button onClick={() => setShowTemplateDialog(false)} className="p-1 rounded-[4px] hover:bg-[var(--app-color-surface-hover)]">
                <span className="text-[var(--app-color-text-secondary)]">✕</span>
              </button>
            </div>
            {templates.length === 0 ? (
              <p className="text-xs text-[var(--app-color-text-tertiary)] text-center py-4">
                暂无可用模板。在设计器中打开一个表单，点击"保存为模板"来创建。
              </p>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <button key={t.id}
                    onClick={async () => {
                      try {
                        const created = await createFromTemplate(t.id);
                        invalidate();
                        setShowTemplateDialog(false);
                        navigate(`/admin/report-form/${created.id}/design`);
                        toast.success('已从模板创建');
                      } catch (e) { toast.error('创建失败: ' + (e as Error).message); }
                    }}
                    className="w-full text-left p-3 rounded-[var(--app-radius-container)] border border-[var(--app-color-border)] hover:border-[var(--app-color-accent)] transition-colors">
                    <div className="text-[12px] font-medium text-[var(--app-color-text-primary)]">{t.name}</div>
                    {t.description && <div className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">{t.description}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Version history dialog */}
      {versionFormId && createPortal(
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 800 }} onClick={() => setVersionFormId(null)}>
          <div className="w-full max-w-md rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-elevated)] p-5 shadow-lg max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">
                版本历史 · {rawList.find(f => f.id === versionFormId)?.name}
              </h2>
              <button onClick={() => setVersionFormId(null)} className="p-1 rounded-[4px] hover:bg-[var(--app-color-surface-hover)]">
                <span className="text-[var(--app-color-text-secondary)]">✕</span>
              </button>
            </div>
            {versions.length === 0 ? (
              <p className="text-xs text-[var(--app-color-text-tertiary)]">暂无发布版本</p>
            ) : (
              <div className="space-y-2">
                {(versions as Array<{ version?: number; publishedAt?: string; publishedBy?: string }>).map((v, i) => (
                  <div key={i} className="p-3 rounded-[var(--app-radius-container)] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)]">
                    <div className="text-[12px] font-medium text-[var(--app-color-text-primary)]">版本 {v.version}</div>
                    <div className="text-[11px] text-[var(--app-color-text-tertiary)] mt-0.5">
                      发布于 {formatDateTimeAsiaShanghaiShort(v.publishedAt)} · {v.publishedBy}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      , document.body)}
    </AdminPageShell>
  );
}

function FormRow({
  form, selected, onToggleSel, onOpen, onEdit, onDelete, onRename,
  onDuplicate, onPublish, onRepublish, onResetPublishConditions, onUnpublish, onSaveTemplate,
  onArchive, onUnarchive, onTogglePin, onViewVersions, onPreview, status,
}: {
  form: ReportFormDefinition;
  selected: boolean;
  onToggleSel: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onPublish: () => void;
  onRepublish: () => void;
  onResetPublishConditions: () => void;
  onUnpublish: () => void;
  onSaveTemplate: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onTogglePin: () => void;
  onViewVersions: () => void;
  onPreview: () => void;
  status: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDir, setMenuDir] = useState<'down' | 'up'>('down');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(form.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // 检测已发布表单是否有未同步的更新
  const hasPendingChanges = form.status === 'published'
    && form.publishedAt
    && compareApiDateTime(form.updatedAt, form.publishedAt) > 0;

  const statusBadge = (() => {
    if (form.status === 'archived') {
      return { label: '已归档', warn: false, archived: true };
    }
    if (form.status === 'published') {
      return hasPendingChanges
        ? { label: '有更新', warn: true, archived: false }
        : { label: '已发布', warn: false, archived: false };
    }
    return { label: '草稿', warn: false, archived: false };
  })();

  useEffect(() => {
    if (!menuOpen) return;
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      setMenuDir(window.innerHeight - rect.bottom < 340 ? 'up' : 'down');
    }
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [menuOpen]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-[var(--app-radius-container)] border transition-all shadow-app-card group
        ${selected ? 'border-app-accent bg-app-accent-soft' : 'border-app-border bg-app-surface-container hover:border-app-accent'}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSel}
        className="shrink-0 w-3.5 h-3.5 accent-app-accent cursor-pointer"
      />
      {form.pinned && <Pin className="w-3.5 h-3.5 text-[var(--app-color-accent)] shrink-0" />}
      <FileSpreadsheet className="w-4 h-4 text-app-text-tertiary shrink-0" />
      <div
        className="flex-1 min-w-0"
        onDoubleClick={() => { setRenaming(true); setNameDraft(form.name); }}
      >
        {renaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { onRename(nameDraft); setRenaming(false); }
              if (e.key === 'Escape') setRenaming(false);
            }}
            onBlur={() => { onRename(nameDraft); setRenaming(false); }}
            className="w-full text-[13px] font-semibold bg-transparent border-b border-app-accent outline-none text-app-text-primary"
          />
        ) : (
          <button onClick={onOpen} className="text-left w-full">
            <div className="text-[13px] font-semibold text-app-text-primary truncate">{form.name}</div>
            <div className="text-[11px] text-app-text-tertiary flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 items-center">
              <span
                className={`px-1.5 py-0 rounded text-[10px] border inline-flex items-center gap-1 ${
                  statusBadge.warn
                    ? 'border-[var(--app-color-feedback-warning)] text-[var(--app-color-feedback-warning)] bg-[var(--app-color-feedback-warning-soft)]'
                    : form.status === 'published'
                      ? 'border-app-accent text-app-accent'
                      : statusBadge.archived
                        ? 'border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-page)]'
                        : 'border-app-border text-app-text-tertiary'
                }`}
              >
                {statusBadge.warn ? <><RefreshCw className="w-2.5 h-2.5" />{statusBadge.label}</> : statusBadge.label}
              </span>
              {form.source && (
                <span className="text-[10px] text-[var(--app-color-text-tertiary)] px-1 rounded bg-[var(--app-color-surface-container)]">
                  {form.source === 'excel' ? '📊Excel' : form.source === 'word' ? '📝Word' : form.source === 'template' ? '📋模板' : '📄空白'}
                </span>
              )}
              {form.status === 'published' && form.publishedBy && (
                <span>发布 {form.publishedBy} · {formatDateTimeAsiaShanghaiShort(form.publishedAt)}</span>
              )}
              {hasPendingChanges && (
                <span className="text-[var(--app-color-feedback-warning)]">设计已改，待重新发布</span>
              )}
              <span>设计更新 {formatDateTimeAsiaShanghaiShort(form.updatedAt)}</span>
            </div>
          </button>
        )}
      </div>
      <div className="relative shrink-0" ref={menuRef}>
        <button
          ref={menuBtnRef}
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1.5 rounded-[var(--app-radius-element)] hover:bg-app-surface-hover transition-colors opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="w-4 h-4 text-app-text-secondary" />
        </button>
        {menuOpen && (
          <div
            className={`absolute right-0 w-[200px] rounded-[var(--app-radius-container)] border border-app-border bg-app-surface-elevated shadow-app-dropdown py-1.5 z-[var(--z-dropdown)] ${
              menuDir === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'
            }`}
          >
            <MenuItem icon={Eye} label="打开设计器" onClick={() => { onOpen(); setMenuOpen(false); }} />
            <MenuItem icon={Pencil} label="重命名" onClick={() => { setRenaming(true); setNameDraft(form.name); setMenuOpen(false); }} />
            <MenuItem icon={Copy} label="复制" onClick={() => { onDuplicate(); setMenuOpen(false); }} />
            <MenuDivider />
            {form.status === 'published' ? (
              <>
                {hasPendingChanges && (
                  <MenuItem icon={RefreshCw} label="重新发布" onClick={() => { onRepublish(); setMenuOpen(false); }} />
                )}
                <MenuItem icon={Settings2} label="重置发布条件" onClick={() => { onResetPublishConditions(); setMenuOpen(false); }} />
                <MenuItem icon={Eye} label="撤回发布" onClick={() => { onUnpublish(); setMenuOpen(false); }} />
              </>
            ) : form.status === 'archived' ? (
              <MenuItem icon={Send} label="重新发布" onClick={() => { onPublish(); setMenuOpen(false); }} />
            ) : (
              <MenuItem icon={Send} label="发布" onClick={() => { onPublish(); setMenuOpen(false); }} />
            )}
            <MenuItem icon={Copy} label="保存为模板" onClick={() => { onSaveTemplate(); setMenuOpen(false); }} />
            <MenuDivider />
            {status === 'archived' ? (
              <MenuItem icon={Eye} label="取消归档" onClick={() => { onUnarchive(); setMenuOpen(false); }} />
            ) : (
              <MenuItem icon={Eye} label="归档" onClick={() => { onArchive(); setMenuOpen(false); }} />
            )}
            {form.status === 'published' ? (
              <MenuItem icon={Eye} label="预览填报" onClick={() => { onPreview(); setMenuOpen(false); }} />
            ) : (
              <MenuItem icon={Eye} label="预览（需先发布）" disabled onClick={() => setMenuOpen(false)} />
            )}
            <MenuItem icon={Link} label="复制链接" onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/admin/report-form/${form.id}/design`);
              toast.success('链接已复制');
              setMenuOpen(false);
            }} />
            <MenuItem icon={Printer} label="打印" onClick={() => { exportPdf(form.id); setMenuOpen(false); }} />
            <FormExportActions
              form={form}
              context="admin-template"
              variant="menu"
              onDone={() => setMenuOpen(false)}
            />
            <MenuItem icon={form.pinned ? PinOff : Pin} label={form.pinned ? '取消置顶' : '置顶'} onClick={() => {
              onTogglePin(); setMenuOpen(false);
            }} />
            <MenuItem icon={Eye} label="版本历史" onClick={() => { onViewVersions(); setMenuOpen(false); }} />
            <MenuDivider />
            <MenuItem icon={Trash2} label="删除" danger onClick={() => { onDelete(); setMenuOpen(false); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon, label, danger, disabled, onClick,
}: {
  icon: typeof Eye; label: string; danger?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left
        ${danger ? 'text-app-feedback-danger hover:bg-app-feedback-danger-soft' : 'text-app-text-secondary hover:bg-app-surface-hover'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="h-px bg-app-border my-1" />;
}
