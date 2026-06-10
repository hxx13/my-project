// SmartSheetStatusBar — 紧凑页脚状态指示器（行数/列数/填写率 + 列快速跳转）
import React from 'react';
import type { SmartSheetRow, ColumnConfig } from '@/features/smartsheet/types';

interface StatusBarProps {
  rows: SmartSheetRow[];
  columns: ColumnConfig[];
  selectedColumn: ColumnConfig | null;
  onColumnClick: (col: ColumnConfig) => void;
}

export default function SmartSheetStatusBar({ rows, columns, selectedColumn, onColumnClick }: StatusBarProps) {
  const fillRate = columns.length > 0 && rows.length > 0
    ? Math.round((rows.reduce((acc, r) =>
        acc + Object.values(r.cellData || {}).filter(v => v && v.trim()).length, 0
      ) / (rows.length * columns.length)) * 100)
    : 0;

  const emptyCols = columns.filter(c =>
    rows.every(r => !(r.cellData || {})[c.key]?.trim())
  ).length;

  return (
    <div className="flex items-center gap-3 px-4 h-8 rounded-[10px] border border-app-border bg-app-surface-container text-[11px] shrink-0 select-none shadow-app-card">
      {/* 核心指标 */}
      <span className="text-app-text-primary font-semibold">{rows.length} 行</span>
      <span className="text-app-text-tertiary">·</span>
      <span className="text-app-text-primary font-semibold">{columns.length} 列</span>
      <span className="text-app-text-tertiary">·</span>
      <span className="text-app-text-secondary">
        填写率 <span className="text-app-text-primary font-semibold">{fillRate}%</span>
      </span>
      {emptyCols > 0 && (
        <>
          <span className="text-app-text-tertiary">·</span>
          <span className="text-app-feedback-warning">{emptyCols} 列为空</span>
        </>
      )}

      {selectedColumn && (
        <>
          <span className="text-app-border mx-0.5">│</span>
          <span className="text-app-text-secondary">
            当前列 <span className="font-semibold text-app-text-primary">{selectedColumn.label}</span>
            <span className="ml-1 text-app-text-tertiary">({selectedColumn.type})</span>
          </span>
        </>
      )}

      <span className="flex-1" />

      {/* 列快速跳转 */}
      <span className="hidden lg:flex items-center gap-1">
        {columns.slice(0, 8).map((col) => (
          <button key={col.key} onClick={() => onColumnClick(col)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors
              ${selectedColumn?.key === col.key
                ? 'bg-app-accent-soft text-app-accent font-medium'
                : 'hover:bg-app-surface-hover text-app-text-tertiary'}`}>
            {col.label}
          </button>
        ))}
        {columns.length > 8 && <span className="text-app-text-tertiary">+{columns.length - 8}</span>}
      </span>
    </div>
  );
}
