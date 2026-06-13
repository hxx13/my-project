// SmartSheetPage — VTable Canvas 表格（ARCO 主题 + Bento 卡片布局）
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ListTable } from '@visactor/react-vtable';
import * as VTable from '@visactor/vtable';
import type { ListTable as ListTableInstance } from '@visactor/vtable';
import { useSmartSheetData } from './hooks/useSmartSheetData';
import { useSmartSheetMutation } from './hooks/useSmartSheetMutation';
import ImportDialog from './components/ImportDialog';
import toast from 'react-hot-toast';
import { Plus, FileUp, ArrowDownToLine, Save, Search, Table2, Trash2 } from 'lucide-react';

const CELL_TYPE_MAP: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  progressbar: 'progressbar',
};

export default function SmartSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { sheet, rows, isLoading, refetch } = useSmartSheetData(id);
  const { handleCellChange, handleAddRow, handleDeleteRows } = useSmartSheetMutation(id);
  const [showImport, setShowImport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const tableRef = useRef<ListTableInstance | null>(null);

  // ── Build VTable option from sheet data ──
  const option = useMemo(() => {
    if (!sheet) return {};

    const cols = sheet.columnsConfig.map((col) => {
      const def: Record<string, unknown> = {
        field: col.key,
        title: col.label,
        width: col.width ?? 120,
      };
      const vtype = CELL_TYPE_MAP[col.type];
      if (vtype) def.cellType = vtype;
      if ((col.type === 'select' || col.type === 'multi-select') && col.options) {
        def.fieldFormat = {
          type: col.type === 'multi-select' ? 'multiple' : 'single',
          options: col.options.map((o) => ({ label: o, value: o })),
        };
      }
      if (col.type === 'number') def.fieldFormat = { type: 'number' };
      if (col.type === 'date') def.fieldFormat = { type: 'date' };
      return def;
    });

    const recs = rows.map((row) => ({
      __id: row.id,
      __version: row.version,
      ...row.cellData,
    }));

    return {
      columns: cols,
      records: recs,
      hover: { highlightMode: 'row' } as const,
      select: { mode: 'cell' } as const,
      menu: { contextMenuItems: ['copy', 'paste', 'deleteRow', 'insertRow'] },
      editCellTrigger: 'click' as const,
      keyboardOptions: { editCellOnEnter: true },
      theme: VTable.themes.ARCO,
    };
  }, [sheet, rows]);

  // ── Cell edit → PATCH API ──
  const onChangeCellValue = useCallback(
    (args: { col: number; row: number; rawValue: unknown }) => {
      const t = tableRef.current;
      if (!t) return;
      const recs = (t.records ?? []) as Record<string, unknown>[];
      const rec = recs[args.row];
      if (!rec) return;
      const rowId = rec.__id as string;
      const version = (rec.__version as number) ?? 0;
      const colDef = (t.columns?.[args.col] ?? {}) as { field?: string };
      const colKey = colDef.field ?? '';
      if (colKey && !colKey.startsWith('__')) {
        handleCellChange(rowId, colKey, args.rawValue, version);
      }
    },
    [handleCellChange],
  );

  // ── Export ──
  const handleExportCsv = useCallback(async () => {
    if (!tableRef.current) return;
    try {
      const { downloadCsv } = await import('@visactor/vtable-export');
      downloadCsv(tableRef.current, `${sheet?.name ?? 'export'}.csv`);
      toast.success('CSV 已下载');
    } catch { toast.error('导出失败'); }
  }, [sheet]);

  const handleExportXlsx = useCallback(() => {
    if (sheet?.id) {
      const a = document.createElement('a');
      a.href = `/api/admin/smartsheet/${sheet.id}/export/xlsx`;
      a.download = `${sheet.name ?? 'export'}.xlsx`;
      a.click();
    }
  }, [sheet]);

  // ── Delete selected ──
  const handleDeleteSelected = useCallback(() => {
    const t = tableRef.current;
    if (!t) return;
    const sel = t.getSelectedCellInfos?.();
    if (!sel?.length) { toast('请先选择行'); return; }
    const recs = (t.records ?? []) as Record<string, unknown>[];
    const rowIds = [...new Set(sel.map((s: { row: number }) => recs[s.row]?.__id).filter(Boolean))] as string[];
    if (rowIds.length) handleDeleteRows(rowIds);
  }, [handleDeleteRows]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--app-color-text-secondary)] text-sm">
        加载中...
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full gap-3 p-4 bg-[var(--app-color-surface-page)]"
      data-admin-chrome-ctx-surface="true"
    >
      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-[var(--app-radius-container)]
          bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)]
          shadow-[var(--app-shadow-card)]"
      >
        <Table2 className="w-5 h-5 text-[var(--app-color-primary)] flex-shrink-0" />
        <span className="font-semibold text-[var(--app-color-text-primary)] text-sm truncate max-w-[200px]">
          {sheet?.name ?? '加载中...'}
        </span>
        <div className="flex-1" />

        <button onClick={handleAddRow}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            bg-[var(--app-color-primary)] text-white hover:opacity-90 transition-opacity
            flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> 添加行
        </button>
        <button onClick={handleDeleteSelected}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            bg-[var(--app-color-feedback-danger)] text-white hover:opacity-90
            flex items-center gap-1">
          <Trash2 className="w-3.5 h-3.5" /> 删除
        </button>
        <button onClick={() => setShowSearch((p) => !p)}
          className={`px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border
            transition-colors flex items-center gap-1 ${
              showSearch
                ? 'bg-[var(--app-color-primary)] text-white border-transparent'
                : 'border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)]'
            }`}>
          <Search className="w-3.5 h-3.5" /> 搜索
        </button>
        <button onClick={() => setShowImport(true)}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
            hover:bg-[var(--app-color-surface-container-hover)] transition-colors
            flex items-center gap-1">
          <FileUp className="w-3.5 h-3.5" /> 导入
        </button>
        <button onClick={handleExportCsv}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
            hover:bg-[var(--app-color-surface-container-hover)] transition-colors
            flex items-center gap-1">
          <ArrowDownToLine className="w-3.5 h-3.5" /> CSV
        </button>
        <button onClick={handleExportXlsx}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
            hover:bg-[var(--app-color-surface-container-hover)] transition-colors
            flex items-center gap-1">
          <Save className="w-3.5 h-3.5" /> Excel
        </button>
      </div>

      {/* ── VTable grid ── */}
      <div
        className="flex-1 min-h-0 rounded-[var(--app-radius-container)]
          border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]
          shadow-[var(--app-shadow-card)] overflow-hidden"
      >
        {option.columns ? (
          <ListTable
            option={option}
            height="100%"
            onReady={(inst: ListTableInstance) => { tableRef.current = inst; }}
            onChangeCellValue={onChangeCellValue}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--app-color-text-secondary)] text-sm">
            暂无数据
          </div>
        )}
      </div>

      {/* ── Import dialog ── */}
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
