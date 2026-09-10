import { useEffect, useRef, useState, useCallback } from "react";

const EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
];

interface UseIdleTimeoutOptions {
  timeoutMs: number;
  warningMs: number;
  onTimeout: () => void;
  /**
   * 是否启用。false 时既不挂定时器也不注册全局事件监听（用于「只在某种模式下才倒计时」，
   * 例如镜像模式；默认 true 会让所有用到本 hook 的视图都倒计时退出）。
   */
  enabled?: boolean;
}

export function useIdleTimeout({ timeoutMs, warningMs, onTimeout, enabled = true }: UseIdleTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningIntervalRef.current) {
      clearInterval(warningIntervalRef.current);
      warningIntervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    setRemainingSeconds(0);
    if (!enabled) return;

    timeoutRef.current = setTimeout(() => {
      setShowWarning(true);
      const warnStart = Date.now();
      const totalWarnMs = warningMs;
      setRemainingSeconds(Math.ceil(totalWarnMs / 1000));

      warningIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - warnStart;
        const remaining = Math.max(0, Math.ceil((totalWarnMs - elapsed) / 1000));
        setRemainingSeconds(remaining);
        if (remaining <= 0) {
          clearTimers();
          setShowWarning(false);
          onTimeoutRef.current();
        }
      }, 500);
    }, timeoutMs);
  }, [timeoutMs, warningMs, clearTimers, enabled]);

  useEffect(() => {
    reset();

    if (!enabled) {
      return () => clearTimers();
    }

    const handler = () => reset();

    EVENTS.forEach((event) => {
      window.addEventListener(event, handler, { passive: true });
    });

    return () => {
      clearTimers();
      EVENTS.forEach((event) => {
        window.removeEventListener(event, handler);
      });
    };
  }, [reset, clearTimers, enabled]);

  return { showWarning, remainingSeconds };
}
