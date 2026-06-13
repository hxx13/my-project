// SmartSheetPage — V3: VTable-native first. 5-button toolbar.
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ListTable } from '@visactor/react-vtable';
import type { ListTable as ListTableInstance } from '@visactor/vtable';
import { useSmartSheetData } from './hooks/useSmartSheetData';
import { useSmartSheetMutation } from './hooks/useSmartSheetMutation';
import ImportDialog from './components/ImportDialog';
import ColumnConfigPanel from './components/ColumnConfigPanel';
import toast from 'react-hot-toast';
import { Plus, FileUp, ArrowDownToLine, Save, Settings, Table2 } from 'lucide-react';

export default function SmartSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { sheet, vtableColumns, vtableRecords, theme, isLoading, refetch } = useSmartSheetData(id);
  const { handleCellChange, handleAddRow, handleDeleteRows, handleSaveTemplate } = useSmartSheetMutation(id);
  const [showImport, setShowImport] = useState(false);
  const [showColPanel, setShowColPanel] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const tableRef = useRef<ListTableInstance | null>(null);

  const option = useMemo(() => ({
    columns: vtableColumns,
    records: vtableRecords,
    theme,
    hover: { highlightMode: 'row' as const },
    select: { mode: 'cell' as const },
    menu: { contextMenuItems: ['copy', 'paste', 'deleteRow', 'insertRow', 'undo', 'redo'] },
    editCellTrigger: 'click' as const,
    keyboardOptions: { editCellOnEnter: true, moveEditCellOnArrowKeys: false },
    autoFill: true,
  }), [vtableColumns, vtableRecords, theme]);

  const onChangeCellValue = useCallback((args: { col: number; row: number; rawValue: unknown }) => {
    const t = tableRef.current; if (!t) return;
    const recs = (t.records ?? []) as Record<string, unknown>[];
    const rec = recs[args.row]; if (!rec) return;
    const rowId = rec.__id as string;
    const version = (rec.__version as number) ?? 0;
    const colDef = (t.columns?.[args.col] ?? {}) as { field?: string };
    const colKey = colDef.field ?? '';
    if (colKey && !colKey.startsWith('__')) handleCellChange(rowId, colKey, args.rawValue, version);
  }, [handleCellChange]);

  const handleExportCsv = useCallback(async () => {
    if (!tableRef.current) return;
    try {
      const { downloadCsv } = await import('@visactor/vtable-export');
      downloadCsv(tableRef.current, `${sheet?.name ?? 'export'}.csv`);
      toast.success('CSV 已下载');
    } catch { toast.error('导出失败'); }
    setShowExportMenu(false);
  }, [sheet]);

  const handleExportXlsx = useCallback(() => {
    if (sheet?.id) {
      const a = document.createElement('a');
      a.href = `/api/admin/smartsheet/${sheet.id}/export/xlsx`;
      a.download = `${sheet.name ?? 'export'}.xlsx`; a.click();
    }
    setShowExportMenu(false);
  }, [sheet]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-app-text-secondary text-sm">加载中...</div>
  );

  return (
    <div className="flex flex-col h-full gap-3 p-4 bg-app-surface-page" data-admin-chrome-ctx-surface="true">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-[var(--app-radius-container)] bg-app-surface-container border border-app-border shadow-app-card">
        <Table2 className="w-5 h-5 text-app-accent flex-shrink-0" />
        <span className="font-semibold text-app-text-primary text-sm truncate max-w-[200px]">{sheet?.name ?? '加载中...'}</span>
        <div className="flex-1" />
        <button onClick={handleAddRow} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium bg-app-accent text-white hover:opacity-90 transition-opacity flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> 添加行
        </button>
        <button onClick={() => setShowImport(true)} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border border-app-border text-app-text-secondary hover:bg-app-surface-hover transition-colors flex items-center gap-1">
          <FileUp className="w-3.5 h-3.5" /> 导入
        </button>
        <div className="relative">
          <button onClick={() => setShowExportMenu(p => !p)} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border border-app-border text-app-text-secondary hover:bg-app-surface-hover transition-colors flex items-center gap-1">
            <ArrowDownToLine className="w-3.5 h-3.5" /> 导出
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-[140px] rounded-[10px] border border-app-border bg-app-surface-elevated shadow-lg py-1 z-[var(--z-dropdown)]">
              <button onClick={handleExportCsv} className="w-full text-left px-3 py-1.5 text-[12px] text-app-text-secondary hover:bg-app-surface-hover">CSV 格式</button>
              <button onClick={handleExportXlsx} className="w-full text-left px-3 py-1.5 text-[12px] text-app-text-secondary hover:bg-app-surface-hover">Excel 格式</button>
            </div>
          )}
        </div>
        <button onClick={handleSaveTemplate} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border border-app-border text-app-text-secondary hover:bg-app-surface-hover transition-colors flex items-center gap-1">
          <Save className="w-3.5 h-3.5" /> 存模板
        </button>
        <button onClick={() => setShowColPanel(true)} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border border-app-border text-app-text-secondary hover:bg-app-surface-hover transition-colors flex items-center gap-1">
          <Settings className="w-3.5 h-3.5" /> 列
        </button>
      </div>

      {/* ── VTable Grid ── */}
      <div className="flex-1 min-h-0 rounded-[var(--app-radius-container)] border border-app-border bg-app-surface-container shadow-app-card overflow-hidden">
        {vtableColumns.length > 0 ? (
          <ListTable option={option} height="100%" onReady={(inst: ListTableInstance) => { tableRef.current = inst; }} onChangeCellValue={onChangeCellValue} />
        ) : (
          <div className="flex items-center justify-center h-full text-app-text-secondary text-sm">暂无列定义，请点击「列」按钮添加</div>
        )}
      </div>

      {/* ── Modals ── */}
      {showImport && <ImportDialog sheetId={id!} columns={sheet?.columnsConfig ?? []} open={showImport} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); refetch(); }} />}
      {showColPanel && <ColumnConfigPanel sheetId={id!} columns={sheet?.columnsConfig ?? []} open={showColPanel} onClose={() => setShowColPanel(false)} onChange={() => refetch()} />}
    </div>
  );
}
