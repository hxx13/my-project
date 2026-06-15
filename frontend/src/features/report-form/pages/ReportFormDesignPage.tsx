import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import FormGridEditor from '../components/FormGridEditor';
import EditorToolbar from '../components/EditorToolbar';
import { fetchFormById, updateForm } from '../api/reportForm.api';
import type { LayoutJson, FieldType, FieldDefinition, CellStyle, ThemeJson, ReportFormDefinition } from '../types';
import { useFormGridEditor } from '../hooks/useFormGridEditor';
import { calcColumnWidths, columnWidthsToRecord } from '../utils/gridColumnWidths';
import toast from 'react-hot-toast';
import ThemePanel from '../components/ThemePanel';
import PublishWizard from '../components/PublishWizard';
import WordTemplateManager from '../components/WordTemplateManager';
import { AlertTriangle } from 'lucide-react';

function parseLayout(raw: unknown): LayoutJson {
  if (!raw) return { cells: [], fields: {}, mergeGroups: [] };
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return { cells: [], fields: {}, mergeGroups: [] }; }
  }
  if (typeof raw === 'object') return raw as LayoutJson;
  return { cells: [], fields: {}, mergeGroups: [] };
}

function parseTheme(raw: unknown): ThemeJson {
  const fallback: ThemeJson = {
    headerBg: '#f5f5f5',
    headerColor: '#1a1a1a',
    headerFontSize: 13,
    headerBold: true,
    headerAlign: 'center',
    zebraStripe: true,
    oddRowBg: '#ffffff',
    evenRowBg: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    cellPadding: 8,
    defaultFontSize: 13,
    defaultAlign: 'center',
    columnWidths: {},
    rowHeights: {},
  };
  if (!raw) return fallback;
  if (typeof raw === 'string') {
    try { return { ...fallback, ...JSON.parse(raw) }; } catch { return fallback; }
  }
  if (typeof raw === 'object') return { ...fallback, ...(raw as ThemeJson) };
  return fallback;
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

  const layout = parseLayout(form.layoutJson as unknown);
  const theme = parseTheme(form.themeJson as unknown);
  const source = String(form.source || '');
  return <DesignerInner key={formId} formId={formId} form={form} initialLayout={layout} initialTheme={theme} source={source} navigate={navigate} />;
}

