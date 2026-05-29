import { cn } from "@/lib/utils";

interface BarChartDataItem {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartDataItem[];
  height?: number;
  barColor?: string;
  showLabel?: boolean;
  showValue?: boolean;
  className?: string;
}

export function BarChart({
  data,
  height = 120,
  barColor = "var(--student-primary)",
  showLabel = true,
  showValue = true,
  className,
}: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      className={cn("flex items-end justify-around gap-[6px]", className)}
      style={{ height }}
    >
      {data.map((item) => {
        const barHeight = (item.value / maxValue) * height;
        return (
          <div
            key={item.label}
            className="flex flex-col items-center"
            style={{ height: "100%", justifyContent: "flex-end" }}
          >
            {showValue && (
              <span className="mb-[4px] text-[11px] font-semibold text-[var(--student-ink)]">
                {item.value}
              </span>
            )}
            <div
              className="w-[20px] rounded-t-[4px]"
              style={{
                height: Math.max(barHeight, 2),
                backgroundColor: barColor,
              }}
            />
            {showLabel && (
              <span className="mt-[6px] text-[10px] text-[var(--student-mute)] leading-tight">
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { BarChartProps, BarChartDataItem };
