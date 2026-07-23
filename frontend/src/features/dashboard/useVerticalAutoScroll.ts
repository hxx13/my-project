import { useCallback, useEffect, useMemo, useRef } from "react";
import { useModalOverlayOpen } from "@/lib/useModalOverlayOpen";

export type VerticalAutoScrollOptions = {
  pauseStartMs?: number;
  pauseEndMs?: number;
  msPerPx?: number;
  enabled?: boolean;
  /** 内容不足以滚动时的兜底等待（毫秒），到时触发 onCycleComplete */
  fallbackTimeoutMs?: number;
  /** 单轮滚完回调（用于切换 Tab）；loop 模式下不调用 */
  onCycleComplete?: () => void;
  resetKey?: unknown;
  /** loop=同 Tab 内反复滚动；cycle=滚一轮后回调（默认） */
  mode?: "loop" | "cycle";
  /** cycle 模式下上下往返次数（默认 1，即只向下滚一次）。>1 时向下滚到底再滚回去再滚到底… */
  roundTrips?: number;
  /** 用户手动滚动后恢复自动滚动的等待毫秒（与排行榜 UnifiedRankingCard 一致） */
  userResumeMs?: number;
};

export type VerticalAutoScrollHandlers = {
  onScroll: () => void;
};

function waitMs(ms: number, alive: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(() => {
      if (alive()) resolve();
    }, ms);
    void id;
  });
}

/** 等待布局稳定后再测量 scrollHeight（避免 h-full 首帧为 0） */
async function waitForLayout(box: HTMLDivElement, alive: () => boolean): Promise<void> {
  for (let i = 0; i < 8; i++) {
    if (!alive()) return;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (box.scrollHeight > box.clientHeight + 2) return;
    await waitMs(80, alive);
  }
}

/**
 * 纵向自动滚动：cycle 模式滚一轮后 onCycleComplete；loop 模式同 Tab 内循环。
 * 用户 wheel / 触摸 / 手动滚动时暂停自动滚动，若干秒后从当前位置续滚（与排行榜一致）。
 */
