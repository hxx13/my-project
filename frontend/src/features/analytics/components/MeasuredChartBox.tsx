import { useEffect, useRef, useState, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

type Props = {
  height: number;
  className?: string;
  children: ReactNode;
};

/**
 * 仅在容器测得正宽/高时挂载 Recharts，避免折叠、fixed 布局或首帧 flex 导致的 width(-1)/height(-1) 警告。
 */
export function MeasuredChartBox({ height, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 0 && h > 0) {
        setDims({ w, h });
      } else {
        setDims(null);
      }
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  return (
    <div
      ref={ref}
      className={cn("w-full min-w-0", className)}
      style={{ height, minHeight: height }}
    >
      {dims ? (
        <ResponsiveContainer width={dims.w} height={dims.h} debounce={50}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
