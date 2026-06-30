/**
 * 融合式日期时间面板：月历 + 可选时刻（无浏览器原生 date/time 控件）
 */
import { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildMonthGrid,
  formatHm,
  formatYmd,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  parseHm,
  parseYmd,
  todayYmd,
  WEEKDAY_LABELS,
} from '../utils/datetimePickerCalendar';

const SELECT_CLASS =
  'rounded-[4px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] ' +
  'px-1.5 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none ' +
  'focus:border-[var(--app-color-accent)]';

interface Props {
  date: string;
  time: string;
  showTime: boolean;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onShowTimeChange: (show: boolean) => void;
}

export function DatetimePickerPanel({
  date,
  time,
  showTime,
  onDateChange,
  onTimeChange,
  onShowTimeChange,
}: Props) {
  const parsed = parseYmd(date);
  const today = todayYmd();
  const [viewYear, setViewYear] = useState(parsed?.year ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? new Date().getMonth() + 1);

  useEffect(() => {
    const p = parseYmd(date);
    if (p) {
      setViewYear(p.year);
      setViewMonth(p.month);
    }
  }, [date]);

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const { hour, minute } = parseHm(time);

  const shiftMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setViewYear(y);
    setViewMonth(m);
  };

  const pickDay = (day: number) => {
    onDateChange(formatYmd(viewYear, viewMonth, day));
  };

  return (
    <div className="w-[248px] select-none">
      <div className="flex items-center justify-between gap-1 mb-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="p-1 rounded-[4px] text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"
          aria-label="上个月"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[12px] font-medium text-[var(--app-color-text-primary)]">
          {viewYear}年{viewMonth}月
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="p-1 rounded-[4px] text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"
          aria-label="下个月"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAY_LABELS.map(label => (
          <div
            key={label}
            className="text-center text-[10px] text-[var(--app-color-text-tertiary)] py-0.5"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (day == null) {
            return <div key={`e-${idx}`} className="h-7" />;
          }
          const ymd = formatYmd(viewYear, viewMonth, day);
          const selected = date === ymd;
          const isToday = today === ymd;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => pickDay(day)}
              className={`h-7 rounded-[4px] text-[11px] transition-colors ${
                selected
                  ? 'bg-[var(--app-color-accent)] text-white font-medium'
                  : isToday
                    ? 'text-[var(--app-color-accent)] font-medium hover:bg-[var(--app-color-accent-soft)]'
                    : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--app-color-border)]/[0.35]">
        <button
          type="button"
          onClick={() => onDateChange(today)}
          className="text-[10px] text-[var(--app-color-accent)] hover:underline"
        >
          今天
        </button>
        <button
          type="button"
          onClick={() => {
            onDateChange('');
            onShowTimeChange(false);
          }}
          className="text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-secondary)]"
        >
          清除
        </button>
      </div>

      <div className="mt-2 pt-2 border-t border-[var(--app-color-border)]/[0.35]">
        {showTime ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-[var(--app-color-text-tertiary)] shrink-0">时间</span>
            <select
              value={hour}
              onChange={e => onTimeChange(formatHm(Number(e.target.value), minute))}
              className={SELECT_CLASS}
              aria-label="时"
            >
              {HOUR_OPTIONS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}时</option>
              ))}
            </select>
            <select
              value={minute}
              onChange={e => onTimeChange(formatHm(hour, Number(e.target.value)))}
              className={SELECT_CLASS}
              aria-label="分"
            >
              {MINUTE_OPTIONS.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}分</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onShowTimeChange(false)}
              className="ml-auto text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)]"
            >
              仅日期
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onShowTimeChange(true)}
            className="w-full text-left text-[11px] text-[var(--app-color-accent)] hover:underline py-0.5"
          >
            选时间
          </button>
        )}
      </div>
    </div>
  );
}

export default DatetimePickerPanel;