export function useVerticalAutoScroll(
  ref: React.RefObject<HTMLDivElement | null>,
  opts: VerticalAutoScrollOptions = {}
): VerticalAutoScrollHandlers {
  const {
    pauseStartMs = 1500,
    pauseEndMs = 2000,
    msPerPx = 35,
    enabled = true,
    fallbackTimeoutMs = 8000,
    onCycleComplete,
    resetKey,
    mode = "cycle",
    roundTrips = 1,
    userResumeMs = 8000,
  } = opts;
  const onCycleCompleteRef = useRef(onCycleComplete);
  onCycleCompleteRef.current = onCycleComplete;
  const modalOverlayOpen = useModalOverlayOpen();

  const isProgrammaticRef = useRef(false);
  const userPausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const cancelAnimationRef = useRef<(() => void) | null>(null);

  /** 用户交互时立即停止程序滚动，并在 idle 后恢复（重复交互会顺延恢复时间） */
  const pauseForUser = useCallback(() => {
    userPausedRef.current = true;
    cancelAnimationRef.current?.();
    cancelAnimationRef.current = null;
    if (frameIdRef.current != null) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    if (resumeTimerRef.current != null) {
      clearTimeout(resumeTimerRef.current);
    }
    resumeTimerRef.current = setTimeout(() => {
      userPausedRef.current = false;
      resumeTimerRef.current = null;
    }, userResumeMs);
  }, [userResumeMs]);

  const markUserScroll = useCallback(() => {
    if (isProgrammaticRef.current) return;
    pauseForUser();
  }, [pauseForUser]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current != null) {
        clearTimeout(resumeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || modalOverlayOpen) return;
    const box = ref.current;
    if (!box) return;

    let alive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const isAlive = () => alive;

    const clearTimers = () => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (frameIdRef.current != null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
      cancelAnimationRef.current = null;
    };

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => resolve(), ms);
      });

    const waitWhileUserPaused = async () => {
      while (alive && userPausedRef.current) {
        await wait(120);
        if (!alive) return;
      }
    };

    const scrollTo = (target: number, durationMs: number) =>
      new Promise<void>((resolve) => {
        const startTop = box.scrollTop;
        const delta = target - startTop;
        if (Math.abs(delta) < 1) {
          resolve();
          return;
        }
        const startTime = performance.now();

        const finish = () => {
          cancelAnimationRef.current = null;
          frameIdRef.current = null;
          // 延后清除标记，避免 scroll 事件误判为用户手动滚动
          requestAnimationFrame(() => {
            isProgrammaticRef.current = false;
          });
          resolve();
        };

        const step = (now: number) => {
          if (!alive || userPausedRef.current) {
            finish();
            return;
          }
          isProgrammaticRef.current = true;
          const progress = Math.min(1, (now - startTime) / durationMs);
          box.scrollTop = startTop + delta * progress;
          if (progress < 1) {
            frameIdRef.current = requestAnimationFrame(step);
          } else {
            box.scrollTop = target;
            finish();
          }
        };

        cancelAnimationRef.current = finish;
        frameIdRef.current = requestAnimationFrame(step);
      });

    const runCycle = async () => {
      box.scrollTop = 0;
      while (alive) {
        if (!box.isConnected) return;
        await waitForLayout(box, isAlive);
        if (!alive) return;

        const distance = Math.max(0, box.scrollHeight - box.clientHeight);
        if (distance <= 2) {
          await wait(fallbackTimeoutMs);
          if (!alive) return;
          if (mode === "cycle") {
            onCycleCompleteRef.current?.();
            return;
          }
          continue;
        }

        const trips = mode === "cycle" ? Math.max(1, roundTrips) : 1;
        for (let t = 0; t < trips; t++) {
          await waitWhileUserPaused();
          if (!alive) return;

          const currentTop = box.scrollTop;
          const remainingDown = Math.max(0, distance - currentTop);

          if (remainingDown <= 2) {
            if (t === 0 && mode === "cycle") {
              await wait(fallbackTimeoutMs);
              if (!alive) return;
              onCycleCompleteRef.current?.();
              return;
            }
            if (mode === "loop") {
              await wait(pauseEndMs);
              if (!alive) return;
              box.scrollTop = 0;
              await wait(pauseStartMs);
              if (!alive) return;
              break;
            }
            continue;
          }

          if (t === 0) {
            await wait(pauseStartMs);
            if (!alive) return;
          }

          await waitWhileUserPaused();
          if (!alive) return;

          const downMs = Math.max(1200, remainingDown * msPerPx);
          await scrollTo(distance, downMs);
          if (!alive) return;

          await waitWhileUserPaused();
          if (!alive) return;

          await wait(pauseEndMs);
          if (!alive) return;

          if (t < trips - 1) {
            await waitWhileUserPaused();
            if (!alive) return;
            const upMs = Math.max(1200, distance * msPerPx);
            await scrollTo(0, upMs);
            if (!alive) return;
            await wait(pauseStartMs);
            if (!alive) return;
          }
        }

        if (mode === "cycle") {
          onCycleCompleteRef.current?.();
          return;
        }

        await waitWhileUserPaused();
        if (!alive) return;
        box.scrollTop = 0;
        await wait(pauseStartMs);
        if (!alive) return;
      }
    };

    userPausedRef.current = false;
    void runCycle();
    return () => {
      alive = false;
      clearTimers();
    };
  }, [
    ref,
    enabled,
    modalOverlayOpen,
    pauseStartMs,
    pauseEndMs,
    msPerPx,
    fallbackTimeoutMs,
    resetKey,
    mode,
    roundTrips,
  ]);

  // capture + passive：在自动滚动的 rAF 写入 scrollTop 之前暂停，避免与用户滚轮抢控制权
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const onUserIntent = () => pauseForUser();
    box.addEventListener("wheel", onUserIntent, { passive: true, capture: true });
    box.addEventListener("touchstart", onUserIntent, { passive: true, capture: true });
    box.addEventListener("touchmove", onUserIntent, { passive: true, capture: true });
    return () => {
      box.removeEventListener("wheel", onUserIntent, { capture: true });
      box.removeEventListener("touchstart", onUserIntent, { capture: true });
      box.removeEventListener("touchmove", onUserIntent, { capture: true });
    };
  }, [ref, pauseForUser, enabled]);

  return useMemo(
    () => ({
      onScroll: markUserScroll,
    }),
    [markUserScroll]
  );
}
