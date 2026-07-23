import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { CellAlign } from '../types';
import { FillCellTextBox } from './FillCellTextBox';

import { gridCellContentAlignClass } from '../utils/gridCellLayout';

type OptionItem = { label: string; value: string };

interface SelectLayoutProps {
  colWidth?: number;
  baseColWidth?: number;
  fontSize?: number;
  bold?: boolean;
  align?: CellAlign;
}

interface SelectProps extends SelectLayoutProps {
  options: OptionItem[];
  value: unknown;
  onChange: (value: string) => void;
  editable: boolean;
}

interface MultiSelectProps extends SelectLayoutProps {
  options: OptionItem[];
  value: unknown;
  onChange: (value: string[]) => void;
  editable: boolean;
  /** 已选展示文案（标签拼接），用于列宽/换行测算 */
  displayText?: string;
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string' && v.startsWith('[')) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return v != null ? [String(v)] : [];
}

function SelectValueText({
  text,
  placeholder,
  layout,
  primary,
  className = '',
}: {
  text: string;
  placeholder?: string;
  layout: SelectLayoutProps;
  primary?: boolean;
  className?: string;
}) {
  const { colWidth, baseColWidth, fontSize = 12, bold } = layout;
  if (colWidth != null && baseColWidth != null) {
    return (
      <FillCellTextBox
        text={text}
        colWidth={colWidth}
        baseColWidth={baseColWidth}
        fontSize={fontSize}
        bold={bold}
        className={`${primary
          ? 'text-[var(--app-color-text-primary)]'
          : 'text-[var(--app-color-text-tertiary)]'} ${className}`}
        empty={placeholder ?? ''}
      />
    );
  }
  return (
    <span className={`block min-w-0 flex-1 truncate whitespace-nowrap ${primary ? 'text-[var(--app-color-text-primary)]' : 'text-[var(--app-color-text-tertiary)]'} ${className}`}>
      {text || placeholder || ''}
    </span>
  );
}

export function GridCellSelectField({ options, value, onChange, editable, colWidth, baseColWidth, fontSize, bold, align }: SelectProps) {
  const currentVal = String(value ?? '');
  const currentLabel = options.find(o => o.value === currentVal)?.label;
  const display = currentLabel || currentVal;
  const layout = { colWidth, baseColWidth, fontSize, bold, align };
  const valueAlignClass = gridCellContentAlignClass(align);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (!editable) {
    return (
      <SelectValueText
        text={display}
        layout={layout}
        className="text-xs text-[var(--app-color-text-secondary)]"
      />
    );
  }

  return (
    <div ref={ref} className="relative w-full min-w-0 max-w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="w-full flex items-start gap-1 rounded-[6px] border border-transparent
                   bg-transparent px-2 py-1.5 text-xs text-[var(--app-color-text-primary)] outline-none
                   transition-all hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)]
                   cursor-pointer min-h-[28px] min-w-0"
      >
        <div className={`min-w-0 flex-1 ${valueAlignClass}`}>
          <SelectValueText
            text={display}
            placeholder=""
            layout={layout}
            primary={!!currentVal}
          />
        </div>
        <ChevronDown className={`w-3 h-3 shrink-0 text-[var(--app-color-text-tertiary)] transition-all ${hover || open ? 'opacity-100' : 'opacity-0'}`} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-full min-w-[160px] rounded-[var(--app-radius-container)]
                     border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)]
                     shadow-lg z-[var(--z-dropdown)] py-1 max-h-[220px] overflow-y-auto"
        >
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full px-3 py-1.5 text-[12px] text-left transition-colors italic
              ${!currentVal ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]' : 'text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]'}`}
          >
            空白
          </button>
          {options.map((opt, i) => {
            const isSel = opt.value === currentVal;
            return (
              <button
                key={`${opt.value}-${i}`}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-[12px] text-left transition-colors
                  ${isSel ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] font-medium' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}
                  ${i % 2 === 0 ? '' : 'border-t border-[var(--app-color-border)]/[0.2]'}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GridCellMultiSelectField({
  options, value, onChange, editable, displayText, colWidth, baseColWidth, fontSize, bold, align,
}: MultiSelectProps) {
  const selected = toArray(value);
  const labelsText = displayText ?? (selected.length > 0 ? selected.join('、') : '');
  const layout = { colWidth, baseColWidth, fontSize, bold, align };
  const valueAlignClass = gridCellContentAlignClass(align);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggleOption = (optValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = selected.includes(optValue)
      ? selected.filter(v => v !== optValue)
      : [...selected, optValue];
    onChange(next);
  };

  if (!editable) {
    return (
      <SelectValueText
        text={labelsText}
        layout={layout}
        className="text-xs text-[var(--app-color-text-secondary)]"
      />
    );
  }

  return (
    <div ref={ref} className="relative w-full min-w-0 max-w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-1 rounded-[6px] border border-transparent
                   bg-transparent px-2 py-1.5 text-xs outline-none transition-all
                   hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)]
                   cursor-pointer min-h-[28px] min-w-0"
      >
        <div className={`min-w-0 flex-1 ${valueAlignClass}`}>
          <SelectValueText
            text={labelsText}
            placeholder=""
            layout={layout}
            primary={selected.length > 0}
          />
        </div>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[var(--app-color-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-full min-w-[180px] rounded-[var(--app-radius-container)]
                     border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)]
                     shadow-lg z-[var(--z-dropdown)] py-1 max-h-[220px] overflow-y-auto"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-[var(--app-color-text-tertiary)] italic text-center">空白</p>
          ) : (
            options.map((opt, i) => {
              const isChecked = selected.includes(opt.value);
              return (
                <button
                  key={`${opt.value}-${i}`}
                  type="button"
                  onClick={(e) => toggleOption(opt.value, e)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left transition-colors
                    ${isChecked ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-text-primary)]' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}
                    ${i % 2 === 0 ? '' : 'border-t border-[var(--app-color-border)]/[0.3]'}`}
                >
                  <span className={`w-4 h-4 rounded-[3px] border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isChecked
                      ? 'bg-[var(--app-color-accent)] border-[var(--app-color-accent)] text-white'
                      : 'border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]'
                  }`}>
                    {isChecked && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span className="min-w-0 truncate">{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
