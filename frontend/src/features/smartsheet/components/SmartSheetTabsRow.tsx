// SmartSheetTabsRow — Bento 底部 Sheet 标签栏
import React from 'react';

interface TabsRowProps {
  sheets: { id: string; name: string }[];
  activeId: string;
  onSelect: (id: string) => void;
}

export default function SmartSheetTabsRow({ sheets, activeId, onSelect }: TabsRowProps) {
  return (
    <div className="flex items-center gap-0.5 px-3 py-1 rounded-[14px] border border-app-border bg-app-surface-container shrink-0"
         style={{ boxShadow: 'var(--app-elevation-card)' }}>
      {sheets.map((s) => (
        <button key={s.id}
          onClick={() => onSelect(s.id)}
          className={`px-3.5 py-1.5 text-[12px] font-medium rounded-[10px] transition-colors border border-transparent
            ${s.id === activeId
              ? 'bg-app-accent-soft text-app-accent font-semibold'
              : 'text-app-text-secondary hover:bg-app-surface-hover'
            }`}>
          📊 {s.name}
        </button>
      ))}
      <button className="px-2 py-1.5 text-[12px] text-app-text-tertiary hover:text-app-text-secondary transition-colors">
        ＋
      </button>
    </div>
  );
}
