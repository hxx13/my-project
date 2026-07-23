import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import FormGridEditor from '../components/FormGridEditor';
import EditorToolbar from '../components/EditorToolbar';
import { fetchFormById, updateForm, publishForm } from '../api/reportForm.api';
import type { LayoutJson, FieldType, FieldDefinition, CellStyle, ThemeJson, ReportFormDefinition, FillPolicyJson, PermissionJson, ScheduleJson } from '../types';
import { useFormGridEditor } from '../hooks/useFormGridEditor';
import { useFieldOptionSets } from '../hooks/useFieldOptionSets';
import { calcColumnWidths, columnWidthsToRecord, mergeColumnWidths, buildBaseColumnWidths, applyColumnWidthCap, getWordLayoutMaxCol, mergeWordWebColumnWidths } from '../utils/gridColumnWidths';
import { calcRowHeights, rowHeightsToRecord } from '../utils/gridRowHeights';
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

function parseJsonField<T extends object>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === 'string') {
    try { return { ...fallback, ...JSON.parse(raw) }; } catch { return fallback; }
  }
  if (typeof raw === 'object') return { ...fallback, ...(raw as T) };
  return fallback;
}

const DEFAULT_FILL_POLICY: FillPolicyJson = {
  mode: 'shared',
  submitLabel: '提交',
  allowEditAfterSubmit: true,
};

const DEFAULT_PERMISSION: PermissionJson = {
  visibleRoles: ['STAFF'],
  visibleUserIds: [],
  fieldRoleBindings: {},
  allowUnboundView: true,
};

const DEFAULT_SCHEDULE: ScheduleJson = { period: 'manual' };

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

