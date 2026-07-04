import { useEffect, useState } from "react";

type Options = {
  /** 每秒字符数 */
  cps?: number;
  /** false 时一次性展示全文 */
  enabled?: boolean;
};

/**
 * 逐字打出文案；`enabled=false` 或 `cps<=0` 时立即展示全文。
 */
export function useTypewriterText(fullText: string, options: Options = {}) {
  const { cps = 32, enabled = true } = options;
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const text = fullText.trim();
    if (!text) {
      setDisplayed("");
      setDone(false);
      return;
    }

    if (!enabled || cps <= 0) {
      setDisplayed(text);
      setDone(true);
      return;
    }

    setDisplayed("");
    setDone(false);
    let index = 0;
    const delayMs = Math.max(16, Math.round(1000 / cps));
    const timer = window.setInterval(() => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) {
        setDone(true);
        window.clearInterval(timer);
      }
    }, delayMs);

    return () => window.clearInterval(timer);
  }, [fullText, enabled, cps]);

  return {
    displayed,
    done,
    isTyping: Boolean(fullText.trim()) && enabled && !done,
  };
}

/** 是否应降级为即时展示（无打字机动效） */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}
