import { cn } from "@/lib/utils";

interface BarChartDataItem {
  label: string;
  value: number;
  value2?: number;
}

interface BarChartProps {
  data: BarChartDataItem[];
  height?: number;
  barColor?: string;
  barColor2?: string;
  showLabel?: boolean;
  showValue?: boolean;
  className?: string;
}

export function BarChart({
  data,
  height = 120,
  barColor = "var(--student-primary)",
  barColor2,
  showLabel = true,
  showValue = true,
  className,
}: BarChartProps) {
  // For stacked bars, max = largest sum so the tallest bar fits in container
  const maxValue = Math.max(...data.map((d) => barColor2 ? (d.value + (d.value2 ?? 0)) : d.value), 1);

  return (
    <div
      className={cn("flex items-end justify-around gap-[6px]", className)}
      style={{ height }}
    >
      {data.map((item) => {
        const hasDual = barColor2 != null && item.value2 != null;
        const bar1H = (item.value / maxValue) * height;
        const bar2H = hasDual ? ((item.value2!) / maxValue) * height : 0;
        const totalH = hasDual ? bar1H + bar2H : bar1H;

        return (
          <div
            key={item.label}
            className="flex flex-col items-center"
            style={{ height: "100%", justifyContent: "flex-end" }}
          >
            {hasDual ? (
              <div style={{ height: Math.max(totalH, 1), width: "24px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                {item.value2! > 0 && (
                  <div className="w-full flex items-center justify-center"
                    style={{ height: Math.max(bar2H, 18), backgroundColor: barColor2, borderRadius: item.value > 0 ? undefined : "4px 4px 0 0" }}>
                    <span className="text-[9px] font-semibold text-[var(--student-ink)]">{item.value2}</span>
                  </div>
                )}
                {item.value > 0 && (
                  <div className="w-full flex items-center justify-center"
                    style={{ height: Math.max(bar1H, 18), backgroundColor: barColor, borderRadius: item.value2! > 0 ? undefined : "4px 4px 0 0" }}>
                    <span className="text-[9px] font-semibold text-white">{item.value}</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                {showValue && (
                  <span className="mb-[4px] text-[10px] font-semibold text-[var(--student-ink)] leading-tight text-center">
                    {item.value}
                  </span>
                )}
                <div
                  className="w-[24px] rounded-t-[4px] flex items-center justify-center"
                  style={{ height: Math.max(bar1H, 2), backgroundColor: barColor }}
                >
                  {showValue && bar1H > 12 && (
                    <span className="text-[9px] font-semibold text-white drop-shadow-sm">{item.value}</span>
                  )}
                </div>
              </>
            )}
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
