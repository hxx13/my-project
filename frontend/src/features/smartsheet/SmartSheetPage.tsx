// frontend/src/features/smartsheet/SmartSheetPage.tsx
import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import SmartSheetToolbar from './components/SmartSheetToolbar';
import SmartSheetGrid from './components/SmartSheetGrid';
import SmartSheetStatusBar from './components/SmartSheetStatusBar';
import { useSmartSheet } from './hooks/useSmartSheet';
import { DEFAULT_VIEW_OPTIONS } from './types';
import type { ViewOptions, ColumnConfig } from './types';
import toast from 'react-hot-toast';

export default function SmartSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { sheet, rows, isLoading, updateCell, addRow, deleteRows, updateColumn } = useSmartSheet(id);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [selectedColumn, setSelectedColumn] = useState<ColumnConfig | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const handleViewOptionChange = useCallback((key: keyof ViewOptions) => {
    setViewOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleExport = useCallback(() => {
    if (!id) return;
    const url = `/api/admin/smartsheet/${id}/export`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheet?.name || 'export'}.csv`;
    a.click();
  }, [id, sheet]);

  const handleImport = useCallback(() => {
    toast('导入功能将在下一步实现');
  }, []);

  if (isLoading) return <div className="flex items-center justify-center h-full text-app-text-secondary text-sm">加载中...</div>;
  if (!sheet) return <div className="flex items-center justify-center h-full text-app-feedback-danger text-sm">表格不存在</div>;

  return (
    <div className="flex flex-col h-full bg-app-surface-page">
      {/* 页眉：工具栏 */}
      <SmartSheetToolbar
        sheetName={sheet.name}
        viewOptions={viewOptions}
        onViewOptionChange={handleViewOptionChange}
        onAddRow={() => addRow()}
        onAddColumn={() => {
          const newKey = `col_${Date.now()}`;
          updateColumn(newKey, {
            key: newKey, label: '新列', type: 'text', width: 110,
          });
        }}
        onImport={handleImport}
        onExport={handleExport}
        onSave={() => toast.success('已保存')}
        onUndo={() => {}}
        onRedo={() => {}}
        onSearch={() => {}}
      />

      {/* 主体：表格 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SmartSheetGrid
          columns={sheet.columnsConfig}
          rows={rows}
          layoutMode={sheet.layoutMode}
          viewOptions={viewOptions}
          selectedRowIds={selectedRowIds}
          onCellEdit={updateCell}
          onColumnConfigClick={(colKey) => {
            const col = sheet.columnsConfig.find((c) => c.key === colKey);
            if (col) setSelectedColumn(col);
          }}
          onRowSelect={(rowId, selected) => {
            setSelectedRowIds((prev) => {
              const next = new Set(prev);
              selected ? next.add(rowId) : next.delete(rowId);
              return next;
            });
          }}
        />
      </div>

      {/* 页脚：紧凑状态栏 */}
      <SmartSheetStatusBar
        rows={rows}
        columns={sheet.columnsConfig}
        selectedColumn={selectedColumn}
        onColumnClick={(col) => setSelectedColumn(col)}
      />
    </div>
  );
}