/** 设计页列宽测算：内容加宽，但不超过「初始列宽 × 5」 */
function computeDesignColumnWidths(
  cells: LayoutJson['cells'],
  fields: Record<string, FieldDefinition>,
  maxCol: number,
  theme: ThemeJson,
  initialBase: Record<number, number>,
): Record<number, number> {
  const baseTheme: ThemeJson = { ...theme, columnWidths: initialBase };
  const baseMap = buildBaseColumnWidths(maxCol, baseTheme);
  const computed = calcColumnWidths(cells, fields, maxCol, undefined, baseMap, true);
  const merged = mergeColumnWidths(computed, theme.columnWidths);
  applyColumnWidthCap(merged, baseMap, maxCol);
  return columnWidthsToRecord(merged);
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
    return <AdminPageShell><div className="p-4 text-sm text-[var(--app-color-text-tertiary)]">加载报表...</div></AdminPageShell>;
  }
  if (isError) {
    return <AdminPageShell><div className="p-4 text-sm text-[var(--app-color-feedback-danger)]">报表加载失败，请返回重试</div></AdminPageShell>;
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
  const { getFieldOptions, revision: optionSetRevision } = useFieldOptionSets(editor.layout.fields || {});

  const [showPublishWizard, setShowPublishWizard] = useState(false);
  const [publishWizardIntent, setPublishWizardIntent] = useState<'initial' | 'reset'>('initial');
  const [showWordTemplate, setShowWordTemplate] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [autoFitKey, setAutoFitKey] = useState(0);
  const [gridRenderKey, setGridRenderKey] = useState(0);
  const [theme, setTheme] = useState<ThemeJson>(initialTheme);
  const initialColBaseRef = useRef<Record<number, number>>(
    columnWidthsToRecord(
      buildBaseColumnWidths(
        Math.max(...initialLayout.cells.map(c => c.col + c.colSpan), 0) || 1,
        initialTheme,
      ),
    ),
  );

  // 进入设计页时：Excel 等若 theme 列宽被历史逻辑撑大，按初始列宽 ×5 收回（Word 保持导入列宽）
  useEffect(() => {
    if (source === 'word') return;
    const cells = initialLayout.cells;
    if (cells.length === 0) return;
    const fields = initialLayout.fields || {};
    const maxCol = Math.max(...cells.map(c => c.col + c.colSpan), 0) || 1;
    setTheme(t => {
      const capped = computeDesignColumnWidths(cells, fields, maxCol, t, initialColBaseRef.current);
      const changed = Object.entries(capped).some(([k, w]) => {
        const col = Number(k);
        const prev = t.columnWidths?.[col] ?? (t.columnWidths as Record<string, number> | undefined)?.[k];
        return typeof prev !== 'number' || Math.abs(w - prev) > 1;
      });
      return changed ? { ...t, columnWidths: capped } : t;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次进入
  }, []);

  // 选中格子（支持多选）
  const selectedCells = useMemo(
    () => editor.layout.cells.filter(c => editor.selectedCellIds.has(c.id)),
    [editor.layout.cells, editor.selectedCellIds],
  );

  const selectedCell = selectedCells.length === 1 ? selectedCells[0] : null;

  const fieldTypeInfo = useMemo(() => {
    const types = selectedCells
      .map(c => {
        if (c.kind === 'static') return 'STATIC' as FieldType;
        if (c.fieldKey) return editor.layout.fields[c.fieldKey]?.type;
        return undefined;
      })
      .filter(Boolean) as FieldType[];
    const unique = [...new Set(types)];
    return {
      type: unique.length === 1 ? unique[0] : undefined,
      mixed: unique.length > 1,
    };
  }, [selectedCells, editor.layout.fields]);

  const field = selectedCell?.fieldKey
    ? editor.layout.fields[selectedCell.fieldKey]
    : (selectedCell?.kind === 'static' ? { type: 'STATIC' as FieldType, label: selectedCell.staticText || '' } : null);

  const fieldStaticText = useMemo(() => {
    if (selectedCells.length !== 1 || !selectedCell) return undefined;
    if (selectedCell.kind === 'static') return selectedCell.staticText || '';
    if (selectedCell.fieldKey) {
      const f = editor.layout.fields[selectedCell.fieldKey];
      if (f?.type === 'STATIC') return f.label || '';
    }
    return undefined;
  }, [selectedCells, selectedCell, editor.layout.fields]);

  /** 多选时样式以第一个选中格为参考 */
  const referenceStyle = selectedCells[0]?.style;

  const fieldKeys = Object.keys(editor.layout.fields || {});

  // 导入 Excel 报表若未带列宽/行高，首次进入设计页按内容测算（Word 网页尺寸在渲染层计算，不写 theme）
  useEffect(() => {
    const cells = editor.layout.cells;
    if (cells.length === 0) return;
    if (source !== 'excel') return;
    const hasWidths = theme.columnWidths && Object.keys(theme.columnWidths).length > 0;
    const hasHeights = theme.rowHeights && Object.keys(theme.rowHeights).length > 0;
    if (hasWidths && hasHeights) return;
    const fields = editor.layout.fields || {};
    const maxCol = Math.max(...cells.map(c => c.col + c.colSpan), 0);
    const maxRow = Math.max(...cells.map(c => c.row + c.rowSpan), 0);
    const patch: Partial<ThemeJson> = {};
    if (!hasWidths) patch.columnWidths = computeDesignColumnWidths(cells, fields, maxCol, { ...theme, ...patch }, initialColBaseRef.current);
    if (!hasHeights) patch.rowHeights = rowHeightsToRecord(calcRowHeights(cells, fields, maxRow));
    setTheme(t => ({ ...t, ...patch }));
    setAutoFitKey(k => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次进入时补算
  }, []);

  /** 内容变更后：Excel 等列宽随标签/选项略增；Word 列宽以导入 theme 为准，不在此改写 */
  useEffect(() => {
    if (source === 'word') return;
    const cells = editor.layout.cells;
    if (cells.length === 0) return;
    const fields = editor.layout.fields || {};
    const maxCol = Math.max(...cells.map(c => c.col + c.colSpan), 0);
    if (maxCol <= 0) return;

    setTheme(t => {
      const nextWidths = computeDesignColumnWidths(cells, fields, maxCol, t, initialColBaseRef.current);
      const needsUpdate = Object.entries(nextWidths).some(([k, w]) => {
        const col = Number(k);
        const prev = t.columnWidths?.[col] ?? (t.columnWidths as Record<string, number> | undefined)?.[k];
        return typeof prev !== 'number' || Math.abs(w - prev) > 1;
      });
      if (!needsUpdate) return t;
      return { ...t, columnWidths: nextWidths };
    });
  }, [editor.layout.cells, editor.layout.fields]);

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
    if (!cell) return;
    if (cell.kind === 'static') {
      setEditingCellId(cellId);
      setEditingText(cell.staticText || '');
      return;
    }
    const f = cell.fieldKey ? layout.fields[cell.fieldKey] : null;
    if (f?.type === 'STATIC') {
      setEditingCellId(cellId);
      setEditingText(f.label || '');
    }
  }, []);

  const commitEdit = useCallback(() => {
    const { cellId, text } = editingRef.current;
    if (!cellId) return;
    const layout = editorRef.current.layout;
    const cell = layout.cells.find(c => c.id === cellId);
    if (cell?.kind === 'static') {
      editorRef.current.updateCell(cellId, { staticText: text });
    } else if (cell?.fieldKey) {
      editorRef.current.updateFieldDefinition(cell.fieldKey, { label: text });
    }
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

  const qc = useQueryClient();

  // 保存（先提交单元格内联编辑，避免未 blur 的内容丢失）
  const saveMut = useMutation({
    mutationFn: async () => {
      commitEdit();
      const payload = { name: form.name as string, layoutJson: JSON.stringify(editorRef.current.layout) };
      await updateForm(formId, payload);
    },
    onSuccess: () => {
      markSaved();
      setGridRenderKey(k => k + 1);
      toast.success('已保存');
    },
    onError: (e: Error) => toast.error('保存失败: ' + e.message),
  });

  const republishMut = useMutation({
    mutationFn: async () => {
      commitEdit();
      await updateForm(formId, {
        name: form.name as string,
        layoutJson: JSON.stringify(editorRef.current.layout),
        themeJson: JSON.stringify(theme),
      });
      await publishForm(formId);
    },
    onSuccess: () => {
      markSaved();
      setGridRenderKey(k => k + 1);
      void qc.invalidateQueries({ queryKey: ['report-form', formId] });
      void qc.invalidateQueries({ queryKey: ['report-form-list'] });
      void qc.invalidateQueries({ queryKey: ['report-fill-available'] });
      toast.success('已重新发布（沿用上次发布条件）');
    },
    onError: (e: Error) => toast.error('重新发布失败: ' + e.message),
  });

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
    applyFieldPatch({ options: opts, optionSetId: undefined });
  }, [applyFieldPatch]);

  const handleBindOptionPreset = useCallback((id: string) => {
    applyFieldPatch({ optionSetId: id, options: [] });
  }, [applyFieldPatch]);

  const handleUnbindOptionPreset = useCallback(() => {
    applyFieldPatch({ optionSetId: undefined, options: [] });
  }, [applyFieldPatch]);

  const handleOptionPresetUpdated = useCallback(() => {
    setGridRenderKey(k => k + 1);
  }, []);

  const handleFieldStaticTextChange = useCallback((text: string) => {
    if (editor.selectedCellIds.size === 0) return;
    if (editor.selectedCellIds.size === 1 && selectedCell) {
      if (selectedCell.kind === 'static') {
        editorRef.current.updateCell(selectedCell.id, { staticText: text });
        return;
      }
      if (selectedCell.fieldKey) {
        editorRef.current.updateFieldDefinition(selectedCell.fieldKey, { label: text });
      }
    } else {
      editorRef.current.batchUpdateFieldType(editor.selectedCellIds, 'STATIC');
      applyFieldPatch({ label: text });
    }
  }, [editor.selectedCellIds, selectedCell, applyFieldPatch]);

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

  const handlePreviewCellFocus = useCallback((cellId: string, shiftKey: boolean) => {
    if (editor.formatBrushActive) return;
    editor.selectCellForPreview(cellId, shiftKey);
  }, [editor]);

  const handleCellMouseDown = useCallback((cellId: string, e: React.MouseEvent, options?: { previewInteraction?: boolean }) => {
    if (editor.formatBrushActive) {
      if (options?.previewInteraction) return;
      editor.brushApply(cellId, true);
      return;
    }
    if (options?.previewInteraction) {
      editor.selectCellForPreview(cellId, e.shiftKey);
      return;
    }
    dragOrigin.current = { cellId, x: e.clientX, y: e.clientY };
    editor.selectCell(cellId, e.shiftKey);
  }, [editor]);

  const handleCellMouseEnter = useCallback((cellId: string, e: React.MouseEvent) => {
    if (editor.formatBrushActive && e.buttons === 1) {
      editor.brushApply(cellId, true);
      return;
    }
    if (editor.formatBrushActive) return;
    if (e.buttons !== 1) return;
    if (!dragOrigin.current) return;
    const dx = Math.abs(e.clientX - dragOrigin.current.x);
    const dy = Math.abs(e.clientY - dragOrigin.current.y);
    if (dx < 4 && dy < 4) return;
    editor.selectCellDragAdd(cellId);
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
    <div className="flex h-[calc(100dvh-8rem)] max-h-[calc(100dvh-8rem)] min-h-0 flex-col overflow-hidden">
      {/* 顶部工具栏 — 固定不随表格滚动 */}
      <EditorToolbar
        onSave={() => {
          commitEdit();
          saveMut.mutate();
        }}
        onPublish={() => {
          setPublishWizardIntent('initial');
          setShowPublishWizard(true);
        }}
        onRepublish={() => republishMut.mutate()}
        onResetPublishConditions={() => {
          setPublishWizardIntent('reset');
          setShowPublishWizard(true);
        }}
        onUndo={() => editor.undo()}
        onRedo={() => editor.redo()}
        canUndo={editor.undoStack.current.length > 0}
        canRedo={editor.redoStack.current.length > 0}
        isSaving={saveMut.isPending || republishMut.isPending}
        isDirty={dirty}
        isPublished={form.status === 'published'}
        onMergeCells={() => editor.mergeCells()}
        onUnmergeCells={() => editor.unmergeCells()}
        canMerge={editor.selectedCellIds.size >= 2}
        canUnmerge={editor.selectedCellIds.size > 0}
        selectedStyle={referenceStyle}
        onStyleChange={handleStyleChange}
        fieldType={fieldTypeInfo.type ?? field?.type}
        fieldTypeMixed={fieldTypeInfo.mixed}
        fieldStaticText={fieldStaticText}
        onFieldStaticTextChange={handleFieldStaticTextChange}
        fieldOptions={field && !field.optionSetId ? (field.options || []) : []}
        fieldOptionCount={field ? getFieldOptions(field).length : 0}
        fieldOptionSetId={field?.optionSetId}
        fieldMaxLength={field?.maxLength}
        fieldMin={field?.min}
        fieldMax={field?.max}
        onFieldTypeChange={handleFieldTypeChange}
        onBindOptionPreset={handleBindOptionPreset}
        onUnbindOptionPreset={handleUnbindOptionPreset}
        onInlineFieldOptionsChange={handleFieldOptionsChange}
        onOptionPresetUpdated={handleOptionPresetUpdated}
        onFieldMaxLengthChange={(v) => applyFieldPatch({ maxLength: v })}
        onFieldMinChange={(v) => applyFieldPatch({ min: v })}
        onFieldMaxChange={(v) => applyFieldPatch({ max: v })}
        onOpenTheme={() => setShowThemePanel(!showThemePanel)}
        onOpenWordTemplate={() => setShowWordTemplate(true)}
        onAutoFit={() => {
          const cells = editorRef.current.layout.cells;
          const fields = editorRef.current.layout.fields || {};
          const maxRow = Math.max(...cells.map(c => c.row + c.rowSpan), 0);
          let columnWidths: Record<number, number>;
          const rowHeights = rowHeightsToRecord(calcRowHeights(cells, fields, maxRow));
          if (source === 'word') {
            const wordMaxCol = getWordLayoutMaxCol(cells, theme);
            columnWidths = columnWidthsToRecord(
              mergeWordWebColumnWidths(
                new Map(),
                { ...theme, columnWidths: { ...initialColBaseRef.current, ...theme.columnWidths } },
                wordMaxCol,
              ),
            );
          } else {
            const maxCol = Math.max(...cells.map(c => c.col + c.colSpan), 0);
            columnWidths = computeDesignColumnWidths(cells, fields, maxCol, theme, initialColBaseRef.current);
          }
          const newTheme = { ...theme, columnWidths, rowHeights };
          setTheme(newTheme);
          setAutoFitKey(k => k + 1);
          updateForm(formId, { themeJson: JSON.stringify(newTheme) })
            .then(() => toast.success(source === 'word' ? '行高已自适应（列宽保持导入比例）' : '列宽与行高已自适应'))
            .catch((e: Error) => toast.error('自适应保存失败: ' + e.message));
        }}
        isWordSource={source === 'word'}
        onRestoreWordImportWidths={() => {
          const wordMaxCol = getWordLayoutMaxCol(editorRef.current.layout.cells, theme);
          const restoredMap = mergeWordWebColumnWidths(
            new Map(),
            { ...theme, columnWidths: { ...initialColBaseRef.current } },
            wordMaxCol,
          );
          const columnWidths = columnWidthsToRecord(restoredMap);
          const newTheme = { ...theme, columnWidths };
          setTheme(newTheme);
          setAutoFitKey(k => k + 1);
          updateForm(formId, { themeJson: JSON.stringify(newTheme) })
            .then(() => toast.success('已恢复 Word 导入列宽'))
            .catch((e: Error) => toast.error('恢复失败: ' + e.message));
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
        selectionKey={[...editor.selectedCellIds].sort().join(',')}
        formId={formId}
      />
      {showThemePanel && (
        <div className="shrink-0 border-b border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-3 py-2">
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
            key={`${gridRenderKey}-${optionSetRevision}`}
            autoFitVersion={autoFitKey}
            columnWidths={theme.columnWidths}
            rowHeights={theme.rowHeights}
            formSource={source}
            defaultAlign={theme.defaultAlign}
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
            onPreviewCellFocus={handlePreviewCellFocus}
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
        intent={publishWizardIntent}
        onPublished={() => {
          void qc.invalidateQueries({ queryKey: ['report-form', formId] });
          void qc.invalidateQueries({ queryKey: ['report-form-list'] });
          void qc.invalidateQueries({ queryKey: ['report-fill-available'] });
        }}
        initialFillPolicy={parseJsonField(form.fillPolicyJson, DEFAULT_FILL_POLICY)}
        initialPermission={parseJsonField(form.permissionJson, DEFAULT_PERMISSION)}
        initialSchedule={parseJsonField(form.scheduleJson, DEFAULT_SCHEDULE)}
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
