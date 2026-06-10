// ConditionalFormatPanel — 条件格式规则管理器（规则独立于面板开关）
import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { ColumnConfig } from '@/features/smartsheet/types';

export interface ConditionRule {
  id: string;
  target: 'sheet' | 'column' | 'row';
  targetKey?: string;
  operator: 'gte' | 'lte' | 'eq' | 'contains' | 'ne' | 'gt' | 'lt';
  value: string;
  style: 'great' | 'warn' | 'bad';
  bg?: boolean;
}

interface Props {
  columns: ColumnConfig[];
  rules: ConditionRule[];
  onRulesChange: (rules: ConditionRule[]) => void;
  open: boolean;
  onClose: () => void;
}

const OPS: Record<string, string> = { gte: '≥', lte: '≤', eq: '=', ne: '≠', gt: '>', lt: '<', contains: '包含' };
const STYLES: { value: ConditionRule['style']; label: string }[] = [
  { value: 'great', label: '🟢 达标' },
  { value: 'warn', label: '🟡 警告' },
  { value: 'bad', label: '🔴 危险' },
];

let _id = 0;
function uid() { return `cr_${Date.now()}_${_id++}`; }

export default function ConditionalFormatPanel({ columns, rules, onRulesChange, open, onClose }: Props) {
  const addRule = () => onRulesChange([...rules, { id: uid(), target: 'sheet', operator: 'eq', value: '', style: 'warn' }]);
  const updRule = (id: string, patch: Partial<ConditionRule>) => onRulesChange(rules.map(r => r.id === id ? { ...r, ...patch } : r));
  const delRule = (id: string) => onRulesChange(rules.filter(r => r.id !== id));

  if (!open) return null;

  return (
    <div className="fixed top-16 right-4 w-[420px] max-h-[70vh] overflow-y-auto rounded-[14px] border border-app-border bg-app-surface-elevated shadow-xl p-4 z-[var(--z-modal)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-app-text-primary">⚡ 条件格式规则</h3>
        <button onClick={onClose} className="text-app-text-tertiary hover:text-app-text-primary"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-[10px] text-app-text-tertiary mb-2">规则始终生效，关闭面板不影响。</p>

      {rules.length === 0 && <p className="text-[11px] text-app-text-tertiary mb-3">暂无规则，点击下方按钮添加。</p>}

      <div className="space-y-2 mb-3">
        {rules.map(r => (
          <div key={r.id} className="p-2 rounded-[10px] border border-app-border bg-app-surface-container space-y-1.5">
            <div className="flex items-center gap-1.5">
              <select value={r.target} onChange={e => updRule(r.id, { target: e.target.value as ConditionRule['target'], targetKey: undefined })}
                className="text-[11px] px-1.5 py-1 rounded-[6px] border border-app-border bg-transparent text-app-text-primary">
                <option value="sheet">整个表格</option>
                <option value="column">指定列</option>
                <option value="row">指定行</option>
              </select>
              <button onClick={() => delRule(r.id)} className="ml-auto text-app-text-tertiary hover:text-app-feedback-danger"><Trash2 className="w-3 h-3" /></button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <select value={r.operator} onChange={e => updRule(r.id, { operator: e.target.value as ConditionRule['operator'] })}
                className="text-[11px] px-1.5 py-1 rounded-[6px] border border-app-border bg-transparent text-app-text-primary w-16">
                {Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={r.value} onChange={e => updRule(r.id, { value: e.target.value })} placeholder="值"
                className="flex-1 min-w-[60px] text-[11px] px-2 py-1 rounded-[6px] border border-app-border bg-transparent text-app-text-primary outline-none" />
              <select value={r.style} onChange={e => updRule(r.id, { style: e.target.value as ConditionRule['style'] })}
                className="text-[11px] px-1.5 py-1 rounded-[6px] border border-app-border bg-transparent text-app-text-primary">
                {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <label className="flex items-center gap-1 text-[10px] text-app-text-secondary cursor-pointer">
                <input type="checkbox" checked={r.bg || false} onChange={e => updRule(r.id, { bg: e.target.checked })} />底色
              </label>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addRule}
        className="w-full py-1.5 rounded-[8px] border border-dashed border-app-border text-[11px] text-app-text-secondary hover:border-app-accent hover:text-app-accent transition-colors flex items-center justify-center gap-1">
        <Plus className="w-3 h-3" /> 添加规则
      </button>
    </div>
  );
}

// ── Evaluate rules against a cell ──
export function evaluateRules(cellValue: string, colKey: string, rowId: string, rules: ConditionRule[]): string {
  for (const rule of rules) {
    if (rule.target === 'column' && rule.targetKey !== colKey) continue;
    if (rule.target === 'row' && rule.targetKey !== `row:${rowId}`) continue;
    if (!evalCondition(cellValue, rule.operator, rule.value)) continue;
    const cls = `smartsheet-cf-${rule.style}`;
    return rule.bg ? `${cls} cf-bg` : cls;
  }
  return '';
}

function evalCondition(cellVal: string, op: ConditionRule['operator'], ruleVal: string): boolean {
  const nCell = parseFloat(cellVal), nRule = parseFloat(ruleVal);
  const numeric = !isNaN(nCell) && !isNaN(nRule);
  switch (op) {
    case 'gte': return numeric && nCell >= nRule;
    case 'lte': return numeric && nCell <= nRule;
    case 'gt': return numeric && nCell > nRule;
    case 'lt': return numeric && nCell < nRule;
    case 'eq': return cellVal === ruleVal;
    case 'ne': return cellVal !== ruleVal;
    case 'contains': return cellVal.toLowerCase().includes(ruleVal.toLowerCase());
    default: return false;
  }
}
