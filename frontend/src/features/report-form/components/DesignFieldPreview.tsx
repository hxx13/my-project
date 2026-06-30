/**
 * 设计页字段控件预览：可展开下拉、切换勾选等，仅本地状态，不写填报数据。
 * 交互区域标记 data-design-interactive，与格子十字选中/拖选隔离。
 */
import { useState, useEffect, useRef } from 'react';
import type { FieldDefinition, CellAlign } from '../types';
import { useFieldOptionSets } from '../hooks/useFieldOptionSets';
import { stopDesignGridBubble } from '../utils/designGridInteraction';
import { GRID_CELL_INPUT_CLASS, GRID_CELL_TEXT_WRAP_CLASS, gridCellContentAlignClass, gridCellFlexJustifyClass, cellTextAlignStyle } from '../utils/gridCellLayout';
import { GridCellDatetimeField } from './GridCellDatetimeField';
import UserSelector from './UserSelector';
import { Check, ChevronDown } from 'lucide-react';

/** 设计页预览控件：限制在列宽内，避免撑开表格 */
const DESIGN_PREVIEW_INPUT_CLASS =
  GRID_CELL_INPUT_CLASS + ' box-border max-w-full min-w-0';

function fieldTypeHint(field: FieldDefinition): string {
  switch (field.type) {
    case 'TEXT':
      return field.maxLength ? `文本 · 最长${field.maxLength}字` : '文本';
    case 'NUMBER': {
      const parts = ['数字'];
      if (field.min != null && field.max != null) parts.push(`${field.min}~${field.max}`);
      else if (field.min != null) parts.push(`≥${field.min}`);
      else if (field.max != null) parts.push(`≤${field.max}`);
      return parts.join(' · ');
    }
    case 'SELECT':
      return '— 请选择 —';
    case 'MULTI_SELECT':
      return '— 多选 —';
    case 'DATETIME':
      return '日期时间';
    case 'BOOLEAN':
      return '是 / 否';
    case 'USER':
      return '请选择人员';
    case 'IMAGE':
      return '图片链接';
    case 'FILE':
      return '📎 填报页可上传文件';
    case 'AUTO_USER':
      return '（保存时自动记录）';
    default:
      return field.label || '字段';
  }
}

/** 未选中格子：仅展示类型提示，不渲染可交互控件 */
export function DesignFieldCompact({ field, cellAlign = 'center' }: { field: FieldDefinition; cellAlign?: CellAlign }) {
  const hint = fieldTypeHint(field);
  return (
    <span className={`block w-full min-w-0 max-w-full text-xs text-[var(--app-color-text-tertiary)] truncate ${gridCellContentAlignClass(cellAlign)}`}>
      {hint}
    </span>
  );
}

interface ShellProps {
  cellId: string;
  onFocusCell?: (cellId: string, shiftKey: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

function PreviewShell({ cellId, onFocusCell, children, className = '' }: ShellProps) {
  const handleMouseDown = (e: React.MouseEvent) => {
    // 仅选中格子，不取消已选；不 preventDefault，保证 button/input 的 click 正常
    stopDesignGridBubble(e);
    onFocusCell?.(cellId, e.shiftKey);
  };

  return (
    <div
      data-design-interactive
      className={`relative w-full min-w-0 max-w-full ${className}`}
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>
  );
}

function SelectPreview({
  field,
  getFieldOptions,
  cellId,
  cellAlign = 'center',
  onFocusCell,
}: {
  field: FieldDefinition;
  getFieldOptions: (f: FieldDefinition) => { label: string; value: string }[];
  cellId: string;
  cellAlign?: CellAlign;
  onFocusCell?: (cellId: string, shiftKey: boolean) => void;
}) {
  const opts = getFieldOptions(field);
  const [previewValue, setPreviewValue] = useState('');
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentLabel = opts.find(o => o.value === previewValue)?.label;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <PreviewShell cellId={cellId} onFocusCell={onFocusCell}>
      <div ref={ref} className="relative w-full min-w-0 max-w-full">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          className="w-full flex items-start gap-1 rounded-[6px] border border-transparent
                     bg-transparent px-2 py-1.5 text-xs outline-none transition-all cursor-pointer min-h-[28px]
                     hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)]"
        >
          <span className={`min-w-0 flex-1 ${gridCellContentAlignClass(cellAlign)} ${GRID_CELL_TEXT_WRAP_CLASS} ${previewValue ? 'text-[var(--app-color-text-primary)]' : 'text-[var(--app-color-text-tertiary)]'}`}>
            {currentLabel || previewValue || (opts.length > 0 ? '— 请选择 —' : '（暂无选项）')}
          </span>
          <ChevronDown className={`w-3 h-3 shrink-0 text-[var(--app-color-text-tertiary)] transition-all ${hover || open ? 'opacity-100' : 'opacity-60'}`} />
        </button>
        {open && (
          <div
            className="absolute top-full left-0 mt-1 w-full max-w-full rounded-[var(--app-radius-container)]
                       border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)]
                       shadow-lg z-[var(--z-dropdown)] py-1 max-h-[220px] overflow-y-auto"
            onPointerDown={stopDesignGridBubble}
            onMouseDown={stopDesignGridBubble}
          >
            {opts.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-[var(--app-color-text-tertiary)] italic text-center">
                点击工具栏「管理选项」添加
              </p>
            ) : (
              opts.map((opt, i) => {
                const isSel = opt.value === previewValue;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setPreviewValue(opt.value); setOpen(false); }}
                    className={`w-full px-3 py-1.5 text-[12px] text-left transition-colors
                      ${isSel ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] font-medium' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}
                      ${i % 2 === 0 ? '' : 'border-t border-[var(--app-color-border)]/[0.2]'}`}
                  >
                    {opt.label}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </PreviewShell>
  );
}