function DesignerInner({
  formId, form, initialLayout, initialTheme, source, navigate,
}: {
  formId: number; form: ReportFormDefinition; initialLayout: LayoutJson;
  initialTheme: ThemeJson; source: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const editor = useFormGridEditor(initialLayout);

  const [showPublishWizard, setShowPublishWizard] = useState(false);
  const [showWordTemplate, setShowWordTemplate] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [autoFitKey, setAutoFitKey] = useState(0);
  const [theme, setTheme] = useState<ThemeJson>(initialTheme);

  // 选中格子（支持多选）
  const selectedCells = useMemo(
    () => editor.layout.cells.filter(c => editor.selectedCellIds.has(c.id)),
    [editor.layout.cells, editor.selectedCellIds],
  );

  const selectedCell = selectedCells.length === 1 ? selectedCells[0] : null;

  const cellKind = useMemo((): 'static' | 'field' | 'mixed' | undefined => {
    if (selectedCells.length === 0) return undefined;
    const kinds = new Set(selectedCells.map(c => c.kind));
    if (kinds.size === 1) return selectedCells[0].kind;
    return 'mixed';
  }, [selectedCells]);

  const fieldTypeInfo = useMemo(() => {
    const types = selectedCells
      .filter(c => c.kind === 'field' && c.fieldKey)
      .map(c => editor.layout.fields[c.fieldKey!]?.type)
      .filter(Boolean) as FieldType[];
    const unique = [...new Set(types)];
    return {
      type: unique.length === 1 ? unique[0] : undefined,
      mixed: unique.length > 1,
    };
  }, [selectedCells, editor.layout.fields]);

  const field = selectedCell?.kind === 'field' && selectedCell?.fieldKey
    ? editor.layout.fields[selectedCell.fieldKey]
    : null;

  /** 多选时样式以第一个选中格为参考 */
  const referenceStyle = selectedCells[0]?.style;

  const fieldKeys = Object.keys(editor.layout.fields || {});

  // 导入报表若未带列宽，首次进入设计页按内容测算列宽
  useEffect(() => {
    const cells = editor.layout.cells;
    if (cells.length === 0) return;
    const hasWidths = theme.columnWidths && Object.keys(theme.columnWidths).length > 0;
    if (hasWidths || (source !== 'word' && source !== 'excel')) return;
    const maxCol = Math.max(...cells.map(c => c.col + c.colSpan), 0);
    const widths = calcColumnWidths(cells, editor.layout.fields || {}, maxCol);
    setTheme(t => ({ ...t, columnWidths: columnWidthsToRecord(widths) }));
    setAutoFitKey(k => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次进入时补算列宽
  }, []);

  // 原始快照，用于检测未保存修改
  const savedSnapshot = useRef(JSON.stringify(initialLayout));
  const justSaved = useRef(false);

  const isDirty = useCallback(() => {
    return JSON.stringify(editorRef.current.layout) !== savedSnapshot.current;
  }, []);

  const markSaved = useCallback(() => {
    savedSnapshot.current = JSON.stringify(editorRef.current.layout);
    justSaved.current = true;
    setTimeout(() => { justSaved.current = false; }, 500);
  }, []);

  // 浏览器刷新/关闭拦截
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 应用内导航拦截
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (justSaved.current) return false;
    return currentLocation.pathname !== nextLocation.pathname && isDirty();
  });

  // 双击编辑静态文本
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // 用 ref 持有最新 editor 方法，避免 useCallback/useEffect 依赖频繁变化
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const editingRef = useRef({ cellId: editingCellId, text: editingText });
  editingRef.current = { cellId: editingCellId, text: editingText };

  const handleDoubleClick = useCallback((cellId: string) => {
    const layout = editorRef.current.layout;
    const cell = layout.cells.find(c => c.id === cellId);
    if (cell?.kind === 'static') {
      setEditingCellId(cellId);
      setEditingText(cell.staticText || '');
    }
  }, []);

  const commitEdit = useCallback(() => {
    const { cellId, text } = editingRef.current;
    if (!cellId) return;
    editorRef.current.updateCell(cellId, { staticText: text });
    setEditingCellId(null);
  }, []);

  // 点击编辑区域外部时自动提交编辑
  useEffect(() => {
    if (!editingCellId) return;
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
      commitEdit();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [editingCellId, commitEdit]);

  // 保存
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name as string, layoutJson: JSON.stringify(editorRef.current.layout) };
      await updateForm(formId, payload);
    },
    onSuccess: () => {
      markSaved();
      toast.success('已保存');
    },
    onError: (e: Error) => toast.error('保存失败: ' + e.message),
  });

  // 格子类型设置（支持批量）
  const handleSetCellKind = useCallback((kind: 'static' | 'field') => {
    if (editor.selectedCellIds.size === 0) return;
    if (editor.selectedCellIds.size === 1) {
      editorRef.current.setCellKind([...editor.selectedCellIds][0], kind);
    } else {
      editorRef.current.batchSetCellKind(editor.selectedCellIds, kind);
    }
  }, [editor.selectedCellIds]);

  // 字段属性更新（支持批量）
  const applyFieldPatch = useCallback((patch: Partial<FieldDefinition>) => {
    if (editor.selectedCellIds.size === 0) return;
    if (editor.selectedCellIds.size === 1) {
      const cell = selectedCell;
      if (cell?.fieldKey) {
        editorRef.current.updateFieldDefinition(cell.fieldKey, patch);
      }
    } else {
      editorRef.current.batchUpdateFieldDefinition(editor.selectedCellIds, patch);
    }
  }, [editor.selectedCellIds, selectedCell]);

  const handleFieldTypeChange = useCallback((type: FieldType) => {
    if (editor.selectedCellIds.size === 0) return;
    editorRef.current.batchUpdateFieldType(editor.selectedCellIds, type);
  }, [editor.selectedCellIds]);

  const handleFieldOptionsChange = useCallback((opts: { label: string; value: string }[]) => {
    applyFieldPatch({ options: opts });
  }, [applyFieldPatch]);

  const handleFieldOptionSetChange = useCallback((id: string | undefined, opts: { label: string; value: string }[]) => {
    applyFieldPatch({ optionSetId: id, options: opts });
  }, [applyFieldPatch]);

  const handleStyleChange = useCallback((patch: Partial<CellStyle>) => {
    if (editor.selectedCellIds.size === 0) return;
    if (editor.selectedCellIds.size === 1) {
      editorRef.current.updateCellStyle([...editor.selectedCellIds][0], patch);
    } else {
      editorRef.current.updateCellsStyle(editor.selectedCellIds, patch);
    }
  }, [editor.selectedCellIds]);

  // 拖选起点：记录 mousedown 的格子和坐标，移动超过阈值才启用拖选
  const dragOrigin = useRef<{ cellId: string; x: number; y: number } | null>(null);

  const handleCellMouseDown = useCallback((cellId: string, e: React.MouseEvent) => {
    // 格式刷激活时：点击格子涂刷样式（可连续涂刷）
    if (editor.formatBrushActive) {
      editor.brushApply(cellId, true);
      return;
    }
    dragOrigin.current = { cellId, x: e.clientX, y: e.clientY };
    editor.selectCell(cellId, e.shiftKey);
  }, [editor]);

  const handleCellMouseEnter = useCallback((cellId: string, e: React.MouseEvent) => {
    // 格式刷激活时拖过格子连续涂刷
    if (editor.formatBrushActive && e.buttons === 1) {
      editor.brushApply(cellId, true);
      return;
    }
    if (editor.formatBrushActive) return;
    if (e.buttons !== 1) return;
    if (!dragOrigin.current) return;
    // 移动超过 4px 才算拖选，避免单击微动触发 toggle
    const dx = Math.abs(e.clientX - dragOrigin.current.x);
    const dy = Math.abs(e.clientY - dragOrigin.current.y);
    if (dx < 4 && dy < 4) return;
    editor.selectCell(cellId, true);
  }, [editor]);

  const handleMouseUp = useCallback(() => {
    dragOrigin.current = null;
    editor.setIsDragging(false);
  }, [editor]);

  // Esc 退出格式刷
  useEffect(() => {
    if (!editor.formatBrushActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') editorRef.current.cancelFormatBrush();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor.formatBrushActive]);

  const hasCells = editor.layout.cells.length > 0;
  const dirty = isDirty();

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 160px)' }}>
      {/* 顶部工具栏 */}
      <EditorToolbar
        onSave={() => saveMut.mutate()}
        onPublish={() => setShowPublishWizard(true)}
        onUndo={() => editor.undo()}
        onRedo={() => editor.redo()}
        canUndo={editor.undoStack.current.length > 0}
        canRedo={editor.redoStack.current.length > 0}
        isSaving={saveMut.isPending}
        isDirty={dirty}
        isPublished={form.status === 'published'}
        onMergeCells={() => editor.mergeCells()}
        onUnmergeCells={() => editor.unmergeCells()}
        canMerge={editor.selectedCellIds.size >= 2}
        canUnmerge={editor.selectedCellIds.size > 0}
        selectedStyle={referenceStyle}
        onStyleChange={handleStyleChange}
        cellKind={cellKind}
        fieldType={fieldTypeInfo.type ?? field?.type}
        fieldTypeMixed={fieldTypeInfo.mixed}
        fieldOptions={field?.options}
        fieldOptionSetId={field?.optionSetId}
        fieldMaxLength={field?.maxLength}
        fieldMin={field?.min}
        fieldMax={field?.max}
        onSetCellKind={handleSetCellKind}
        onFieldTypeChange={handleFieldTypeChange}
        onFieldOptionsChange={handleFieldOptionsChange}
        onFieldOptionSetChange={handleFieldOptionSetChange}
        onFieldMaxLengthChange={(v) => applyFieldPatch({ maxLength: v })}
        onFieldMinChange={(v) => applyFieldPatch({ min: v })}
        onFieldMaxChange={(v) => applyFieldPatch({ max: v })}
        onOpenTheme={() => setShowThemePanel(!showThemePanel)}
        onOpenWordTemplate={() => setShowWordTemplate(true)}
        onAutoFit={() => {
          const cells = editorRef.current.layout.cells;
          const fields = editorRef.current.layout.fields || {};
          const maxCol = Math.max(...cells.map(c => c.col + c.colSpan), 0);
          const widths = calcColumnWidths(cells, fields, maxCol);
          const columnWidths = columnWidthsToRecord(widths);
          const newTheme = { ...theme, columnWidths };
          setTheme(newTheme);
          setAutoFitKey(k => k + 1);
          updateForm(formId, { themeJson: JSON.stringify(newTheme) })
            .then(() => toast.success('列宽已自适应'))
            .catch((e: Error) => toast.error('列宽保存失败: ' + e.message));
        }}
        formatBrushActive={editor.formatBrushActive}
        onBrushPickup={() => {
          const source = selectedCells[0];
          if (!source) {
            toast.error('请先选中至少一个格子');
            return;
          }
          editor.brushPickup(source.style);
          toast.success(selectedCells.length > 1
            ? `已吸取样式（来自第 1 个选中格），可逐格涂刷或批量应用`
            : '已吸取样式，点击目标格子应用');
        }}
        onBrushApply={() => {
          if (!editor.formatBrushActive) return;
          if (editor.selectedCellIds.size >= 2) {
            editor.brushApplyToSelection(editor.selectedCellIds, false);
            toast.success(`样式已应用到 ${editor.selectedCellIds.size} 个格子`);
          } else if (editor.selectedCellIds.size === 1) {
            editor.brushApply([...editor.selectedCellIds][0], false);
            toast.success('样式已应用');
          } else {
            toast('点击表格中的格子涂刷样式，按 Esc 退出', { icon: 'ℹ️' });
          }
        }}
        cellCount={editor.layout.cells.length}
        selectedCount={editor.selectedCellIds.size}
        hasSelection={editor.selectedCellIds.size > 0}
      />

      {/* 主题面板（弹出式） */}
      {showThemePanel && (
        <div className="border-b border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">主题配置</span>
            <button onClick={() => setShowThemePanel(false)}
              className="text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-secondary)]">
              关闭
            </button>
          </div>
          <ThemePanel theme={theme} onChange={(t) => {
            setTheme(t);
            updateForm(formId, { themeJson: JSON.stringify(t) }).catch(() => {});
          }} />
        </div>
      )}

      {/* 主编辑区 — 全宽 */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {hasCells ? (
          <FormGridEditor
            autoFitVersion={autoFitKey}
            columnWidths={theme.columnWidths}
            layout={editor.layout}
            selectedCellIds={editor.selectedCellIds}
            editingCellId={editingCellId}
            editingText={editingText}
            onCellMouseDown={handleCellMouseDown}
            onCellMouseEnter={handleCellMouseEnter}
            onMouseUp={handleMouseUp}
            onCellDoubleClick={handleDoubleClick}
            onEditingTextChange={setEditingText}
            onEditingCommit={commitEdit}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-[var(--app-color-text-tertiary)] mb-3">当前表格为空</p>
            <p className="text-xs text-[var(--app-color-text-tertiary)]">
              请从列表页「从 Excel 创建」导入表格，或点击"导入"按钮
            </p>
          </div>
        )}
      </div>

      {/* 发布向导 */}
      <PublishWizard
        open={showPublishWizard}
        onClose={() => setShowPublishWizard(false)}
        formId={formId}
        layout={editor.layout}
      />

      {/* Word 模板管理 */}
      <WordTemplateManager
        open={showWordTemplate}
        onClose={() => setShowWordTemplate(false)}
        formId={formId}
        fieldKeys={fieldKeys}
      />

      {/* 未保存离开确认弹窗 */}
      {blocker.state === 'blocked' && createPortal(
        <div className="fixed inset-0 flex items-center justify-center bg-black/50" style={{ zIndex: 800 }}>
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
      , document.body)}
    </div>
  );
}
