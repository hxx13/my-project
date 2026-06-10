// frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx
import React from 'react';
import type { ViewOptions } from '@/features/smartsheet/types';

interface SmartSheetToolbarProps {
  sheetName: string;
  viewOptions: ViewOptions;
  onViewOptionChange: (key: keyof ViewOptions) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onImport: () => void;
  onExport: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSearch: () => void;
}

export default function SmartSheetToolbar({
  sheetName,
  viewOptions,
  onViewOptionChange,
  onAddRow,
  onAddColumn,
  onImport,
  onExport,
  onSave,
  onUndo,
  onRedo,
  onSearch,
}: SmartSheetToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-app-border bg-app-surface-container flex-wrap shrink-0">
      {/* Sheet name */}
      <span className="text-sm font-semibold text-app-text-primary mr-2">{sheetName}</span>
      <span className="w-px h-4 bg-app-border" />

      <button onClick={onImport}
        className="px-2.5 py-1 text-xs font-medium rounded-app-element bg-app-accent text-app-text-inverse hover:bg-app-accent-hover transition-colors">
        📥 导入
      </button>
      <button onClick={onExport}
        className="px-2.5 py-1 text-xs font-medium rounded-app-element border border-app-border text-app-text-secondary hover:bg-app-surface-hover transition-colors">
        📤 导出
      </button>
      <span className="w-px h-4 bg-app-border" />
      <button onClick={onAddRow}
        className="px-2 py-1 text-xs text-app-text-secondary hover:text-app-text-primary transition-colors">
        ＋ 行
      </button>
      <button onClick={onAddColumn}
        className="px-2 py-1 text-xs text-app-text-secondary hover:text-app-text-primary transition-colors">
        ＋ 列
      </button>
      <span className="w-px h-4 bg-app-border" />

      {/* View micro-toggles */}
      <span className="text-[10px] uppercase tracking-wider text-app-text-tertiary">视图</span>
      <ViewToggle label="斑马纹" active={viewOptions.zebra} onClick={() => onViewOptionChange('zebra')} />
      <ViewToggle label="冻结" active={viewOptions.freeze} onClick={() => onViewOptionChange('freeze')} />
      <ViewToggle label="条件格式" active={viewOptions.conditionalFormat} onClick={() => onViewOptionChange('conditionalFormat')} />

      <span className="flex-1" />

      <span className="text-[10px] uppercase tracking-wider text-app-text-tertiary">编辑</span>
      <button onClick={onSearch}
        className="px-2 py-1 text-xs text-app-text-secondary hover:text-app-text-primary">🔍 查找</button>
      <button onClick={onUndo}
        className="px-2 py-1 text-xs text-app-text-tertiary">↩</button>
      <button onClick={onRedo}
        className="px-2 py-1 text-xs text-app-text-tertiary">↪</button>
      <span className="w-px h-4 bg-app-border" />
      <button onClick={onSave}
        className="px-2.5 py-1 text-xs font-medium rounded-app-element border border-app-border text-app-text-secondary hover:bg-app-surface-hover">
        💾 保存
      </button>
    </div>
  );
}

function ViewToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all
        ${active
          ? 'bg-app-accent-soft border border-app-accent text-app-accent'
          : 'bg-app-surface-hover border border-app-border text-app-text-secondary'
        }`}>
      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center text-[8px]
        ${active ? 'border-app-accent bg-app-accent text-app-text-inverse' : 'border-app-border'}`}>
        {active ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}