function MultiSelectPreview({
  field,
  getFieldOptions,
  cellId,
  cellAlign = 'center',
  onFocusCell,
}: {
  field: FieldDefinition;
  getFieldOptions: (f: FieldDefinition) => { label: string; value: string }[];
  cellId: string;
  cellAlign?: CellAlign;
  onFocusCell?: (cellId: string, shiftKey: boolean) => void;
}) {
  const opts = getFieldOptions(field);
  const [selected, setSelected] = useState<string[]>([]);
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

  const toggleOption = (optValue: string) => {
    setSelected(prev =>
      prev.includes(optValue) ? prev.filter(v => v !== optValue) : [...prev, optValue],
    );
  };

  return (
    <PreviewShell cellId={cellId} onFocusCell={onFocusCell}>
      <div ref={ref} className="relative w-full min-w-0 max-w-full">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-start gap-1 rounded-[6px] border border-transparent
                     bg-transparent px-2 py-1.5 text-xs outline-none transition-all cursor-pointer min-h-[28px]
                     hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)]"
        >
          <span className={`min-w-0 flex-1 ${gridCellContentAlignClass(cellAlign)} ${GRID_CELL_TEXT_WRAP_CLASS} ${selected.length > 0 ? 'text-[var(--app-color-text-primary)]' : 'text-[var(--app-color-text-tertiary)]'}`}>
            {selected.length > 0 ? selected.join('、') : (opts.length > 0 ? '— 多选 —' : '（暂无选项）')}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[var(--app-color-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div
            className="absolute top-full left-0 mt-1 w-full max-w-full rounded-[var(--app-radius-container)]
                       border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)]
                       shadow-lg z-[var(--z-dropdown)] py-1 max-h-[220px] overflow-y-auto"
            onPointerDown={stopDesignGridBubble}
            onMouseDown={stopDesignGridBubble}
          >
            {opts.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-[var(--app-color-text-tertiary)] italic text-center">点击工具栏「管理选项」添加</p>
            ) : (
              opts.map((opt, i) => {
                const isChecked = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleOption(opt.value)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left transition-colors
                      ${isChecked ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-text-primary)]' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}
                      ${i % 2 === 0 ? '' : 'border-t border-[var(--app-color-border)]/[0.3]'}`}
                  >
                    <span className={`w-4 h-4 rounded-[3px] border-2 flex items-center justify-center shrink-0 ${
                      isChecked
                        ? 'bg-[var(--app-color-accent)] border-[var(--app-color-accent)] text-white'
                        : 'border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]'
                    }`}>
                      {isChecked && <Check className="w-2.5 h-2.5" />}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </PreviewShell>
  );
}

interface Props {
  field: FieldDefinition;
  fields: Record<string, FieldDefinition>;
  cellId: string;
  cellAlign?: CellAlign;
  onFocusCell?: (cellId: string, shiftKey: boolean) => void;
}

export default function DesignFieldPreview({ field, fields, cellId, cellAlign = 'center', onFocusCell }: Props) {
  const { getFieldOptions } = useFieldOptionSets(fields);

  const inputClass = DESIGN_PREVIEW_INPUT_CLASS;

  switch (field.type) {
    case 'SELECT':
      return (
        <SelectPreview
          field={field}
          getFieldOptions={getFieldOptions}
          cellId={cellId}
          cellAlign={cellAlign}
          onFocusCell={onFocusCell}
        />
      );
    case 'MULTI_SELECT':
      return (
        <MultiSelectPreview
          field={field}
          getFieldOptions={getFieldOptions}
          cellId={cellId}
          cellAlign={cellAlign}
          onFocusCell={onFocusCell}
        />
      );
    case 'BOOLEAN':
      return <BooleanPreview cellId={cellId} cellAlign={cellAlign} onFocusCell={onFocusCell} />;
    case 'TEXT':
      return <TextPreview field={field} cellId={cellId} cellAlign={cellAlign} onFocusCell={onFocusCell} inputClass={inputClass} />;
    case 'NUMBER':
      return <NumberPreview field={field} cellId={cellId} cellAlign={cellAlign} onFocusCell={onFocusCell} inputClass={inputClass} />;
    case 'DATETIME':
      return <DatetimePreview cellId={cellId} cellAlign={cellAlign} onFocusCell={onFocusCell} />;
    case 'USER':
      return (
        <PreviewShell cellId={cellId} onFocusCell={onFocusCell} className="w-full min-w-0 max-w-full">
          <UserSelectorPreview field={field} />
        </PreviewShell>
      );
    case 'IMAGE':
      return <ImagePreview cellId={cellId} onFocusCell={onFocusCell} inputClass={inputClass} />;
    case 'FILE':
      return (
        <PreviewShell cellId={cellId} onFocusCell={onFocusCell} className="flex-col gap-1">
          <span className="text-[10px] text-[var(--app-color-text-tertiary)] px-2 py-1 rounded-[4px] border border-dashed border-[var(--app-color-border)]">
            📎 填报页可上传文件
          </span>
        </PreviewShell>
      );
    case 'AUTO_USER':
      return (
        <PreviewShell cellId={cellId} onFocusCell={onFocusCell}>
          <span className="text-[11px] italic text-[var(--app-color-text-tertiary)]">（保存时自动记录）</span>
        </PreviewShell>
      );
    default:
      return (
        <PreviewShell cellId={cellId} onFocusCell={onFocusCell}>
          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">字段</span>
        </PreviewShell>
      );
  }
}

function BooleanPreview({ cellId, cellAlign = 'center', onFocusCell }: { cellId: string; cellAlign?: CellAlign; onFocusCell?: Props['onFocusCell'] }) {
  const [checked, setChecked] = useState(false);
  return (
    <PreviewShell cellId={cellId} onFocusCell={onFocusCell}>
      <div className={`flex w-full ${gridCellFlexJustifyClass(cellAlign)}`}>
      <button
        type="button"
        onClick={() => setChecked(v => !v)}
        className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center transition-colors ${
          checked
            ? 'bg-[var(--app-color-accent)] border-[var(--app-color-accent)] text-white'
            : 'border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] hover:border-[var(--app-color-accent)]'
        }`}
      >
        {checked && <Check className="w-3 h-3" />}
      </button>
      </div>
    </PreviewShell>
  );
}

