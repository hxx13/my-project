// SmartSheetPage — 🍱 Bento 卡片布局（紧凑型：页眉工具栏 → 表格卡片 → 页脚状态栏 + 标签）
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import SmartSheetToolbar from './components/SmartSheetToolbar';
import SmartSheetGrid from './components/SmartSheetGrid';
import SmartSheetStatusBar from './components/SmartSheetStatusBar';
import SmartSheetTabsRow from './components/SmartSheetTabsRow';
import FindReplaceDialog from './components/FindReplaceDialog';
import ImportDialog from './components/ImportDialog';
import ConditionalFormatPanel, { type ConditionRule } from './components/ConditionalFormatPanel';
import { useSmartSheet } from './hooks/useSmartSheet';
import { FormatContext } from './hooks/useCellFormat';
import { DEFAULT_VIEW_OPTIONS } from './types';
import type { ViewOptions, ColumnConfig, CellValue, CellFormat } from './types';
import type { UndoRedoState } from './components/SmartSheetGrid';
import toast from 'react-hot-toast';

export default function SmartSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { sheet, rows, isLoading, updateCell, addRow, insertRow, deleteRows, duplicateRow, moveRow, updateColumn, invalidate } = useSmartSheet(id);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [selectedColumn, setSelectedColumn] = useState<ColumnConfig | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [undoRedo, setUndoRedo] = useState<{ canUndo: boolean; canRedo: boolean }>({ canUndo: false, canRedo: false });
  const [isDirty, setIsDirty] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [condRules, setCondRules] = useState<ConditionRule[]>([]);
  const [currentFormat, setCurrentFormat] = useState<CellFormat>({});
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});

  const handleUndoRedoState = useCallback((state: UndoRedoState) => {
    setUndoRedo({ canUndo: state.canUndo, canRedo: state.canRedo });
    undoRef.current = state.undo;
    redoRef.current = state.redo;
  }, []);

  // Ctrl+F / Cmd+F keyboard shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFind(true);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // Track dirty state on cell edits
  const handleCellEdit = useCallback((rowId: string, colKey: string, value: string) => {
    updateCell(rowId, colKey, value);
    setIsDirty(true);
  }, [updateCell]);

  const handleViewOptionChange = useCallback((key: keyof ViewOptions) => {
    setViewOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleExport = useCallback(() => {
    if (!id) return;
    const a = document.createElement('a');
    a.href = `/api/admin/smartsheet/${id}/export`;
    a.download = `${sheet?.name || 'export'}.csv`;
    a.click();
  }, [id, sheet]);

  const sheetTabs = useMemo(() => [
    { id: id || 'current', name: sheet?.name || '当前表格' },
  ], [id, sheet]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-app-text-secondary text-sm">加载中...</div>
  );
  if (!sheet) return (
    <div className="flex items-center justify-center h-full text-app-feedback-danger text-sm">表格不存在</div>
  );

  return (
    <div className="flex flex-col h-full gap-3 p-4 sm:p-5 bg-app-surface-page">
      <FormatContext.Provider value={{
        format: currentFormat,
        setFormat: (f) => setCurrentFormat(prev => ({ ...prev, ...f })),
        clearFormat: () => setCurrentFormat({}),
      }}>
        {/* 页眉：工具栏卡片（含表格名称 + 操作按钮 + 视图开关） */}
        <SmartSheetToolbar
          sheetName={sheet.name}
          viewOptions={viewOptions}
          onViewOptionChange={handleViewOptionChange}
          onAddRow={() => addRow()}
          onAddColumn={() => {
            updateColumn(`col_${Date.now()}`, { key: `col_${Date.now()}`, label: '新列', type: 'text', width: 110 });
          }}
          onImport={() => setShowImport(true)}
          onExport={handleExport}
          onSave={() => { toast.success('已保存'); setIsDirty(false); }}
          onUndo={() => undoRef.current()}
          onRedo={() => redoRef.current()}
          onSearch={() => setShowFind(true)}
          canUndo={undoRedo.canUndo}
          canRedo={undoRedo.canRedo}
          isDirty={isDirty}
        />

        {/* 主体：表格卡片（填满剩余高度） */}
        <div className="flex-1 min-h-0 rounded-[14px] border border-app-border bg-app-surface-container overflow-hidden shadow-app-card">
          <SmartSheetGrid
            columns={sheet.columnsConfig}
            rows={rows}
            layoutMode={sheet.layoutMode}
            viewOptions={viewOptions}
            selectedRowIds={selectedRowIds}
            conditionalRules={condRules}
            onCellEdit={handleCellEdit}
            onColumnConfigClick={(colKey) => {
              const col = sheet.columnsConfig.find((c) => c.key === colKey);
              if (col) setSelectedColumn(col);
            }}
            onUndoRedoState={handleUndoRedoState}
            onRowSelect={(rowId, selected) => {
              setSelectedRowIds((prev) => { const n = new Set(prev); selected ? n.add(rowId) : n.delete(rowId); return n; });
            }}
            onAddRow={(afterRowId) => insertRow(afterRowId)}
            onDeleteRows={(ids) => deleteRows(ids)}
            onDuplicateRow={(rowId) => duplicateRow(rowId)}
            onMoveRow={(rowId, dir) => moveRow(rowId, dir)}
          />
        </div>

        {/* 页脚：紧凑状态指示器 */}
        <SmartSheetStatusBar
          rows={rows}
          columns={sheet.columnsConfig}
          selectedColumn={selectedColumn}
          onColumnClick={(col) => setSelectedColumn(col)}
        />

        {/* 底部标签栏 */}
        <SmartSheetTabsRow sheets={sheetTabs} activeId={id || 'current'} onSelect={() => {}} />

        {/* 条件格式面板 */}
        <ConditionalFormatPanel
          columns={sheet.columnsConfig}
          rules={condRules}
          onRulesChange={setCondRules}
          open={viewOptions.conditionalFormat}
          onClose={() => setViewOptions(prev => ({ ...prev, conditionalFormat: false }))}
        />

        {/* 查找替换弹窗 */}
        {showFind && (
          <FindReplaceDialog
            open={showFind}
            onClose={() => setShowFind(false)}
            rows={rows}
            onReplace={(rowId, colKey, newVal) => updateCell(rowId, colKey, JSON.stringify(newVal))}
          />
        )}

        {/* 导入弹窗 */}
        {showImport && (
          <ImportDialog
            sheetId={id!}
            columns={sheet.columnsConfig}
            open={showImport}
            onClose={() => setShowImport(false)}
            onImported={() => { invalidate(); setShowImport(false); }}
          />
        )}
      </FormatContext.Provider>
    </div>
  );
}
