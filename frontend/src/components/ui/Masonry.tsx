import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Masonry — 自适应列数的瀑布流。
 *
 * 为什么不用 CSS 多栏（`columns-[240px]`）：那样列宽是写死的，只有 1~2 个子文件夹时
 * 它们会被钉成一条窄柱、右边全空着。这里按**容器宽度算列数**，每列 flex-1 ——
 * 一个就占满整行、两个各占一半、多了才自动分栏。
 *
 * 也不按行对齐：每列各排各的，矮卡片下面不会拖出一整行高的空白。
 * 代价是视觉顺序变成「先竖后横」；DOM 顺序不变，所以 Tab 顺序与拖拽语义都不受影响。
 */
export function Masonry<T>({
  items,
  minColumnWidth,
  gap = 16,
  getKey,
  renderItem,
}: {
  items: T[];
  /** 期望的列宽下限：容器比它宽就多分一栏，窄了就减 */
  minColumnWidth: number;
  gap?: number;
  getKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);

  // useLayoutEffect：首帧就把列数算准，否则会先闪一下「全挤在一列」
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (!w) return;
      setCols(Math.max(1, Math.min(items.length, Math.floor((w + gap) / (minColumnWidth + gap)))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, minColumnWidth, gap]);

  /** 轮流投放到各列，避免某一列特别长；列数变化时重算 */
  const buckets = useMemo(() => {
    const n = Math.max(1, cols);
    const out: T[][] = Array.from({ length: n }, () => []);
    items.forEach((it, i) => out[i % n].push(it));
    return out;
  }, [items, cols]);

  return (
    <div ref={ref} className="flex items-start" style={{ gap }}>
      {buckets.map((bucket, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col" style={{ gap }}>
          {bucket.map((item) => (
            <div key={getKey(item)} className="min-w-0">
              {renderItem(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default Masonry;
