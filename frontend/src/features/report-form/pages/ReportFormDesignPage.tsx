import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import FormGridEditor from '../components/FormGridEditor';
import FieldInspector from '../components/FieldInspector';
import ExcelImportButton from '../components/ExcelImportButton';
import { fetchFormById, updateForm } from '../api/reportForm.api';
import type { LayoutJson } from '../types';
import { useFormGridEditor } from '../hooks/useFormGridEditor';
import toast from 'react-hot-toast';
import { Undo2, Redo2, Save } from 'lucide-react';

function parseLayout(raw: unknown): LayoutJson {
  if (!raw) return { cells: [], fields: {}, mergeGroups: [] };
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return { cells: [], fields: {}, mergeGroups: [] }; }
  }
  if (typeof raw === 'object') return raw as LayoutJson;
  return { cells: [], fields: {}, mergeGroups: [] };
}

export default function ReportFormDesignPage() {
  const { id } = useParams<{ id: string }>();
  const formId = Number(id);
  const navigate = useNavigate();

  const { data: form, isLoading, isError } = useQuery({
    queryKey: ['report-form', formId],
    queryFn: () => fetchFormById(formId),
    enabled: !!formId,
  });

  // 等数据加载完再渲染编辑器 —— 这是确保 cells 不为空的关键
  if (isLoading || !form) {
    return (
      <AdminPageShell title="加载中...">
        <div className="p-4 text-sm text-[var(--app-color-text-tertiary)]">加载报表...</div>
      </AdminPageShell>
    );
  }

  if (isError) {
    return (
      <AdminPageShell title="加载失败">
        <div className="p-4 text-sm text-[var(--app-color-feedback-danger)]">报表加载失败，请返回重试</div>
      </AdminPageShell>
    );
  }

  const layout = parseLayout((form as Record<string, unknown>).layoutJson);
  return <DesignerInner key={formId} formId={formId} form={form} initialLayout={layout} navigate={navigate} />;
}

/** 内部组件 — 确保 form 已就绪 + key 强制 remount */
function DesignerInner({
  formId, form, initialLayout, navigate,
}: {
  formId: number; form: Record<string, unknown>; initialLayout: LayoutJson; navigate: ReturnType<typeof useNavigate>;
}) {
  const editor = useFormGridEditor(initialLayout);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        layoutJson: JSON.stringify(editor.layout),
      };
      console.warn('%c🔴 [SAVE] 即将保存 payload:%c', 'font-size:14px;color:red;font-weight:bold', '', payload);
      console.warn('%c🔴 [SAVE] editor.layout.cells=%c' + editor.layout.cells.length,
        'font-size:14px;color:red', '');
      return updateForm(formId, payload);
    },
    onSuccess: () => toast.success('已保存'),
    onError: (e: Error) => {
      console.warn('%c🔴 [SAVE] 保存失败:%c', 'font-size:16px;color:red;font-weight:bold', '', e);
      toast.error('保存失败: ' + e.message);
    },
  });

  const selectedCell = editor.selectedCellIds.size === 1
    ? editor.layout.cells.find(c => c.id === [...editor.selectedCellIds][0]) || null
    : null;

  const hasCells = editor.layout.cells.length > 0;

  return (
    <AdminPageShell title={String(form.name || '报表设计器')} description="设计报表布局与字段">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <ExcelImportButton
          onImported={(f) => navigate(`/admin/report-form/${f.id}/design`)}
        />
        <button onClick={() => editor.undo()}
          disabled={editor.undoStack.current.length === 0}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 flex items-center gap-1">
          <Undo2 className="w-3.5 h-3.5" /> 撤销
        </button>
        <button onClick={() => editor.redo()}
          disabled={editor.redoStack.current.length === 0}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 flex items-center gap-1">
          <Redo2 className="w-3.5 h-3.5" /> 重做
        </button>
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
          <Save className="w-3.5 h-3.5" />
          {saveMut.isPending ? '保存中...' : '保存'}
        </button>
        <span className="text-[11px] text-[var(--app-color-text-tertiary)] ml-auto">
          {initialLayout.cells.length} 个格子
        </span>
      </div>

      {/* Main */}
      {hasCells ? (
        <div className="flex gap-4">
          <div className="flex-[7] min-w-0">
            <FormGridEditor layout={editor.layout} onChange={l => editor.setLayout(l)} />
          </div>
          <div className="flex-[3] min-w-[260px] max-w-[360px] border-l border-[var(--app-color-border)] pl-3">
            <FieldInspector
              selectedCell={selectedCell}
              layout={editor.layout}
              onUpdateCell={editor.updateCell}
              onUpdateStyle={editor.updateCellStyle}
              onToggleKind={editor.toggleCellKind}
              onUpdateField={editor.updateFieldDefinition}
            />
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-sm text-[var(--app-color-text-tertiary)] mb-3">当前表格为空</p>
          <p className="text-xs text-[var(--app-color-text-tertiary)]">
            请从左侧列表「从 Excel 创建」导入表格，或返回列表新建空白报表
          </p>
        </div>
      )}
    </AdminPageShell>
  );
}
