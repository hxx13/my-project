// SmartSheetPage — VTable version (Bento card layout)
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ListTable } from '@visactor/react-vtable';
import { SearchComponent } from '@visactor/vtable-search';
import { downloadCsv } from '@visactor/vtable-export';
import type { ListTable as ListTableInstance } from '@visactor/vtable';
import { useSmartSheetData } from './hooks/useSmartSheetData';
import { useSmartSheetMutation } from './hooks/useSmartSheetMutation';
import { buildVTableTheme, getThemeName } from './vtable-config/theme';
import { createCellEditHandler } from './vtable-config/editors';
import ImportDialog from './components/ImportDialog';
import toast from 'react-hot-toast';
import { Plus, FileUp, ArrowDownToLine, Save, Search, Table2, Trash2 } from 'lucide-react';

export default function SmartSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { sheet, columns, records, isLoading, refetch } = useSmartSheetData(id);
  const { handleCellChange, handleAddRow, handleDeleteRows } = useSmartSheetMutation(id);
  const [showImport, setShowImport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const tableRef = useRef<ListTableInstance>(null);

  // VTable option — built from columns and records
  const option = useMemo(() => ({
    columns,
    records,
    hover: { highlightMode: 'row' as const },
    menu: {
      contextMenuItems: ['copy', 'paste', 'deleteRow', 'insertRow'],
    },
    editCellTrigger: 'click' as const,
    keyboardOptions: { editCellOnEnter: true },
    autoFill: true,
  }), [columns, records]);

  // Cell edit handler
  const onCellChange = useMemo(
    () => createCellEditHandler({ records, onCellChange: handleCellChange }),
    [records, handleCellChange],
  );

  // Theme
  const theme = useMemo(() => buildVTableTheme(), []);

  // Export handlers
  const handleExportCsv = useCallback(() => {
    if (tableRef.current) downloadCsv(tableRef.current, `${sheet?.name ?? 'export'}.csv`);
  }, [sheet]);

  const handleExportXlsx = useCallback(() => {
    if (sheet?.id) {
      const a = document.createElement('a');
      a.href = `/api/admin/smartsheet/${sheet.id}/export/xlsx`;
      a.download = `${sheet.name ?? 'export'}.xlsx`;
      a.click();
    }
  }, [sheet]);

  // Delete selected rows
  const handleDeleteSelected = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const selected = table.getSelectedCellInfos?.();
    if (!selected?.length) { toast('请先选择行'); return; }
    const rowIds = [...new Set(selected.map((s: { row: number }) => records[s.row]?.__id).filter(Boolean))] as string[];
    if (rowIds.length) handleDeleteRows(rowIds);
  }, [records, handleDeleteRows]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-[var(--app-color-text-secondary)] text-sm">
      加载中...
    </div>
  );

  return (
    <div className="flex flex-col h-full gap-3 p-4 bg-[var(--app-color-surface-page)]"
         data-admin-chrome-ctx-surface="true">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-[var(--app-radius-container)]
        bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)]
        shadow-[var(--app-shadow-card)]">
        <Table2 className="w-5 h-5 text-[var(--app-color-primary)]" />
        <span className="font-semibold text-[var(--app-color-text-primary)] text-sm truncate max-w-[200px]">
          {sheet?.name ?? '加载中...'}
        </span>
        <div className="flex-1" />
        <button onClick={handleAddRow}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            bg-[var(--app-color-primary)] text-white hover:opacity-90 transition-opacity flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> 添加行
        </button>
        <button onClick={handleDeleteSelected}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            bg-[var(--app-color-feedback-danger)] text-white hover:opacity-90 flex items-center gap-1">
          <Trash2 className="w-3.5 h-3.5" /> 删除
        </button>
        <button onClick={() => setShowSearch(!showSearch)}
          className={`px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border
            transition-colors flex items-center gap-1
            ${showSearch
              ? 'bg-[var(--app-color-primary)] text-white border-transparent'
              : 'border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)]'
            }`}>
          <Search className="w-3.5 h-3.5" /> 搜索
        </button>
        <button onClick={() => setShowImport(true)}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
            hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1">
          <FileUp className="w-3.5 h-3.5" /> 导入
        </button>
        <button onClick={handleExportCsv}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
            hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1">
          <ArrowDownToLine className="w-3.5 h-3.5" /> CSV
        </button>
        <button onClick={handleExportXlsx}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
            hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1">
          <Save className="w-3.5 h-3.5" /> Excel
        </button>
      </div>

      {/* Search bar (conditional) */}
      {showSearch && tableRef.current && (
        <div className="px-4 py-2 rounded-[var(--app-radius-container)]
          bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)]">
          <SearchComponent tableInstance={tableRef.current} />
        </div>
      )}

      {/* VTable grid */}
      <div className="flex-1 min-h-0 rounded-[var(--app-radius-container)]
        border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]
        shadow-[var(--app-shadow-card)] overflow-hidden">
        <ListTable
          ref={tableRef}
          option={option}
          theme={theme}
          themeName={getThemeName()}
          onChangeCellValue={onCellChange}
          height="100%"
        />
      </div>

      {/* Import dialog */}
      {showImport && (
        <ImportDialog
          sheetId={id!}
          columns={sheet?.columnsConfig ?? []}
          open={showImport}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refetch(); }}
        />
      )}
    </div>
  );
}