function TextPreview({
  field, cellId, cellAlign = 'center', onFocusCell, inputClass,
}: {
  field: FieldDefinition;
  cellId: string;
  cellAlign?: CellAlign;
  onFocusCell?: Props['onFocusCell'];
  inputClass: string;
}) {
  const [value, setValue] = useState('');
  const hint = field.maxLength ? `文本 · 最长${field.maxLength}字` : '文本';
  return (
    <PreviewShell cellId={cellId} onFocusCell={onFocusCell}>
      <input type="text" value={value} onChange={e => setValue(e.target.value)} className={inputClass} style={{ textAlign: cellTextAlignStyle(cellAlign) }} placeholder={hint} />
    </PreviewShell>
  );
}

function NumberPreview({
  field, cellId, cellAlign = 'center', onFocusCell, inputClass,
}: {
  field: FieldDefinition;
  cellId: string;
  cellAlign?: CellAlign;
  onFocusCell?: Props['onFocusCell'];
  inputClass: string;
}) {
  const [value, setValue] = useState('');
  const parts: string[] = ['数字'];
  if (field.min != null && field.max != null) parts.push(`${field.min}~${field.max}`);
  else if (field.min != null) parts.push(`≥${field.min}`);
  else if (field.max != null) parts.push(`≤${field.max}`);
  return (
    <PreviewShell cellId={cellId} onFocusCell={onFocusCell}>
      <input type="number" value={value} onChange={e => setValue(e.target.value)} className={inputClass} style={{ textAlign: cellTextAlignStyle(cellAlign) }} placeholder={parts.join(' · ')} />
    </PreviewShell>
  );
}

function DatetimePreview({
  cellId, cellAlign = 'center', onFocusCell,
}: {
  cellId: string;
  cellAlign?: CellAlign;
  onFocusCell?: Props['onFocusCell'];
}) {
  const [value, setValue] = useState('');
  return (
    <PreviewShell cellId={cellId} onFocusCell={onFocusCell}>
      <GridCellDatetimeField
        value={value}
        onChange={v => setValue(v ?? '')}
        align={cellAlign}
      />
    </PreviewShell>
  );
}

function UserSelectorPreview({ field }: { field: FieldDefinition }) {
  const [value, setValue] = useState('');
  return (
    <UserSelector value={value} onChange={setValue} multi={field.props?.multi === true} />
  );
}

function ImagePreview({
  cellId, onFocusCell, inputClass,
}: {
  cellId: string;
  onFocusCell?: Props['onFocusCell'];
  inputClass: string;
}) {
  const [value, setValue] = useState('');
  return (
    <PreviewShell cellId={cellId} onFocusCell={onFocusCell} className="flex-col gap-1">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        className={`${inputClass} text-left`}
        placeholder="粘贴图片链接预览"
      />
      {value ? (
        <img
          src={value}
          alt="预览"
          className="max-w-[120px] max-h-[60px] rounded-[var(--app-radius-xs)] object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : null}
    </PreviewShell>
  );
}

export function fieldNeedsOverflowVisible(type: string | undefined): boolean {
  return type === 'SELECT' || type === 'MULTI_SELECT' || type === 'USER';
}
