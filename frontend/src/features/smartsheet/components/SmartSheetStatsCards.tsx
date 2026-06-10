// SmartSheetStatsCards — 🍱 Bento 顶部统计卡片行
import React from 'react';
import type { SmartSheetRow, ColumnConfig } from '@/features/smartsheet/types';

interface StatsCardsProps {
  rows: SmartSheetRow[];
  columns: ColumnConfig[];
}

const cardClass = `
  flex flex-col gap-1.5 px-4 py-3.5
  rounded-[14px] border border-app-border bg-app-surface-container
  shadow-app-card
`.replace(/\s+/g, ' ').trim();

export default function SmartSheetStatsCards({ rows, columns }: StatsCardsProps) {
  const fillRate = columns.length > 0 && rows.length > 0
    ? Math.round((rows.reduce((acc, r) =>
        acc + Object.values(r.cellData || {}).filter(v => v && v.trim()).length, 0
      ) / (rows.length * columns.length)) * 100)
    : 0;

  const emptyCols = columns.filter(c =>
    rows.every(r => !(r.cellData || {})[c.key]?.trim())
  ).length;

  return (
    <div className="grid grid-cols-4 gap-3.5 shrink-0">
      {/* 总行数 — warm accent */}
      <div className={cardClass}
           style={{ borderLeft: '3px solid var(--app-color-accent)' }}>
        <span className="text-[12px] font-medium text-app-text-secondary uppercase tracking-wider">📋 总行数</span>
        <span className="text-[28px] font-bold text-app-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>{rows.length}</span>
        <span className="text-[11px] text-app-text-tertiary flex gap-2.5">
          <span>实体行</span><span>{rows.length}/500</span>
        </span>
      </div>

      {/* 总列数 — steel secondary */}
      <div className={cardClass}
           style={{ borderLeft: '3px solid var(--app-color-accent-secondary)' }}>
        <span className="text-[12px] font-medium text-app-text-secondary uppercase tracking-wider">📊 总列数</span>
        <span className="text-[28px] font-bold text-app-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>{columns.length}</span>
        <span className="text-[11px] text-app-text-tertiary flex gap-2.5">
          <span>指标维度</span><span>{columns.length}/100</span>
        </span>
      </div>

      {/* 填写率 — success */}
      <div className={cardClass}
           style={{ borderLeft: '3px solid var(--app-color-feedback-success)' }}>
        <span className="text-[12px] font-medium text-app-text-secondary uppercase tracking-wider">✅ 填写率</span>
        <span className="text-[28px] font-bold text-app-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>{fillRate}%</span>
        <span className="text-[11px] text-app-text-tertiary flex gap-2.5">
          <span>已填/总格</span>
          <span className="text-app-feedback-success font-medium">↑ 正常</span>
        </span>
      </div>

      {/* 空值列 — warning */}
      <div className={cardClass}
           style={{ borderLeft: '3px solid var(--app-color-feedback-warning)' }}>
        <span className="text-[12px] font-medium text-app-text-secondary uppercase tracking-wider">📝 空值列</span>
        <span className="text-[28px] font-bold text-app-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>{emptyCols}</span>
        <span className="text-[11px] text-app-text-tertiary flex gap-2.5">
          <span>全列为空</span><span>查看 →</span>
        </span>
      </div>
    </div>
  );
}
