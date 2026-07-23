import { dailyCronToTime, timeToDailyCron } from "./scheduleTime";

type Props = {
  value?: string | null;
  onChange: (cron: string) => void;
  label?: string;
};

export function AutoApproveDailyTimeField({ value, onChange, label = "每天触发时间" }: Props) {
  const timeValue = dailyCronToTime(value);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-[var(--twin-ink)]">{label}</label>
      <input
        type="time"
        className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 text-sm text-[var(--twin-ink)]"
        value={timeValue}
        step={60}
        onChange={(e) => onChange(timeToDailyCron(e.target.value))}
      />
      <p className="text-[11px] text-[var(--twin-mute)]">每天在上述时刻自动尝试审批（精确到分钟）。</p>
    </div>
  );
}
