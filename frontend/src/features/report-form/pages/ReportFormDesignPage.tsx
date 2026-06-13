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

  if (isLoading || !form) {
    return <AdminPageShell title="加载中..."><div className="p-4 text-sm text-[var(--app-color-text-tertiary)]">加载报表...</div></AdminPageShell>;
  }
  if (isError) {
    return <AdminPageShell title="加载失败"><div className="p-4 text-sm text-[var(--app-color-feedback-danger)]">报表加载失败，请返回重试</div></AdminPageShell>;
  }

  const layout = parseLayout((form as Record<string, unknown>).layoutJson);
  return <DesignerInner key={formId} formId={formId} form={form} initialLayout={layout} navigate={navigate} />;
}

function DesignerInner({
  formId, form, initialLayout, navigate,
}: {
  formId: number; form: Record<string, unknown>; initialLayout: LayoutJson; navigate: ReturnType<typeof useNavigate>;
}) {
  const editor = useFormGridEditor(initialLayout);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name as string,
        layoutJson: JSON.stringify(editor.layout),
      };
      await updateForm(formId, payload);
      // 保存后立即验证：重新读取表单
      const verify = await fetchFormById(formId);
      const verifyLayout = parseLayout((verify as Record<string, unknown>).layoutJson);
      if (verifyLayout.cells.length !== editor.layout.cells.length) {
        throw new Error(`数据校验失败: DB中cells=${verifyLayout.cells.length}, 本地=${editor.layout.cells.length}`);
      }
    },
    onSuccess: () => toast.success('已保存'),
    onError: (e: Error) => toast.error('保存失败: ' + e.message),
  });

  const selectedCellIds = [...editor.selectedCellIds];
  const selectedCell = selectedCellIds.length === 1
    ? editor.layout.cells.find(c => c.id === selectedCellIds[0]) || null
    : null;

  const hasCells = editor.layout.cells.length > 0;

  return (
    <AdminPageShell title={String(form.name || '报表设计器')} description="点击格子编辑属性">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <ExcelImportButton onImported={(f) => navigate(`/admin/report-form/${f.id}/design`)} />
        <span className="w-px h-5 bg-[var(--app-color-border)]" />
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
          {editor.layout.cells.length} 格 · 选中 {editor.selectedCellIds.size}
        </span>
      </div>

      {/* 全宽编辑器 */}
      {hasCells ? (
        <FormGridEditor
          layout={editor.layout}
          selectedCellIds={editor.selectedCellIds}
          onCellMouseDown={(cellId, e) => editor.selectCell(cellId, e.shiftKey)}
          onCellMouseEnter={(cellId, e) => {
            if (e.buttons === 1) editor.selectCell(cellId, true);
          }}
          onMouseUp={() => editor.setIsDragging(false)}
        />
      ) : (
        <div className="text-center py-16">
          <p className="text-sm text-[var(--app-color-text-tertiary)] mb-3">当前表格为空</p>
          <p className="text-xs text-[var(--app-color-text-tertiary)]">
            请从左侧列表「从 Excel 创建」导入表格，或返回列表新建空白报表
          </p>
        </div>
      )}

      {/* 浮动属性弹窗 */}
      <FieldInspector
        selectedCell={selectedCell}
        layout={editor.layout}
        onUpdateCell={editor.updateCell}
        onUpdateStyle={editor.updateCellStyle}
        onToggleKind={editor.toggleCellKind}
        onUpdateField={editor.updateFieldDefinition}
        onClose={() => editor.selectRange([])}
      />
    </AdminPageShell>
  );
}
