import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AreaChartPoint {
  label: string;
  value: number;
}

interface AreaChartProps {
  data: AreaChartPoint[];
  /** 固定高度；不传则撑满父容器 */
  height?: number;
  color?: string;
  className?: string;
}

/**
 * 单序列面积图（进出趋势）。
 *
 * 手写 SVG，不引三方图表库：一条折线 + 渐变填充 + Y 轴刻度 + X 轴日期。
 * 宽高用 ResizeObserver 跟随容器（固定 viewBox 拉伸会让圆点/描边变形）。
 */
export function AreaChart({ data, height, color = "var(--student-primary)", className }: AreaChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const gradId = useId().replace(/:/g, "");
  const [size, setSize] = useState({ w: 640, h: height ?? 200 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0) setSize({ w: r.width, h: height ?? Math.max(80, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const width = size.w;
  const chartH = height ?? size.h;

  const padL = 30;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = Math.max(1, chartH - padT - padB);
  const maxV = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;

  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (innerW * i) / (n - 1));
  const y = (v: number) => padT + innerH - (v / maxV) * innerH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const baseY = (padT + innerH).toFixed(1);
  const area = n > 0 ? `${line} L${x(n - 1).toFixed(1)},${baseY} L${x(0).toFixed(1)},${baseY} Z` : "";

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxV * i) / ticks));
  const labelStep = Math.max(1, Math.ceil(n / 8));

  return (
    <div ref={ref} className={cn("w-full", height == null && "h-full", className)} style={height != null ? { height } : undefined}>
      <svg width={width} height={chartH}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => {
          const gy = y(t);
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={padL + innerW}
                y1={gy}
                y2={gy}
                stroke="var(--student-hairline)"
                strokeWidth={1}
                strokeDasharray={i === 0 ? undefined : "3 4"}
              />
              <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize={9} fill="var(--student-mute-foreground)">
                {t}
              </text>
            </g>
          );
        })}

        {area && <path d={area} fill={`url(#${gradId})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}

        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r={2.5} fill="var(--student-canvas)" stroke={color} strokeWidth={1.8} />
        ))}

        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null;
          return (
            <text key={i} x={x(i)} y={chartH - 6} textAnchor="middle" fontSize={9} fill="var(--student-mute-foreground)">
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export type { AreaChartProps, AreaChartPoint };
