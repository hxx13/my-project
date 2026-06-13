// ReportFormListPage — 填报报表管理列表
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet, Plus, Trash2, Copy, Pencil, Eye, MoreVertical, Upload,
} from 'lucide-react';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import {
  fetchFormPage, deleteForm, batchDeleteForms, renameForm,
  duplicateForm, publishForm, unpublishForm, saveAsTemplate,
  createFormFromExcel, createBlankForm,
} from '../api/reportForm.api';
import type { ReportFormDefinition } from '../types';
import toast from 'react-hot-toast';

export default function ReportFormListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['report-form-list'],
    queryFn: async () => {
      console.error('🔥 [LIST] fetchFormPage 开始...');
      const result = await fetchFormPage();
      console.error('🔥 [LIST] fetchFormPage 结果:', result);
      return result;
    },
  });

  if (error) {
    console.error('🔥 [LIST] 列表加载失败:', error);
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['report-form-list'] });
  };

  const createBlankMut = useMutation({
    mutationFn: async () => {
      console.error('🔥 [LIST] createBlank 开始...');
      const result = await createBlankForm();
      console.error('🔥 [LIST] createBlank 成功:', result);
      return result;
    },
    onSuccess: (form) => {
      invalidate();
      navigate(`/admin/report-form/${form.id}/design`);
      toast.success('已创建空白报表');
    },
    onError: (e: unknown) => {
      console.error('🔥 [LIST] createBlank 失败:', e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      alert('创建失败: ' + msg);
    },
  });

  const createFromExcelMut = useMutation({
    mutationFn: async (file: File) => {
      console.error('🔥 [LIST] createFromExcel 开始:', file.name, file.size);
      const result = await createFormFromExcel(file);
      console.error('🔥 [LIST] createFromExcel 成功:', result);
      return result;
    },
    onSuccess: (form) => {
      invalidate();
      navigate(`/admin/report-form/${form.id}/design`);
      toast.success('已从 Excel 创建报表');
    },
    onError: (e: unknown) => {
      console.error('🔥 [LIST] createFromExcel 失败:', e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      alert('导入失败: ' + msg);
    },
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
    onSuccess: () => { invalidate(); toast.success('已发布'); },
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

  const openForm = (form: ReportFormDefinition) => {
    navigate(`/admin/report-form/${form.id}/design`);
  };

  // 后端可能返回数组或 PageResult 对象，兼容两者
  const rawList: ReportFormDefinition[] = Array.isArray(data) ? data : (data?.list ?? []);
  const filtered = rawList.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AdminPageShell title="填报报表管理" description="创建、设计、发布填报报表">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          placeholder="搜索报表..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-[320px] px-3 py-1.5 rounded-[var(--app-radius-container)] border border-app-border bg-app-surface-container text-sm text-app-text-primary outline-none focus:border-app-accent transition-colors"
        />
        <button
          onClick={handleExcelCreate}
          disabled={createFromExcelMut.isPending}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium bg-app-accent text-white hover:opacity-90 flex items-center gap-1 disabled:opacity-50 transition-opacity"
        >
          <Upload className="w-3.5 h-3.5" />
          {createFromExcelMut.isPending ? '导入中...' : '从 Excel 创建'}
        </button>
        <button
          onClick={() => createBlankMut.mutate()}
          disabled={createBlankMut.isPending}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-app-border hover:bg-app-surface-hover flex items-center gap-1 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> 空白报表
        </button>
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
              onPublish={() => publishMut.mutate(form.id)}
              onUnpublish={() => unpublishMut.mutate(form.id)}
              onSaveTemplate={() => saveTemplateMut.mutate(form.id)}
            />
          ))}
        </div>
      )}
    </AdminPageShell>
  );
}

function FormRow({
  form, selected, onToggleSel, onOpen, onEdit, onDelete, onRename,
  onDuplicate, onPublish, onUnpublish, onSaveTemplate,
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
  onUnpublish: () => void;
  onSaveTemplate: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDir, setMenuDir] = useState<'down' | 'up'>('down');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(form.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

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
            <div className="text-[11px] text-app-text-tertiary flex gap-2 mt-0.5 items-center">
              <span
                className={`px-1.5 py-0 rounded text-[10px] border ${
                  form.status === 'published' ? 'border-app-accent text-app-accent' : 'border-app-border text-app-text-tertiary'
                }`}
              >
                {form.status === 'published' ? '已发布' : '草稿'}
              </span>
              <span>更新于 {new Date(form.updatedAt).toLocaleDateString()}</span>
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
            <MenuItem icon={Eye} label="打开设计" onClick={() => { onOpen(); setMenuOpen(false); }} />
            <MenuItem icon={Pencil} label="编辑" onClick={() => { onEdit(); setMenuOpen(false); }} />
            <MenuItem icon={Copy} label="复制" onClick={() => { onDuplicate(); setMenuOpen(false); }} />
            <MenuDivider />
            {form.status === 'published' ? (
              <MenuItem icon={Eye} label="撤回发布" onClick={() => { onUnpublish(); setMenuOpen(false); }} />
            ) : (
              <MenuItem icon={Eye} label="发布" onClick={() => { onPublish(); setMenuOpen(false); }} />
            )}
            <MenuItem icon={Copy} label="保存为模板" onClick={() => { onSaveTemplate(); setMenuOpen(false); }} />
            <MenuDivider />
            <MenuItem icon={Trash2} label="删除" danger onClick={() => { onDelete(); setMenuOpen(false); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon, label, danger, onClick,
}: {
  icon: typeof Eye; label: string; danger?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left
        ${danger ? 'text-app-feedback-danger hover:bg-app-feedback-danger-soft' : 'text-app-text-secondary hover:bg-app-surface-hover'}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="h-px bg-app-border my-1" />;
}
