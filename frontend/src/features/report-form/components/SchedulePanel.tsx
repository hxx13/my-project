// components/SchedulePanel.tsx — 填报周期与时间窗口配置
import type { ScheduleJson } from '../types';

interface Props {
  schedule: ScheduleJson;
  onChange: (schedule: ScheduleJson) => void;
}

const inputClass = "w-full rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";
const labelClass = "text-[10px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block";

export default function SchedulePanel({ schedule, onChange }: Props) {
  const update = (patch: Partial<ScheduleJson>) => onChange({ ...schedule, ...patch });

  return (
    <div className="p-3 space-y-3 overflow-y-auto">
      <h3 className="text-xs font-semibold text-[var(--app-color-text-primary)] uppercase tracking-wider">时间与周期</h3>

      {/* Period */}
      <div>
        <label className={labelClass}>填报周期</label>
        <select value={schedule.period || 'manual'}
          onChange={e => update({ period: e.target.value as ScheduleJson['period'] })}
          className={inputClass}>
          <option value="manual">手动（不自动重复）</option>
          <option value="daily">每日</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
        </select>
      </div>

      {schedule.period === 'weekly' && (
        <div>
          <label className={labelClass}>每周第几天</label>
          <select value={schedule.dayOfWeek || 1}
            onChange={e => update({ dayOfWeek: Number(e.target.value) })}
            className={inputClass}>
            <option value={1}>周一</option>
            <option value={2}>周二</option>
            <option value={3}>周三</option>
            <option value={4}>周四</option>
            <option value={5}>周五</option>
            <option value={6}>周六</option>
            <option value={7}>周日</option>
          </select>
        </div>
      )}

      {schedule.period === 'monthly' && (
        <div>
          <label className={labelClass}>每月第几天</label>
          <input type="number" min={1} max={28} value={schedule.dayOfMonth || 1}
            onChange={e => update({ dayOfMonth: Number(e.target.value) })}
            className={inputClass} />
        </div>
      )}

      {schedule.period !== 'manual' && (
        <>
          <div className="border-t border-[var(--app-color-border)] pt-3" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>开放时间</label>
              <input type="time" value={schedule.timeWindowStart || ''}
                onChange={e => update({ timeWindowStart: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>关闭时间</label>
              <input type="time" value={schedule.timeWindowEnd || ''}
                onChange={e => update({ timeWindowEnd: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>过期宽限期（天）</label>
            <input type="number" min={0} max={30} value={schedule.graceDays || 0}
              onChange={e => update({ graceDays: Number(e.target.value) })}
              className={inputClass} />
            <p className="text-[9px] text-[var(--app-color-text-tertiary)] mt-0.5">
              窗口关闭后允许补填的天数，0=不允许补填
            </p>
          </div>
        </>
      )}
    </div>
  );
}
