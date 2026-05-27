import { useEffect, useRef } from "react";

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
};

function waitMs(ms: number, alive: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(() => {
      if (alive()) resolve();
    }, ms);
    // caller cancels via alive flag; timeout still resolves once
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
 */
export function useVerticalAutoScroll(
  ref: React.RefObject<HTMLDivElement | null>,
  opts: VerticalAutoScrollOptions = {}
) {
  const {
    pauseStartMs = 1500,
    pauseEndMs = 2000,
    msPerPx = 35,
    enabled = true,
    fallbackTimeoutMs = 8000,
    onCycleComplete,
    resetKey,
    mode = "cycle",
  } = opts;
  const onCycleCompleteRef = useRef(onCycleComplete);
  onCycleCompleteRef.current = onCycleComplete;

  useEffect(() => {
    if (!enabled) return;
    const box = ref.current;
    if (!box) return;

    let alive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let frameId: number | null = null;
    const isAlive = () => alive;

    const clearTimers = () => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (frameId != null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => resolve(), ms);
      });

    const scrollTo = (target: number, durationMs: number) =>
      new Promise<void>((resolve) => {
        const startTop = box.scrollTop;
        const delta = target - startTop;
        const startTime = performance.now();
        const step = (now: number) => {
          if (!alive) return resolve();
          const progress = Math.min(1, (now - startTime) / durationMs);
          box.scrollTop = startTop + delta * progress;
          if (progress < 1) {
            frameId = requestAnimationFrame(step);
          } else {
            box.scrollTop = target;
            resolve();
          }
        };
        frameId = requestAnimationFrame(step);
      });

    const runCycle = async () => {
      while (alive) {
        if (!box.isConnected) return;
        box.scrollTop = 0;
        await waitForLayout(box, isAlive);
        if (!alive) return;

        await wait(pauseStartMs);
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

        const durationMs = Math.max(1200, distance * msPerPx);
        await scrollTo(distance, durationMs);
        if (!alive) return;

        await wait(pauseEndMs);
        if (!alive) return;

        if (mode === "cycle") {
          onCycleCompleteRef.current?.();
          return;
        }
        // loop：回顶继续
        box.scrollTop = 0;
      }
    };

    void runCycle();
    return () => {
      alive = false;
      clearTimers();
    };
  }, [ref, enabled, pauseStartMs, pauseEndMs, msPerPx, fallbackTimeoutMs, resetKey, mode]);
}
