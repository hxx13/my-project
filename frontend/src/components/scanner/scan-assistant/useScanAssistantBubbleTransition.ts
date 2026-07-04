import { useEffect, useRef, useState } from "react";
import type { ScanAssistantMessage } from "@/store/useScanAssistantStore";

export const SCAN_ASSISTANT_BUBBLE_EXIT_MS = 180;
export const SCAN_ASSISTANT_BUBBLE_ENTER_MS = 220;

export type ScanAssistantBubblePhase = "entering" | "exiting" | null;

type UseScanAssistantBubbleTransitionOptions = {
  reducedMotion: boolean;
};

/**
 * 解耦 store 中的 activeMessage 与 DOM 渲染：支持退出动画、换人时的 close→open 序列。
 */
export function useScanAssistantBubbleTransition(
  activeMessage: ScanAssistantMessage | null,
  { reducedMotion }: UseScanAssistantBubbleTransitionOptions,
) {
  const [renderedMessage, setRenderedMessage] = useState<ScanAssistantMessage | null>(null);
  const [phase, setPhase] = useState<ScanAssistantBubblePhase>(null);
  const renderedIdRef = useRef<string | null>(null);
  const swapTimerRef = useRef<number | null>(null);

  const exitMs = reducedMotion ? 0 : SCAN_ASSISTANT_BUBBLE_EXIT_MS;
  const enterMs = reducedMotion ? 0 : SCAN_ASSISTANT_BUBBLE_ENTER_MS;

  const clearSwapTimer = () => {
    if (swapTimerRef.current !== null) {
      window.clearTimeout(swapTimerRef.current);
      swapTimerRef.current = null;
    }
  };

  useEffect(() => {
    clearSwapTimer();

    if (!activeMessage) {
      if (!renderedIdRef.current) return;

      if (exitMs === 0) {
        renderedIdRef.current = null;
        setRenderedMessage(null);
        setPhase(null);
        return;
      }

      setPhase("exiting");
      swapTimerRef.current = window.setTimeout(() => {
        renderedIdRef.current = null;
        setRenderedMessage(null);
        setPhase(null);
        swapTimerRef.current = null;
      }, exitMs);

      return clearSwapTimer;
    }

    if (renderedIdRef.current === activeMessage.id) {
      return;
    }

    const showNext = () => {
      renderedIdRef.current = activeMessage.id;
      setRenderedMessage(activeMessage);
      if (enterMs === 0) {
        setPhase(null);
        return;
      }
      setPhase("entering");
      swapTimerRef.current = window.setTimeout(() => {
        setPhase(null);
        swapTimerRef.current = null;
      }, enterMs);
    };

    if (!renderedIdRef.current) {
      showNext();
      return clearSwapTimer;
    }

    // 流式 loading 应立即展示，不等待上一条退出动画
    if (activeMessage.isStreaming) {
      showNext();
      return clearSwapTimer;
    }

    if (exitMs === 0) {
      showNext();
      return clearSwapTimer;
    }

    setPhase("exiting");
    swapTimerRef.current = window.setTimeout(showNext, exitMs);
    return clearSwapTimer;
  }, [activeMessage?.id, activeMessage?.personKey, activeMessage === null, enterMs, exitMs]);

  useEffect(() => {
    if (!activeMessage || renderedIdRef.current !== activeMessage.id) return;
    setRenderedMessage(activeMessage);
  }, [activeMessage?.id, activeMessage?.text, activeMessage?.isStreaming, activeMessage]);

  return { renderedMessage, phase };
}
