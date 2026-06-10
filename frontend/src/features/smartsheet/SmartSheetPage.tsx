// SmartSheetPage — 🍱 Bento 卡片布局（紧凑型：页眉工具栏 → 表格卡片 → 页脚状态栏 + 标签）
import React, { useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import SmartSheetToolbar from './components/SmartSheetToolbar';
import SmartSheetGrid from './components/SmartSheetGrid';
import SmartSheetStatusBar from './components/SmartSheetStatusBar';
import SmartSheetTabsRow from './components/SmartSheetTabsRow';
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
      {/* 页眉：工具栏卡片（含表格名称 + 操作按钮 + 视图开关） */}
      <SmartSheetToolbar
        sheetName={sheet.name}
        viewOptions={viewOptions}
        onViewOptionChange={handleViewOptionChange}
        onAddRow={() => addRow()}
        onAddColumn={() => {
          updateColumn(`col_${Date.now()}`, { key: `col_${Date.now()}`, label: '新列', type: 'text', width: 110 });
        }}
        onImport={() => toast('导入功能将在下一步实现')}
        onExport={handleExport}
        onSave={() => toast.success('已保存')}
        onUndo={() => {}}
        onRedo={() => {}}
        onSearch={() => {}}
      />

      {/* 主体：表格卡片（填满剩余高度） */}
      <div className="flex-1 min-h-0 rounded-[14px] border border-app-border bg-app-surface-container overflow-hidden shadow-app-card">
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
            setSelectedRowIds((prev) => { const n = new Set(prev); selected ? n.add(rowId) : n.delete(rowId); return n; });
          }}
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
    </div>
  );
}
