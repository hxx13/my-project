/**
 * 填报格日期时间：自定义融合面板（月历 + 时刻），首次激活自动展开。
 */
import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CellAlign } from '../types';
import {
  combineDatetimeParts,
  formatDatetimeDisplay,
  parseDatetimeParts,
} from '../utils/reportFormFieldValue';
import { DatetimePickerPanel } from './DatetimePickerPanel';
import { gridCellContentAlignClass } from '../utils/gridCellLayout';

const TRIGGER_CLASS =
  'w-full flex items-center gap-1 min-w-0 max-w-full rounded-[6px] border border-transparent ' +
  'bg-transparent px-2 py-1.5 text-xs outline-none transition-all cursor-pointer min-h-[28px] ' +
  'hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)]';

const POPOVER_CLASS =
  'absolute top-full left-0 mt-1 rounded-[var(--app-radius-container)] ' +
  'border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)] ' +
  'shadow-lg z-[var(--z-dropdown)] p-2';

interface Props {
  value: unknown;
  onChange?: (value: string | undefined) => void;
  align?: CellAlign;
  className?: string;
  onPointerDown?: (e: React.PointerEvent | React.MouseEvent) => void;
}

export function GridCellDatetimeField({
  value,
  onChange,
  align = 'center',
  className = '',
  onPointerDown,
}: Props) {
  const parsed = parseDatetimeParts(value);
  const [open, setOpen] = useState(true);
  const [showTime, setShowTime] = useState(parsed.hasExplicitTime);
  const [date, setDate] = useState(parsed.date);
  const [time, setTime] = useState(parsed.time || '09:00');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = parseDatetimeParts(value);
    setDate(next.date);
    setTime(next.time || '09:00');
    setShowTime(next.hasExplicitTime);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const emit = (nextDate: string, nextTime: string, includeTime: boolean) => {
    onChange?.(combineDatetimeParts(nextDate, nextTime, includeTime));
  };

  const stopBubble = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    onPointerDown?.(e);
  };

  const display = formatDatetimeDisplay(value);

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    emit(nextDate, time, showTime && !!nextDate);
  };

  const handleTimeChange = (nextTime: string) => {
    setTime(nextTime);
    if (date) emit(date, nextTime, true);
  };

  const handleShowTimeChange = (next: boolean) => {
    setShowTime(next);
    if (date) emit(date, time, next);
  };

  return (
    <div
      ref={ref}
      className={`relative w-full min-w-0 max-w-full ${className}`}
      data-design-interactive
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${TRIGGER_CLASS} ${open ? 'border-[var(--app-color-accent)] bg-[var(--app-color-surface-page)]' : ''}`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${gridCellContentAlignClass(align)} ${
            display ? 'text-[var(--app-color-text-primary)]' : ''
          }`}
        >
          {display}
        </span>
        <ChevronDown
          className={`w-3 h-3 shrink-0 text-[var(--app-color-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={POPOVER_CLASS}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <DatetimePickerPanel
            date={date}
            time={time}
            showTime={showTime}
            onDateChange={handleDateChange}
            onTimeChange={handleTimeChange}
            onShowTimeChange={handleShowTimeChange}
          />
        </div>
      )}
    </div>
  );
}

export default GridCellDatetimeField;
