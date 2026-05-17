import { COMPARE_CYCLE_OPTIONS, type AnalyticsCompareCycle } from "@/features/analytics/analyticsPipelineFilter";
import { cn } from "@/lib/utils";

type Props = {
  value: AnalyticsCompareCycle[];
  onChange: (next: AnalyticsCompareCycle[]) => void;
};

export function CompareCyclesField({ value, onChange }: Props) {
  const toggle = (cycle: AnalyticsCompareCycle) => {
    if (value.includes(cycle)) {
      const next = value.filter((c) => c !== cycle);
      onChange(next.length ? next : [cycle]);
    } else {
      onChange([...value, cycle]);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-neutral-600">清算对比（至少选一项）</p>
      <div className="flex flex-wrap gap-2">
        {COMPARE_CYCLE_OPTIONS.map((opt) => {
          const active = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs transition",
                active
                  ? "border-violet-400 bg-violet-50 text-violet-900"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-200"
              )}
            >
              <span className="font-semibold">{opt.label}</span>
              <span className="mt-0.5 block text-[10px] text-neutral-500">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
