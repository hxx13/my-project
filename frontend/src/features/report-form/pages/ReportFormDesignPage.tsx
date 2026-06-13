import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import FormGridEditor from '../components/FormGridEditor';
import FieldInspector from '../components/FieldInspector';
import ExcelImportButton from '../components/ExcelImportButton';
import { fetchFormById, updateForm } from '../api/reportForm.api';
import type { LayoutJson } from '../types';
import { useFormGridEditor } from '../hooks/useFormGridEditor';
import toast from 'react-hot-toast';
import { Undo2, Redo2, Save, AlertTriangle } from 'lucide-react';

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

  // 原始快照，用于检测未保存修改
  const savedSnapshot = useRef(JSON.stringify(initialLayout));
  const justSaved = useRef(false);

  // 是否有未保存修改
  const isDirty = useCallback(() => {
    return JSON.stringify(editor.layout) !== savedSnapshot.current;
  }, [editor.layout]);

  // 保存后更新快照
  const markSaved = useCallback(() => {
    savedSnapshot.current = JSON.stringify(editor.layout);
    justSaved.current = true;
    setTimeout(() => { justSaved.current = false; }, 500);
  }, [editor.layout]);

  // 浏览器关闭/刷新拦截
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 应用内导航拦截
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (justSaved.current) return false;
    return currentLocation.pathname !== nextLocation.pathname && isDirty();
  });

  // 双击编辑
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleDoubleClick = useCallback((cellId: string) => {
    const cell = editor.layout.cells.find(c => c.id === cellId);
    if (cell?.kind === 'static') {
      setEditingCellId(cellId);
      setEditingText(cell.staticText || '');
    }
  }, [editor.layout.cells]);

  const handleEditingCommit = useCallback(() => {
    if (editingCellId) {
      editor.updateCell(editingCellId, { staticText: editingText });
      setEditingCellId(null);
    }
  }, [editingCellId, editingText, editor]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name as string, layoutJson: JSON.stringify(editor.layout) };
      await updateForm(formId, payload);
    },
    onSuccess: () => {
      markSaved();
      toast.success('已保存');
    },
    onError: (e: Error) => toast.error('保存失败: ' + e.message),
  });

  const selectedCell = editor.selectedCellIds.size === 1
    ? editor.layout.cells.find(c => c.id === [...editor.selectedCellIds][0]) || null
    : null;

  const hasCells = editor.layout.cells.length > 0;
  const dirty = isDirty();

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
          className={`px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium flex items-center gap-1 transition-colors ${
            dirty ? 'bg-[var(--app-color-feedback-danger)] text-white hover:opacity-90' : 'bg-[var(--app-color-accent)] text-white hover:opacity-90'
          } disabled:opacity-50`}>
          <Save className="w-3.5 h-3.5" />
          {saveMut.isPending ? '保存中...' : dirty ? '保存 *' : '保存'}
        </button>
        <span className="text-[11px] text-[var(--app-color-text-tertiary)] ml-auto">
          {editor.layout.cells.length} 格 · 选中 {editor.selectedCellIds.size}
          {dirty && <span className="text-[var(--app-color-feedback-danger)] ml-1">未保存</span>}
        </span>
      </div>

      {/* 全宽编辑器 */}
      {hasCells ? (
        <FormGridEditor
          layout={editor.layout}
          selectedCellIds={editor.selectedCellIds}
          editingCellId={editingCellId}
          editingText={editingText}
          onCellMouseDown={(cellId, e) => {
            if (editingCellId) handleEditingCommit();
            editor.selectCell(cellId, e.shiftKey);
          }}
          onCellMouseEnter={(cellId, e) => {
            if (e.buttons === 1) editor.selectCell(cellId, true);
          }}
          onMouseUp={() => editor.setIsDragging(false)}
          onCellDoubleClick={handleDoubleClick}
          onEditingTextChange={setEditingText}
          onEditingCommit={handleEditingCommit}
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

      {/* 未保存离开确认弹窗 */}
      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-elevated)] p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-[var(--app-color-feedback-danger)]" />
              <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)]">未保存的修改</h3>
            </div>
            <p className="text-xs text-[var(--app-color-text-secondary)] mb-4">
              你有未保存的修改，如果离开此页面，修改将会丢失。
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => blocker.reset?.()}
                className="px-4 py-1.5 rounded-[6px] text-[12px] border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">
                继续编辑
              </button>
              <button onClick={async () => {
                await saveMut.mutateAsync();
                blocker.proceed?.();
              }}
                className="px-4 py-1.5 rounded-[6px] text-[12px] font-medium bg-[var(--app-color-accent)] text-white hover:opacity-90">
                保存并离开
              </button>
              <button onClick={() => blocker.proceed?.()}
                className="px-4 py-1.5 rounded-[6px] text-[12px] font-medium bg-[var(--app-color-feedback-danger)] text-white hover:opacity-90">
                不保存
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
