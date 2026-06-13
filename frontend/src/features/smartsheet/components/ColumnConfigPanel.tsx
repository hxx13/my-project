// ColumnConfigPanel — side panel for column management (stub for Task 9 compile)
import React from 'react';
import type { ColumnConfig } from '@/features/smartsheet/types';

interface Props {
  sheetId: string;
  columns: ColumnConfig[];
  open: boolean;
  onClose: () => void;
  onChange: () => void;
}

export default function ColumnConfigPanel({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-y-0 right-0 w-[320px] bg-app-surface-container border-l border-app-border shadow-lg z-[var(--z-modal)] flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-app-border">
        <span className="font-semibold text-sm text-app-text-primary">列配置</span>
        <div className="flex-1" />
        <button onClick={onClose} className="p-1 rounded hover:bg-app-surface-hover text-app-text-secondary">x</button>
      </div>
      <div className="p-4 text-sm text-app-text-secondary">Task 10 — 完整列配置面板待实现</div>
    </div>
  );
}
