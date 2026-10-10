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
    let delay = Math.max(16, Math.round(1000 / cps));
    let timer = 0;
    const tick = () => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) {
        setDone(true);
        return;
      }
      /*
       * **前段慢、越往后越快。**
       *
       * 开头按 cps 逐字（看得出「在生成」，不是一下子糊一整块），随后每字间隔按 1.5% 递减。
       * 目的是长回答：700 字的表格逐字打完要 17 秒，人都等走了；这个曲线下同样的文本约 3 秒收尾，
       * 而前十几个字仍然是逐字出来的，观感没变。下限 4ms 是浏览器定时器的实际粒度。
       */
      delay = Math.max(4, delay * 0.985);
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, delay);

    return () => window.clearTimeout(timer);
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
