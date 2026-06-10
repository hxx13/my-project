import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { ColumnConfig } from '@/features/smartsheet/types';

export interface ConditionRule {
  id: string;
  columnKey: string;
  operator: 'gte' | 'lte' | 'eq' | 'contains';
  value: string;
  style: 'great' | 'warn' | 'bad';
}

interface Props {
  columns: ColumnConfig[];
  rules: ConditionRule[];
  onRulesChange: (rules: ConditionRule[]) => void;
  open: boolean;
  onClose: () => void;
}

const OPERATOR_LABELS: Record<string, string> = {
  gte: '≥', lte: '≤', eq: '=', contains: '包含',
};
const STYLE_LABELS: Record<string, string> = {
  great: '达标', warn: '警告', bad: '危险',
};
const STYLE_BADGES: Record<string, string> = {
  great: '🟢', warn: '🟡', bad: '🔴',
};

function newRule(columnKey: string): ConditionRule {
  return {
    id: `cfr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    columnKey,
    operator: 'gte',
    value: '',
    style: 'great',
  };
}

export function evaluateRules(cellValue: string, columnKey: string, rules: ConditionRule[]): string {
  for (const rule of rules) {
    if (rule.columnKey !== columnKey) continue;
    const numVal = parseFloat(cellValue);
    const ruleVal = parseFloat(rule.value);
    switch (rule.operator) {
      case 'gte': if (!isNaN(numVal) && !isNaN(ruleVal) && numVal >= ruleVal) return `smartsheet-cf-${rule.style}`; break;
      case 'lte': if (!isNaN(numVal) && !isNaN(ruleVal) && numVal <= ruleVal) return `smartsheet-cf-${rule.style}`; break;
      case 'eq': if (cellValue === rule.value) return `smartsheet-cf-${rule.style}`; break;
      case 'contains': if (cellValue.toLowerCase().includes(rule.value.toLowerCase())) return `smartsheet-cf-${rule.style}`; break;
    }
  }
  return '';
}

export default function ConditionalFormatPanel({ columns, rules, onRulesChange, open, onClose }: Props) {
  const [defaultCol] = useState(() => columns[0]?.key || '');

  const addRule = () => onRulesChange([...rules, newRule(defaultCol)]);

  const updateRule = (id: string, patch: Partial<ConditionRule>) => {
    onRulesChange(rules.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const deleteRule = (id: string) => {
    onRulesChange(rules.filter(r => r.id !== id));
  };

  if (!open) return null;

  return (
    <div className="fixed right-6 top-[72px] w-[320px] max-h-[calc(100vh-120px)] overflow-y-auto z-40
                    rounded-[14px] border border-app-border bg-app-surface-elevated shadow-app-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-semibold text-app-text-primary">条件格式规则</h3>
        <button onClick={onClose}
          className="p-1 rounded-[8px] text-app-text-tertiary hover:text-app-text-primary hover:bg-app-surface-hover transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Rules list */}
      {rules.length === 0 && (
        <p className="text-[11.5px] text-app-text-tertiary mb-4">暂无规则，点击下方按钮添加。</p>
      )}

      <div className="flex flex-col gap-3">
        {rules.map(rule => {
          const col = columns.find(c => c.key === rule.columnKey);
          return (
            <div key={rule.id}
              className="flex flex-col gap-2 p-3 rounded-[10px] border border-app-border bg-app-surface-container">
              {/* Column select */}
              <div className="flex items-center gap-2">
                <select value={rule.columnKey}
                  onChange={e => updateRule(rule.id, { columnKey: e.target.value })}
                  className="flex-1 rounded-[8px] border border-app-border bg-app-surface-container px-2 py-1 text-[11.5px] text-app-text-primary outline-none focus:border-app-accent transition-colors">
                  {columns.map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
                <button onClick={() => deleteRule(rule.id)}
                  className="p-1 rounded-[6px] text-app-text-tertiary hover:text-app-feedback-danger hover:bg-app-surface-hover transition-colors"
                  title="删除规则">
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Operator + Value */}
              <div className="flex items-center gap-2">
                <select value={rule.operator}
                  onChange={e => updateRule(rule.id, { operator: e.target.value as ConditionRule['operator'] })}
                  className="w-[60px] rounded-[8px] border border-app-border bg-app-surface-container px-2 py-1 text-[11.5px] text-app-text-primary outline-none focus:border-app-accent transition-colors">
                  {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input value={rule.value}
                  onChange={e => updateRule(rule.id, { value: e.target.value })}
                  placeholder="值"
                  className="flex-1 rounded-[8px] border border-app-border bg-app-surface-container px-2 py-1 text-[11.5px] text-app-text-primary outline-none placeholder:text-app-text-tertiary focus:border-app-accent transition-colors" />
              </div>

              {/* Style select */}
              <select value={rule.style}
                onChange={e => updateRule(rule.id, { style: e.target.value as ConditionRule['style'] })}
                className="rounded-[8px] border border-app-border bg-app-surface-container px-2 py-1 text-[11.5px] text-app-text-primary outline-none focus:border-app-accent transition-colors">
                {Object.entries(STYLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{STYLE_BADGES[k]} {v}</option>
                ))}
              </select>

              {/* Summary badge */}
              {col && (
                <span className="text-[10px] text-app-text-tertiary">
                  {col.label} {OPERATOR_LABELS[rule.operator]} {rule.value || '?'} → {STYLE_BADGES[rule.style]} {STYLE_LABELS[rule.style]}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Add rule button */}
      <button onClick={addRule}
        disabled={columns.length === 0}
        className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] text-[12px] font-medium
                   border border-dashed border-app-border text-app-text-secondary
                   hover:border-app-accent hover:text-app-accent hover:bg-app-accent-soft
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        <Plus size={14} />
        添加规则
      </button>
    </div>
  );
}