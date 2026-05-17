import { cn } from "@/lib/utils";

/** 默认回溯 90 天（含） */
export function defaultBackfillUntilDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

/** 日期选择上限：昨日 */
export function maxBackfillUntilDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

type Props = {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  untilDate: string;
  onUntilDateChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
};

export function HistoryBackfillField({
  enabled,
  onEnabledChange,
  untilDate,
  onUntilDateChange,
  disabled,
  className,
}: Props) {
  const maxDate = maxBackfillUntilDate();

  return (
    <div className={cn("space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/80 p-3", className)}>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-2",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-violet-600"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <span className="text-sm text-neutral-800">
          生成历史清算记录
          <span className="mt-0.5 block text-[11px] font-normal text-neutral-500">
            按已选对比周期，从指定日期起向最近已结束区间补齐（已存在记录自动跳过）
          </span>
        </span>
      </label>
      {enabled ? (
        <div className="pl-6">
          <label className="mb-1 block text-xs font-semibold text-neutral-600">回溯至（含）</label>
          <input
            type="date"
            max={maxDate}
            value={untilDate}
            disabled={disabled}
            onChange={(e) => onUntilDateChange(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-neutral-400">
            每日最多回溯 {366} 天；周/月按周期上限自动截断
          </p>
        </div>
      ) : null}
    </div>
  );
}
