// frontend/src/features/smartsheet/components/SmartSheetStatusBar.tsx
import React from 'react';
import type { SmartSheetRow, ColumnConfig } from '@/features/smartsheet/types';

interface SmartSheetStatusBarProps {
  rows: SmartSheetRow[];
  columns: ColumnConfig[];
  selectedColumn: ColumnConfig | null;
  onColumnClick: (col: ColumnConfig) => void;
}

export default function SmartSheetStatusBar({
  rows, columns, selectedColumn, onColumnClick,
}: SmartSheetStatusBarProps) {
  const fillRate = columns.length > 0 && rows.length > 0
    ? Math.round((rows.reduce((acc, r) =>
        acc + Object.values(r.cellData || {}).filter(v => v && v.trim()).length, 0
      ) / (rows.length * columns.length)) * 100)
    : 0;

  return (
    <div className="flex items-center gap-3 px-3 h-7 border-t border-app-border bg-app-surface-page text-[11px] text-app-text-tertiary shrink-0 select-none">
      {/* Row/column counts */}
      <span>{rows.length} 行</span>
      <span className="text-app-border">·</span>
      <span>{columns.length} 列</span>
      <span className="text-app-border">·</span>
      <span>填写率 {fillRate}%</span>

      {selectedColumn && (
        <>
          <span className="text-app-border">|</span>
          <span className="text-app-text-secondary">
            当前列: <span className="font-medium text-app-text-primary">{selectedColumn.label}</span>
            <span className="ml-1 text-app-text-tertiary">({selectedColumn.type})</span>
          </span>
        </>
      )}

      <span className="flex-1" />

      {/* Column quick-jump pills */}
      <span className="hidden lg:flex items-center gap-1">
        {columns.slice(0, 8).map((col) => (
          <button key={col.key}
            onClick={() => onColumnClick(col)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors
              ${selectedColumn?.key === col.key
                ? 'bg-app-accent-soft text-app-accent'
                : 'hover:bg-app-surface-hover text-app-text-tertiary'
              }`}>
            {col.label}
          </button>
        ))}
        {columns.length > 8 && <span className="text-app-text-tertiary">+{columns.length - 8}</span>}
      </span>
    </div>
  );
}
