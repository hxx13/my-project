import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const XL_MEDIA = "(min-width: 1280px)";
/** 对齐 AdminLayout 顶栏 h-16，并留少量间距 */
const STICKY_TOP_PX = 80;

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * 宽屏下将统计配置/清算记录侧栏固定在视口内（不受 main overflow-x-hidden 影响的 sticky 失效问题）。
 * 高度随内容自适应；仅当内容高于视口剩余空间时在侧栏内独立滚动。
 */
export function AnalyticsReportStickyRail({ children, className }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [xl, setXl] = useState(false);
  const [anchorMinH, setAnchorMinH] = useState<number | undefined>(undefined);
  const [fixedBox, setFixedBox] = useState<{ left: number; width: number } | null>(null);

  const sync = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const isXl = window.matchMedia(XL_MEDIA).matches;
    setXl(isXl);

    if (!isXl) {
      setAnchorMinH(undefined);
      setFixedBox(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    setFixedBox({ left: rect.left, width: rect.width });
    setAnchorMinH(panel.scrollHeight);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    sync();

    const ro = new ResizeObserver(() => sync());
    ro.observe(panel);

    const mq = window.matchMedia(XL_MEDIA);
    const onMq = () => sync();
    mq.addEventListener("change", onMq);
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onMq);
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  return (
    <div
      ref={anchorRef}
      className="w-full shrink-0 xl:w-72"
      style={xl && anchorMinH != null ? { minHeight: anchorMinH } : undefined}
    >
      <aside
        ref={panelRef}
        className={cn(
          className,
          xl &&
            "fixed z-30 overflow-y-auto overscroll-y-contain [scrollbar-width:thin] xl:pr-0.5"
        )}
        style={
          xl && fixedBox
            ? {
                left: fixedBox.left,
                width: fixedBox.width,
                top: STICKY_TOP_PX,
                maxHeight: `calc(100dvh - ${STICKY_TOP_PX}px)`,
              }
            : undefined
        }
      >
        {children}
      </aside>
    </div>
  );
}
