// SmartSheetToolbar — 🍱 Bento 工具栏卡片
import React from 'react';
import { useNavigate } from 'react-router-dom';
import FormatBar from './FormatBar';
import type { ViewOptions } from '@/features/smartsheet/types';

interface ToolbarProps {
  sheetName: string;
  viewOptions: ViewOptions;
  onViewOptionChange: (key: keyof ViewOptions) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onImport: () => void;
  onExport: () => void;
  onSave: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSearch: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isDirty?: boolean;
}

export default function SmartSheetToolbar({
  sheetName, viewOptions, onViewOptionChange,
  onAddRow, onAddColumn, onImport, onExport, onSave,
  onUndo, onRedo, onSearch, canUndo, canRedo, isDirty,
}: ToolbarProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-[14px] border border-app-border bg-app-surface-container flex-wrap shrink-0 shadow-app-card">
      {/* Back to list */}
      <BentoBtn ghost onClick={() => navigate('/admin/smartsheet')}>← 返回</BentoBtn>
      <Divider />
      <FormatBar />
      <Divider />
      {/* Brand */}
      <span className="font-bold text-[13px] text-app-text-primary mr-1">📋 {sheetName}</span>
      <Divider />

      {/* Primary action */}
      <BentoBtn primary onClick={onImport}>📥 导入</BentoBtn>
      <BentoBtn onClick={onExport}>📤 导出</BentoBtn>
      <Divider />

      {/* Ghost actions */}
      <BentoBtn ghost onClick={onAddRow}>＋ 行</BentoBtn>
      <BentoBtn ghost onClick={onAddColumn}>＋ 列</BentoBtn>
      <Divider />

      {/* Toggle pills */}
      <BentoToggle label="斑马纹" active={viewOptions.zebra} onClick={() => onViewOptionChange('zebra')} />
      <BentoToggle label="冻结" active={viewOptions.freeze} onClick={() => onViewOptionChange('freeze')} />
      <BentoToggle label="条件格式" active={viewOptions.conditionalFormat} onClick={() => onViewOptionChange('conditionalFormat')} />

      <span className="flex-1" />

      <BentoBtn ghost onClick={onSearch}>🔍 查找</BentoBtn>
      <button
        onClick={canUndo ? onUndo : undefined}
        disabled={!canUndo}
        className={`px-1.5 py-1 text-[12px] transition-colors ${canUndo ? 'text-app-text-secondary hover:text-app-text-primary cursor-pointer' : 'text-app-text-tertiary opacity-50 cursor-not-allowed'}`}
        title="撤销 (Ctrl+Z)"
      >↩</button>
      <button
        onClick={canRedo ? onRedo : undefined}
        disabled={!canRedo}
        className={`px-1.5 py-1 text-[12px] transition-colors ${canRedo ? 'text-app-text-secondary hover:text-app-text-primary cursor-pointer' : 'text-app-text-tertiary opacity-50 cursor-not-allowed'}`}
        title="重做 (Ctrl+Y)"
      >↪</button>
      <Divider />
      <BentoBtn onClick={onSave}>
        {isDirty && <span className="text-[10px] text-app-feedback-warning mr-1">●</span>}
        💾 保存
      </BentoBtn>
    </div>
  );
}

// ── Bento Button variants ──
function BentoBtn({ primary, ghost, onClick, children }: {
  primary?: boolean; ghost?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  const base = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-[12.5px] font-medium transition-all cursor-pointer';
  if (primary) {
    return <button onClick={onClick} className={`${base} bg-app-accent-secondary text-white border border-transparent font-semibold hover:opacity-90`}>{children}</button>;
  }
  if (ghost) {
    return <button onClick={onClick} className={`${base} border border-transparent bg-transparent text-app-text-secondary hover:bg-app-surface-hover hover:text-app-text-primary`}>{children}</button>;
  }
  return <button onClick={onClick} className={`${base} border border-app-border bg-app-surface-container text-app-text-secondary hover:bg-app-surface-hover hover:text-app-text-primary`}>{children}</button>;
}

// ── Bento Toggle pill with visual switch knob ──
function BentoToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[20px] text-[11px] font-medium transition-all cursor-pointer border
        ${active
          ? 'bg-app-accent-soft border-app-accent text-app-accent'
          : 'bg-app-surface-container border-app-border text-app-text-secondary'
        }`}>
      {/* Switch knob */}
      <span className={`relative w-[26px] h-[15px] rounded-[8px] transition-all ${active ? 'bg-app-accent' : 'bg-app-border'}`}>
        <span className={`absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white transition-all ${active ? 'left-[13px]' : 'left-[2px]'}`} />
      </span>
      {label}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-[22px] bg-app-border shrink-0" />;
}
