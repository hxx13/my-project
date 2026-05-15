import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

type Props = {
  option: EChartsOption;
  className?: string;
  style?: CSSProperties;
};

/**
 * 容器尺寸变化时 resize ECharts（Twin 全屏、侧栏折叠、模式切换后父级高度变化）。
 */
export function CockpitAutoResizeChart({ option, className, style }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance()?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fromOption =
    typeof (option as { height?: unknown }).height === "number" ? (option as { height: number }).height : undefined;
  /** 父级传 height:100% 时仍保留像素下限，避免 flex 链短暂为 0 时 ECharts 绘图区塌缩 */
  const minH = fromOption ?? (style != null ? 48 : 72);

  return (
    <div ref={wrapRef} className={className} style={style}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: "100%", width: "100%", minHeight: minH }}
        opts={{ renderer: "canvas" }}
        notMerge={false}
        lazyUpdate
      />
    </div>
  );
}
