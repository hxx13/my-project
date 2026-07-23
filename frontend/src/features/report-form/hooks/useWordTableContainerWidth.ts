import { useEffect, useRef, useState } from 'react';

/** Word 表格容器宽度，用于列宽铺满（仅网页展示，不影响导出） */
export function useWordTableContainerWidth(enabled: boolean): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerWidth: number;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setContainerWidth(0);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);

  return { containerRef, containerWidth };
}
