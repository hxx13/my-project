/** 手机版下拉刷新（房间页等）；手动按钮冷却与小程序一致，下拉不受冷却限制 */
import { useCallback, useRef, useState, type RefObject } from "react";

const PULL_THRESHOLD = 56;
const PULL_MAX = 72;

export function useMobilePullToRefresh(
  onRefresh: () => Promise<void>,
  scrollRef: RefObject<HTMLElement | null>,
) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0 || refreshing) return;
    startYRef.current = e.touches[0].clientY;
    pullingRef.current = true;
  }, [scrollRef, refreshing]);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pullingRef.current || refreshing) return;
      const el = scrollRef.current;
      if (!el || el.scrollTop > 0) {
        pullingRef.current = false;
        setPullDistance(0);
        return;
      }
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        setPullDistance(Math.min(dy, PULL_MAX));
      }
    },
    [scrollRef, refreshing],
  );

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    const shouldRefresh = pullDistance >= PULL_THRESHOLD;
    setPullDistance(0);
    if (!shouldRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [pullDistance, refreshing, onRefresh]);

  const indicatorVisible = pullDistance > 8 || refreshing;
  const indicatorProgress = refreshing ? 1 : Math.min(1, pullDistance / PULL_THRESHOLD);

  return {
    refreshing,
    pullDistance,
    indicatorVisible,
    indicatorProgress,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
